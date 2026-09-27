import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-error';
import { Categoria, Regra } from '../../core/models/api.models';
import { digitar } from '../../testing/dom';
import { RegraService } from './regra.service';
import { RegrasCategoria } from './regras-categoria';

const CATEGORIAS: Categoria[] = [
  { id: 1, nome: 'Alimentação', tipo: 'DESPESA', padrao: true },
  { id: 2, nome: 'Lazer', tipo: 'DESPESA', padrao: true },
  { id: 10, nome: 'Assinaturas', tipo: 'DESPESA', padrao: false },
  { id: 4, nome: 'Salário', tipo: 'RECEITA', padrao: true },
];

const REGRAS: Regra[] = [
  { id: 5, categoriaId: 10, termo: 'netflix' },
  { id: 6, categoriaId: 1, termo: 'padaria estrela' },
];

describe('RegrasCategoria', () => {
  const listar = vi.fn();
  const criar = vi.fn();
  const atualizar = vi.fn();
  const excluir = vi.fn();
  const aplicar = vi.fn();

  async function montar(categorias: Categoria[] = CATEGORIAS) {
    TestBed.configureTestingModule({
      providers: [
        { provide: RegraService, useValue: { listar, criar, atualizar, excluir, aplicar } },
      ],
    });
    const fixture = TestBed.createComponent(RegrasCategoria);
    fixture.componentRef.setInput('categorias', categorias);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const botaoPorRotulo = (el: HTMLElement, rotulo: string) =>
    el.querySelector<HTMLButtonElement>(`button[aria-label="${rotulo}"]`);
  const botaoPorTexto = (el: HTMLElement, texto: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === texto,
    );
  const textos = (el: HTMLElement) =>
    [...el.querySelectorAll('.regra__texto')].map((t) =>
      t.textContent?.replace(/\s+/g, ' ').trim(),
    );

  function escolherCategoria(el: HTMLElement, seletor: string, nome: string) {
    const select = el.querySelector<HTMLSelectElement>(seletor)!;
    select.selectedIndex = [...select.options].findIndex((o) => o.textContent?.trim() === nome);
    select.dispatchEvent(new Event('change'));
  }

  beforeEach(() => {
    listar.mockReset().mockReturnValue(of(REGRAS));
    criar.mockReset();
    atualizar.mockReset();
    excluir.mockReset();
    aplicar.mockReset();
  });

  it('lista as regras como "descrição contém X → Categoria"', async () => {
    const { el } = await montar();

    expect(textos(el)).toEqual([
      'descrição contém netflix → vai para Assinaturas',
      'descrição contém padaria estrela → vai para Alimentação',
    ]);
  });

  it('sem regras, explica como criar a primeira', async () => {
    listar.mockReturnValue(of([]));
    const { el } = await montar();

    expect(el.querySelector('.regras__vazio')?.textContent).toContain('Você ainda não tem regras');
    expect(el.querySelector('.regras__lista')).toBeNull();
  });

  it('mostra o erro ao carregar', async () => {
    listar.mockReturnValue(throwError(() => new ApiError(500, 'Erro interno do servidor')));
    const { el } = await montar();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Erro interno do servidor');
  });

  it('as ações de cada regra têm nome acessível com o termo', async () => {
    const { el } = await montar();

    expect(botaoPorRotulo(el, 'Editar a regra netflix')).not.toBeNull();
    expect(botaoPorRotulo(el, 'Excluir a regra netflix')).not.toBeNull();
    expect(botaoPorRotulo(el, 'Aplicar ao histórico a regra netflix')).not.toBeNull();
  });

  describe('criar', () => {
    it('cria a regra (termo sem espaços nas pontas), avisa e recarrega', async () => {
      criar.mockReturnValue(of({ id: 9, categoriaId: 2, termo: 'spotify' }));
      const { fixture, el } = await montar();

      digitar(el, '#regra-novo-termo', '  Spotify ');
      escolherCategoria(el, '#regra-nova-categoria', 'Lazer');
      el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();

      expect(criar).toHaveBeenCalledWith({ termo: 'Spotify', categoriaId: 2 });
      expect(el.querySelector('[role="status"]')?.textContent).toContain('spotify');
      expect(el.querySelector('[role="status"]')?.textContent).toContain('Lazer');
      expect(listar).toHaveBeenCalledTimes(2);
      expect(el.querySelector<HTMLInputElement>('#regra-novo-termo')?.value).toBe('');
    });

    it('exige termo (3+ caracteres) e categoria, sem chamar a API', async () => {
      const { fixture, el } = await montar();

      digitar(el, '#regra-novo-termo', 'ab');
      el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();

      const erros = [...el.querySelectorAll('.campo__erro')].map((e) => e.textContent?.trim());
      expect(erros).toEqual(['Use no mínimo 3 caracteres.', 'Campo obrigatório.']);
      expect(criar).not.toHaveBeenCalled();
    });

    it('mostra o erro da API (termo repetido) e mantém o que foi digitado', async () => {
      criar.mockReturnValue(
        throwError(() => new ApiError(409, 'Já existe uma regra para "netflix"')),
      );
      const { fixture, el } = await montar();

      digitar(el, '#regra-novo-termo', 'netflix');
      escolherCategoria(el, '#regra-nova-categoria', 'Lazer');
      el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();

      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Já existe uma regra');
      expect(el.querySelector<HTMLInputElement>('#regra-novo-termo')?.value).toBe('netflix');
    });
  });

  describe('editar', () => {
    it('abre com o termo e a categoria atuais, salva as mudanças e recarrega', async () => {
      atualizar.mockReturnValue(of({ id: 5, categoriaId: 2, termo: 'netflix com' }));
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Editar a regra netflix')!.click();
      await fixture.whenStable();
      expect(el.querySelector<HTMLInputElement>('#regra-edicao-termo')?.value).toBe('netflix');
      expect(
        el
          .querySelector<HTMLSelectElement>('#regra-edicao-categoria')
          ?.selectedOptions[0].textContent?.trim(),
      ).toBe('Assinaturas');

      digitar(el, '#regra-edicao-termo', ' netflix com ');
      escolherCategoria(el, '#regra-edicao-categoria', 'Lazer');
      el.querySelector('.regra__edicao')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();

      expect(atualizar).toHaveBeenCalledWith(5, { termo: 'netflix com', categoriaId: 2 });
      expect(el.querySelector('.regra__edicao')).toBeNull();
      expect(listar).toHaveBeenCalledTimes(2);
    });

    it('cancelar fecha a edição sem chamar a API', async () => {
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Editar a regra netflix')!.click();
      await fixture.whenStable();
      botaoPorTexto(el, 'Cancelar')!.click();
      await fixture.whenStable();

      expect(el.querySelector('.regra__edicao')).toBeNull();
      expect(atualizar).not.toHaveBeenCalled();
    });

    it('termo curto demais: avisa e não chama a API', async () => {
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Editar a regra netflix')!.click();
      await fixture.whenStable();
      digitar(el, '#regra-edicao-termo', 'ab');
      el.querySelector('.regra__edicao')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();

      expect(el.querySelector('[role="alert"]')?.textContent).toContain('3 a 100 caracteres');
      expect(atualizar).not.toHaveBeenCalled();
    });
  });

  describe('excluir', () => {
    it('pede confirmação, exclui e recarrega', async () => {
      excluir.mockReturnValue(of(undefined));
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Excluir a regra netflix')!.click();
      await fixture.whenStable();
      expect(excluir).not.toHaveBeenCalled();
      expect(el.querySelector('dialog')?.textContent).toContain('netflix');

      [...el.querySelectorAll<HTMLButtonElement>('dialog button')]
        .find((b) => b.textContent?.trim() === 'Excluir')!
        .click();
      await fixture.whenStable();

      expect(excluir).toHaveBeenCalledWith(5);
      expect(el.querySelector('dialog')).toBeNull();
      expect(el.querySelector('[role="status"]')?.textContent).toContain('excluída');
      expect(listar).toHaveBeenCalledTimes(2);
    });
  });

  describe('aplicar ao histórico', () => {
    it('informa quantas transações mudaram', async () => {
      aplicar.mockReturnValue(of({ afetadas: 9 }));
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Aplicar ao histórico a regra netflix')!.click();
      await fixture.whenStable();

      expect(aplicar).toHaveBeenCalledWith(5);
      expect(el.querySelector('[role="status"]')?.textContent).toContain(
        '9 transações movidas para Assinaturas.',
      );
    });

    it('sem nada para mudar, diz isso', async () => {
      aplicar.mockReturnValue(of({ afetadas: 0 }));
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Aplicar ao histórico a regra netflix')!.click();
      await fixture.whenStable();

      expect(el.querySelector('[role="status"]')?.textContent).toContain(
        'Nenhuma transação precisou mudar',
      );
    });

    it('mostra o erro da API', async () => {
      aplicar.mockReturnValue(throwError(() => new ApiError(404, 'Regra não encontrada')));
      const { fixture, el } = await montar();

      botaoPorRotulo(el, 'Aplicar ao histórico a regra netflix')!.click();
      await fixture.whenStable();

      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Regra não encontrada');
    });
  });

  it('relê as regras quando as categorias mudam (excluir categoria apaga as regras dela)', async () => {
    const { fixture } = await montar();
    listar.mockReturnValue(of([REGRAS[1]]));

    fixture.componentRef.setInput(
      'categorias',
      CATEGORIAS.filter((c) => c.id !== 10),
    );
    await fixture.whenStable();

    expect(listar).toHaveBeenCalledTimes(2);
    expect(textos(fixture.nativeElement as HTMLElement)).toHaveLength(1);
  });
});
