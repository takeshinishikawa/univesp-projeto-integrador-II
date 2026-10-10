import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-error';
import { Categoria } from '../../core/models/api.models';
import { digitar, enviarFormulario, escolher, mensagensDeErro } from '../../testing/dom';
import { RegraService } from '../regras/regra.service';
import { CategoriaService } from './categoria.service';
import { Categorias } from './categorias';
import { violacoesDeAcessibilidade } from '../../testing/a11y';

const LISTA: Categoria[] = [
  { id: 4, nome: 'Salário', tipo: 'RECEITA', padrao: true },
  { id: 1, nome: 'Alimentação', tipo: 'DESPESA', padrao: true },
  { id: 2, nome: 'Outros', tipo: 'DESPESA', padrao: true },
  { id: 10, nome: 'Pets', tipo: 'DESPESA', padrao: false },
];

describe('Categorias', () => {
  const listar = vi.fn();
  const criar = vi.fn();
  const renomear = vi.fn();
  const excluir = vi.fn();

  async function montar() {
    TestBed.configureTestingModule({
      providers: [
        { provide: CategoriaService, useValue: { listar, criar, renomear, excluir } },
        {
          provide: RegraService,
          useValue: { listar: () => of([]), criar: vi.fn(), atualizar: vi.fn(), excluir: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(Categorias);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const botaoPorRotulo = (el: HTMLElement, rotulo: string) =>
    el.querySelector<HTMLButtonElement>(`button[aria-label="${rotulo}"]`);
  const nomesDe = (el: HTMLElement, tipo: 'RECEITA' | 'DESPESA') =>
    Array.from(el.querySelectorAll(`section[aria-labelledby="titulo-${tipo}"] .item__nome`)).map(
      (n) => n.textContent?.trim(),
    );

  beforeEach(() => {
    listar.mockReset().mockReturnValue(of(LISTA));
    criar.mockReset();
    renomear.mockReset();
    excluir.mockReset();
  });

  it('sem violações de acessibilidade (axe-core) com os dados carregados', async () => {
    const { el } = await montar();

    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('separa receitas e despesas; as padrão têm o selo e só as do usuário têm ações', async () => {
    const { el } = await montar();

    expect(nomesDe(el, 'RECEITA')).toEqual(['Salário']);
    expect(nomesDe(el, 'DESPESA')).toEqual(['Alimentação', 'Outros', 'Pets']);
    expect(el.querySelectorAll('.selo')).toHaveLength(3);
    expect(botaoPorRotulo(el, 'Renomear Pets')).not.toBeNull();
    expect(botaoPorRotulo(el, 'Excluir Pets')).not.toBeNull();
    expect(botaoPorRotulo(el, 'Renomear Outros')).toBeNull();
    expect(botaoPorRotulo(el, 'Excluir Outros')).toBeNull();
  });

  it('mostra a seção de regras de categorização abaixo das categorias', async () => {
    const { el } = await montar();

    expect(el.querySelector('app-regras-categoria h2')?.textContent).toContain(
      'Regras de categorização',
    );
  });

  it('mostra o erro ao carregar', async () => {
    listar.mockReturnValue(throwError(() => new ApiError(500, 'Erro interno do servidor')));
    const { el } = await montar();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Erro interno do servidor');
  });

  describe('adicionar', () => {
    it('cria a categoria (sem espaços nas pontas), avisa e recarrega a lista', async () => {
      criar.mockReturnValue(of({ id: 11, nome: 'Assinaturas', tipo: 'DESPESA', padrao: false }));
      const { fixture, el } = await montar();

      digitar(el, '#categoria-nome', '  Assinaturas ');
      escolher(el, '#categoria-tipo', 'RECEITA');
      enviarFormulario(el);
      await fixture.whenStable();

      expect(criar).toHaveBeenCalledWith({ nome: 'Assinaturas', tipo: 'RECEITA' });
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Assinaturas');
      expect(listar).toHaveBeenCalledTimes(2);
      expect(el.querySelector<HTMLInputElement>('#categoria-nome')?.value).toBe('');
    });

    it('exige o nome sem chamar a API', async () => {
      const { fixture, el } = await montar();

      enviarFormulario(el);
      await fixture.whenStable();

      expect(mensagensDeErro(el)).toEqual(['Campo obrigatório.']);
      expect(criar).not.toHaveBeenCalled();
    });

    it('mostra o erro da API (ex.: nome repetido) e mantém o que foi digitado', async () => {
      criar.mockReturnValue(
        throwError(() => new ApiError(409, 'Já existe uma categoria de despesa com esse nome')),
      );
      const { fixture, el } = await montar();

      digitar(el, '#categoria-nome', 'pets');
      enviarFormulario(el);
      await fixture.whenStable();

      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Já existe uma categoria');
      expect(el.querySelector<HTMLInputElement>('#categoria-nome')?.value).toBe('pets');
      expect(listar).toHaveBeenCalledTimes(1);
    });
  });

  describe('renomear', () => {
    it('abre o campo com o nome atual, salva e recarrega', async () => {
      renomear.mockReturnValue(of({ id: 10, nome: 'Animais', tipo: 'DESPESA', padrao: false }));
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Renomear Pets')!.click();
      await fixture.whenStable();
      const campo = el.querySelector<HTMLInputElement>('#categoria-edicao')!;
      expect(campo.value).toBe('Pets');
      const salvar = el.querySelector<HTMLButtonElement>('.item__edicao button[type="submit"]');
      expect(salvar?.disabled).toBe(false); // pronto para salvar assim que o campo abre

      digitar(el, '#categoria-edicao', ' Animais ');
      el.querySelector('.item__edicao')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();

      expect(renomear).toHaveBeenCalledWith(10, 'Animais');
      expect(el.querySelector('#categoria-edicao')).toBeNull();
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Animais');
      expect(listar).toHaveBeenCalledTimes(2);
    });

    it('cancelar fecha o campo sem chamar a API', async () => {
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Renomear Pets')!.click();
      await fixture.whenStable();
      Array.from(el.querySelectorAll<HTMLButtonElement>('.item__edicao button'))
        .find((b) => b.textContent?.includes('Cancelar'))!
        .click();
      await fixture.whenStable();

      expect(el.querySelector('#categoria-edicao')).toBeNull();
      expect(renomear).not.toHaveBeenCalled();
    });

    it('nome vazio não é enviado', async () => {
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Renomear Pets')!.click();
      await fixture.whenStable();
      digitar(el, '#categoria-edicao', '   ');
      el.querySelector('.item__edicao')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();

      expect(renomear).not.toHaveBeenCalled();
      expect(el.querySelector('[role="alert"]')).not.toBeNull();
    });

    it('mostra o erro da API e mantém o campo aberto', async () => {
      renomear.mockReturnValue(throwError(() => new ApiError(409, 'Já existe uma categoria')));
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Renomear Pets')!.click();
      await fixture.whenStable();
      digitar(el, '#categoria-edicao', 'Outros');
      el.querySelector('.item__edicao')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();

      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Já existe');
      expect(el.querySelector('#categoria-edicao')).not.toBeNull();
    });
  });

  describe('excluir', () => {
    const confirmar = (el: HTMLElement) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('dialog button')).find(
        (b) => b.textContent?.trim() === 'Excluir',
      )!;

    it('pede confirmação, exclui e recarrega', async () => {
      excluir.mockReturnValue(of(undefined));
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Excluir Pets')!.click();
      await fixture.whenStable();
      expect(el.querySelector('dialog')?.textContent).toContain('Pets');
      expect(excluir).not.toHaveBeenCalled();

      confirmar(el).click();
      await fixture.whenStable();

      expect(excluir).toHaveBeenCalledWith(10);
      expect(el.querySelector('dialog')).toBeNull();
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Pets');
      expect(listar).toHaveBeenCalledTimes(2);
    });

    it('se a categoria está em uso, mostra o motivo no próprio modal', async () => {
      excluir.mockReturnValue(
        throwError(() => new ApiError(409, 'A categoria está em 3 transação(ões).')),
      );
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Excluir Pets')!.click();
      await fixture.whenStable();
      confirmar(el).click();
      await fixture.whenStable();

      expect(el.querySelector('dialog [role="alert"]')?.textContent).toContain('3 transação');
      expect(listar).toHaveBeenCalledTimes(1);
    });

    it('cancelar fecha o modal sem excluir', async () => {
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Excluir Pets')!.click();
      await fixture.whenStable();
      Array.from(el.querySelectorAll<HTMLButtonElement>('dialog button'))
        .find((b) => b.textContent?.trim() === 'Cancelar')!
        .click();
      await fixture.whenStable();

      expect(el.querySelector('dialog')).toBeNull();
      expect(excluir).not.toHaveBeenCalled();
    });
  });
});
