import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Params } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-error';
import { Categoria, Conta, Transacao } from '../../core/models/api.models';
import { CategoriaService } from '../categorias/categoria.service';
import { ContaService } from '../contas/conta.service';
import { RegraService } from '../regras/regra.service';
import { Transacoes } from './transacoes';
import { TransacaoService } from './transacao.service';

registerLocaleData(localePt);

const categorias: Categoria[] = [
  { id: 1, nome: 'Alimentação', tipo: 'DESPESA', padrao: true },
  { id: 2, nome: 'Lazer', tipo: 'DESPESA', padrao: true },
  { id: 3, nome: 'Salário', tipo: 'RECEITA', padrao: true },
];

const transacoes: Transacao[] = [
  {
    id: 10,
    usuarioId: 1,
    categoriaId: 3,
    descricao: 'Salário de março',
    valor: 4500,
    tipo: 'RECEITA',
    dataTransacao: '2026-03-05',
    contaId: 1,
    createdAt: '2026-03-05T10:00:00.000Z',
  },
  {
    id: 11,
    usuarioId: 1,
    categoriaId: 1,
    descricao: 'Mercado',
    valor: 89.9,
    tipo: 'DESPESA',
    dataTransacao: '2026-03-10',
    contaId: 1,
    createdAt: '2026-03-10T10:00:00.000Z',
  },
];

describe('Transacoes', () => {
  const listar = vi.fn();
  const deletar = vi.fn();
  const recategorizar = vi.fn();
  const excluirVarias = vi.fn();
  const criarRegra = vi.fn();
  const aplicarRegra = vi.fn();
  const moverParaConta = vi.fn();
  const marcarComoTransferencia = vi.fn();
  let consultaDaUrl: Params = {};
  let contas: Conta[] = [];

  async function criar() {
    const fixture = TestBed.createComponent(Transacoes);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    listar.mockReset().mockReturnValue(of(transacoes));
    deletar.mockReset().mockReturnValue(of(undefined));
    recategorizar.mockReset().mockReturnValue(of({ afetadas: 1 }));
    excluirVarias.mockReset().mockReturnValue(of({ afetadas: 1 }));
    criarRegra.mockReset().mockReturnValue(of({ id: 7, categoriaId: 2, termo: 'mercado' }));
    aplicarRegra.mockReset().mockReturnValue(of({ afetadas: 3 }));
    moverParaConta.mockReset().mockReturnValue(of({ afetadas: 1 }));
    marcarComoTransferencia.mockReset().mockReturnValue(of({ transferenciaId: 'abc' }));
    consultaDaUrl = {};
    contas = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: TransacaoService,
          useValue: {
            listar,
            deletar,
            recategorizar,
            excluirVarias,
            moverParaConta,
            marcarComoTransferencia,
          },
        },
        { provide: ContaService, useValue: { listar: () => of(contas) } },
        {
          provide: ActivatedRoute,
          useFactory: () => ({ snapshot: { queryParamMap: convertToParamMap(consultaDaUrl) } }),
        },
        { provide: CategoriaService, useValue: { listar: () => of(categorias) } },
        { provide: RegraService, useValue: { criar: criarRegra, aplicar: aplicarRegra } },
      ],
    });
  });

  it('lista as transações do mês atual numa tabela semântica', async () => {
    const { el } = await criar();
    const hoje = new Date();

    expect(listar).toHaveBeenCalledWith({ mes: hoje.getMonth() + 1, ano: hoje.getFullYear() });
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.querySelectorAll('thead th[scope="col"]').length).toBeGreaterThan(0);
    expect(el.querySelector('tbody th[scope="row"]')?.textContent).toContain('05/03/2026');
    expect(el.textContent).toContain('Salário');
    expect(el.textContent).toContain('Alimentação');
  });

  it('mostra mensagem quando não há transações no período', async () => {
    listar.mockReturnValue(of([]));
    const { el } = await criar();
    expect(el.textContent).toContain('Nenhuma transação neste período.');
    expect(el.querySelector('table')).toBeNull();
  });

  it('os botões de linha têm nome acessível com a descrição', async () => {
    const { el } = await criar();
    expect(el.querySelector('button[aria-label="Editar Mercado"]')).not.toBeNull();
    expect(el.querySelector('button[aria-label="Excluir Mercado"]')).not.toBeNull();
  });

  it('"Nova transação" abre o modal com o formulário', async () => {
    const { fixture, el } = await criar();
    [...el.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Nova transação'))!
      .click();
    await fixture.whenStable();

    expect(el.querySelector('dialog h2')?.textContent).toContain('Nova transação');
    expect(el.querySelector('dialog form')).not.toBeNull();
  });

  it('excluir pede confirmação, chama a API e recarrega a lista', async () => {
    const { fixture, el } = await criar();
    el.querySelector<HTMLButtonElement>('button[aria-label="Excluir Mercado"]')!.click();
    await fixture.whenStable();

    expect(deletar).not.toHaveBeenCalled();
    expect(el.querySelector('dialog')?.textContent).toContain('Mercado');

    const confirmar = [...el.querySelectorAll<HTMLButtonElement>('dialog button')].find(
      (b) => b.textContent?.trim() === 'Excluir',
    )!;
    confirmar.click();
    await fixture.whenStable();
    await fixture.whenStable();

    expect(deletar).toHaveBeenCalledWith(11);
    expect(listar).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Transação excluída.');
    expect(el.querySelector('dialog')).toBeNull();
  });

  describe('filtros', () => {
    const hoje = new Date();
    const periodoAtual = { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() };

    function digitar(el: HTMLElement, seletor: string, valor: string) {
      const campo = el.querySelector<HTMLInputElement>(seletor)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
    }

    function escolher(el: HTMLElement, seletor: string, rotulo: string) {
      const campo = el.querySelector<HTMLSelectElement>(seletor)!;
      campo.selectedIndex = [...campo.options].findIndex((o) => o.textContent?.trim() === rotulo);
      campo.dispatchEvent(new Event('change'));
    }

    async function filtrar(fixture: { whenStable(): Promise<unknown> }, el: HTMLElement) {
      [...el.querySelectorAll<HTMLButtonElement>('form button')]
        .find((b) => b.textContent?.trim() === 'Filtrar')!
        .click();
      await fixture.whenStable();
      await fixture.whenStable();
    }

    it('só consulta ao clicar em Filtrar e combina todos os campos com o período', async () => {
      const { fixture, el } = await criar();
      digitar(el, '#filtro-busca', '  netflix ');
      escolher(el, '#filtro-categoria', 'Lazer');
      escolher(el, '#filtro-tipo', 'Despesa');
      digitar(el, '#filtro-valor-min', '10');
      digitar(el, '#filtro-valor-max', '50.5');
      await fixture.whenStable();
      expect(listar).toHaveBeenCalledTimes(1);

      await filtrar(fixture, el);

      expect(listar).toHaveBeenLastCalledWith({
        ...periodoAtual,
        busca: 'netflix',
        categoriaId: 2,
        tipo: 'DESPESA',
        valorMin: 10,
        valorMax: 50.5,
      });
    });

    it('agrupa as categorias do filtro em despesas e receitas', async () => {
      const { el } = await criar();
      const grupos = [...el.querySelectorAll('#filtro-categoria optgroup')].map((g) =>
        g.getAttribute('label'),
      );
      expect(grupos).toEqual(['Despesas', 'Receitas']);
    });

    it('valor mínimo maior que o máximo não consulta e avisa', async () => {
      const { fixture, el } = await criar();
      digitar(el, '#filtro-valor-min', '100');
      digitar(el, '#filtro-valor-max', '10');
      await filtrar(fixture, el);

      expect(listar).toHaveBeenCalledTimes(1);
      expect(el.querySelector('form [role="alert"]')?.textContent).toContain('valor mínimo');
    });

    it('"Limpar filtros" volta ao período sem filtros e zera os campos', async () => {
      const { fixture, el } = await criar();
      digitar(el, '#filtro-busca', 'pix');
      await filtrar(fixture, el);
      expect(listar).toHaveBeenLastCalledWith({ ...periodoAtual, busca: 'pix' });

      [...el.querySelectorAll<HTMLButtonElement>('form button')]
        .find((b) => b.textContent?.trim() === 'Limpar filtros')!
        .click();
      await fixture.whenStable();
      await fixture.whenStable();

      expect(listar).toHaveBeenLastCalledWith(periodoAtual);
      expect(el.querySelector<HTMLInputElement>('#filtro-busca')!.value).toBe('');
    });

    it('sem resultados com filtro ativo, a mensagem cita os filtros', async () => {
      const { fixture, el } = await criar();
      listar.mockReturnValue(of([]));
      digitar(el, '#filtro-busca', 'inexistente');
      await filtrar(fixture, el);
      expect(el.textContent).toContain('Nenhuma transação encontrada com esses filtros.');
    });

    it('"Todo o histórico" ignora mês e ano e desabilita o seletor de período', async () => {
      const { fixture, el } = await criar();
      el.querySelector<HTMLInputElement>('.todo-historico input')!.click();
      await fixture.whenStable();
      await fixture.whenStable();

      expect(listar).toHaveBeenLastCalledWith({});
      expect(el.querySelector<HTMLFieldSetElement>('fieldset.periodo')!.disabled).toBe(true);
    });

    it('mostra a contagem e os totais do que foi encontrado', async () => {
      const { el } = await criar();
      const resumo = el.querySelector('.resumo')!.textContent!.replace(/\s+/g, ' ');
      expect(resumo).toContain('2 transações encontradas');
      expect(resumo).toContain('Receitas: R$ 4.500,00');
      expect(resumo).toContain('Despesas: R$ 89,90');
    });
  });

  describe('edição em massa', () => {
    const caixa = (el: HTMLElement, rotulo: string) =>
      el.querySelector<HTMLInputElement>(`input[aria-label="${rotulo}"]`)!;
    const botao = (el: HTMLElement, texto: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === texto,
      )!;

    it('não mostra a barra de ações sem seleção', async () => {
      const { el } = await criar();
      expect(el.querySelector('.massa')).toBeNull();
    });

    it('selecionar mostra a barra com a contagem; "todas" marca e desmarca tudo', async () => {
      const { fixture, el } = await criar();
      caixa(el, 'Selecionar Mercado').click();
      await fixture.whenStable();

      expect(el.querySelector('.massa__titulo')?.textContent).toContain('1 selecionada');
      expect(el.querySelectorAll('tbody tr.selecionada')).toHaveLength(1);
      expect(caixa(el, 'Selecionar todas as transações listadas').indeterminate).toBe(true);

      caixa(el, 'Selecionar todas as transações listadas').click();
      await fixture.whenStable();
      expect(el.querySelector('.massa__titulo')?.textContent).toContain('2 selecionadas');

      caixa(el, 'Selecionar todas as transações listadas').click();
      await fixture.whenStable();
      expect(el.querySelector('.massa')).toBeNull();
    });

    it('move as selecionadas para a categoria escolhida (só do mesmo tipo) e recarrega', async () => {
      const { fixture, el } = await criar();
      caixa(el, 'Selecionar Mercado').click();
      await fixture.whenStable();

      const opcoes = [...el.querySelectorAll('#massa-categoria option')].map((o) =>
        o.textContent?.trim(),
      );
      expect(opcoes).toEqual(['Selecione…', 'Alimentação', 'Lazer']);
      expect(botao(el, 'Mover').disabled).toBe(true);

      const destino = el.querySelector<HTMLSelectElement>('#massa-categoria')!;
      destino.value = '2';
      destino.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      expect(botao(el, 'Mover').disabled).toBe(false);

      botao(el, 'Mover').click();
      await fixture.whenStable();
      await fixture.whenStable();

      expect(recategorizar).toHaveBeenCalledWith([11], 2);
      expect(listar).toHaveBeenCalledTimes(2);
      expect(el.querySelector('[role="status"]')?.textContent).toContain(
        '1 transação movida para Lazer.',
      );
      expect(el.querySelector('.massa')).toBeNull();
    });

    it('receitas e despesas juntas: explica e bloqueia a mudança de categoria', async () => {
      const { fixture, el } = await criar();
      caixa(el, 'Selecionar todas as transações listadas').click();
      await fixture.whenStable();

      expect(el.querySelector('.massa__dica')?.textContent).toContain(
        'mistura receitas e despesas',
      );
      expect(el.querySelector('#massa-categoria')).toBeNull();
      expect(botao(el, 'Mover').disabled).toBe(true);
    });

    it('mostra o erro da API sem perder a seleção', async () => {
      recategorizar.mockReturnValue(throwError(() => new ApiError(400, 'Categoria inexistente')));
      const { fixture, el } = await criar();
      caixa(el, 'Selecionar Mercado').click();
      await fixture.whenStable();
      const destino = el.querySelector<HTMLSelectElement>('#massa-categoria')!;
      destino.value = '2';
      destino.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      botao(el, 'Mover').click();
      await fixture.whenStable();

      expect(el.querySelector('.massa [role="alert"]')?.textContent).toContain(
        'Categoria inexistente',
      );
      expect(el.querySelector('.massa__titulo')?.textContent).toContain('1 selecionada');
    });

    it('excluir selecionadas pede confirmação e depois exclui em lote', async () => {
      const { fixture, el } = await criar();
      caixa(el, 'Selecionar todas as transações listadas').click();
      await fixture.whenStable();
      botao(el, 'Excluir selecionadas').click();
      await fixture.whenStable();

      expect(excluirVarias).not.toHaveBeenCalled();
      expect(el.querySelector('dialog')?.textContent).toContain('2');

      const confirmar = [...el.querySelectorAll<HTMLButtonElement>('dialog button')].find(
        (b) => b.textContent?.trim() === 'Excluir',
      )!;
      confirmar.click();
      await fixture.whenStable();
      await fixture.whenStable();

      expect(excluirVarias).toHaveBeenCalledWith([10, 11]);
      expect(listar).toHaveBeenCalledTimes(2);
      expect(el.querySelector('dialog')).toBeNull();
      expect(el.querySelector('[role="status"]')?.textContent).toContain('1 transação excluída.');
    });

    it('a seleção acompanha a lista: some quem deixou de aparecer após um filtro', async () => {
      const { fixture, el } = await criar();
      caixa(el, 'Selecionar todas as transações listadas').click();
      await fixture.whenStable();

      listar.mockReturnValue(of([transacoes[1]]));
      const busca = el.querySelector<HTMLInputElement>('#filtro-busca')!;
      busca.value = 'mercado';
      busca.dispatchEvent(new Event('input'));
      botao(el, 'Filtrar').click();
      await fixture.whenStable();
      await fixture.whenStable();

      expect(el.querySelector('.massa__titulo')?.textContent).toContain('1 selecionada');
    });
  });

  describe('regra "usar sempre esta categoria" depois de mover', () => {
    const botao = (el: HTMLElement, texto: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === texto,
      )!;

    async function moverMercadoParaLazer(
      el: HTMLElement,
      fixture: { whenStable(): Promise<unknown> },
    ) {
      el.querySelector<HTMLInputElement>('input[aria-label="Selecionar Mercado"]')!.click();
      await fixture.whenStable();
      const destino = el.querySelector<HTMLSelectElement>('#massa-categoria')!;
      destino.value = '2';
      destino.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      botao(el, 'Mover').click();
      await fixture.whenStable();
      await fixture.whenStable();
    }

    it('oferece a regra com o termo sugerido a partir das descrições, editável', async () => {
      const { fixture, el } = await criar();
      await moverMercadoParaLazer(el, fixture);

      expect(el.querySelector('.proposta-regra h2')?.textContent).toContain(
        'Usar sempre Lazer para descrições parecidas?',
      );
      expect(el.querySelector<HTMLInputElement>('#regra-termo')?.value).toBe('mercado');
      expect(
        el.querySelector<HTMLInputElement>('.proposta-regra input[type="checkbox"]')?.checked,
      ).toBe(false);
    });

    it('"Criar regra" grava o termo e a categoria, sem mexer no histórico por padrão', async () => {
      const { fixture, el } = await criar();
      await moverMercadoParaLazer(el, fixture);
      const chamadasAntes = listar.mock.calls.length;

      const campo = el.querySelector<HTMLInputElement>('#regra-termo')!;
      campo.value = ' mercado ';
      campo.dispatchEvent(new Event('input'));
      botao(el, 'Criar regra').click();
      await fixture.whenStable();

      expect(criarRegra).toHaveBeenCalledWith({ termo: 'mercado', categoriaId: 2 });
      expect(aplicarRegra).not.toHaveBeenCalled();
      expect(el.querySelector('.proposta-regra')).toBeNull();
      expect(el.querySelector('[role="status"]')?.textContent).toContain(
        'Regra criada: descrições com "mercado" vão para Lazer',
      );
      expect(listar.mock.calls.length).toBe(chamadasAntes); // nada de recarregar
    });

    it('com "aplicar também às que já existem", aplica a regra e recarrega a lista', async () => {
      const { fixture, el } = await criar();
      await moverMercadoParaLazer(el, fixture);
      const chamadasAntes = listar.mock.calls.length;

      el.querySelector<HTMLInputElement>('.proposta-regra input[type="checkbox"]')!.click();
      await fixture.whenStable();
      botao(el, 'Criar regra').click();
      await fixture.whenStable();
      await fixture.whenStable();

      expect(aplicarRegra).toHaveBeenCalledWith(7);
      expect(el.querySelector('[role="status"]')?.textContent).toContain(
        '3 transações movidas no histórico.',
      );
      expect(listar.mock.calls.length).toBe(chamadasAntes + 1);
    });

    it('"Agora não" dispensa a pergunta sem criar nada', async () => {
      const { fixture, el } = await criar();
      await moverMercadoParaLazer(el, fixture);

      botao(el, 'Agora não').click();
      await fixture.whenStable();

      expect(el.querySelector('.proposta-regra')).toBeNull();
      expect(criarRegra).not.toHaveBeenCalled();
    });

    it('termo curto demais: valida sem chamar a API', async () => {
      const { fixture, el } = await criar();
      await moverMercadoParaLazer(el, fixture);

      const campo = el.querySelector<HTMLInputElement>('#regra-termo')!;
      campo.value = 'ab';
      campo.dispatchEvent(new Event('input'));
      botao(el, 'Criar regra').click();
      await fixture.whenStable();

      expect(el.querySelector('.proposta-regra .campo__erro')?.textContent).toContain('mínimo 3');
      expect(criarRegra).not.toHaveBeenCalled();
    });

    it('mostra o erro da API (ex.: regra repetida) e mantém a pergunta aberta', async () => {
      criarRegra.mockReturnValue(
        throwError(() => new ApiError(409, 'Já existe uma regra para "mercado"')),
      );
      const { fixture, el } = await criar();
      await moverMercadoParaLazer(el, fixture);

      botao(el, 'Criar regra').click();
      await fixture.whenStable();

      expect(el.querySelector('.proposta-regra [role="alert"]')?.textContent).toContain(
        'Já existe uma regra',
      );
      expect(el.querySelector('.proposta-regra')).not.toBeNull();
    });

    it('não oferece se as descrições não têm nada em comum', async () => {
      listar.mockReturnValue(
        of([
          { ...transacoes[1], id: 21, descricao: 'Mercado' },
          { ...transacoes[1], id: 22, descricao: 'Cinema' },
        ]),
      );
      const { fixture, el } = await criar();
      el.querySelector<HTMLInputElement>(
        'input[aria-label="Selecionar todas as transações listadas"]',
      )!.click();
      await fixture.whenStable();
      const destino = el.querySelector<HTMLSelectElement>('#massa-categoria')!;
      destino.value = '2';
      destino.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      botao(el, 'Mover').click();
      await fixture.whenStable();
      await fixture.whenStable();

      expect(recategorizar).toHaveBeenCalled();
      expect(el.querySelector('.proposta-regra')).toBeNull();
    });

    it('não oferece ao mover para "Outros" (é o que a importação já faz)', async () => {
      TestBed.overrideProvider(CategoriaService, {
        useValue: {
          listar: () =>
            of([...categorias, { id: 9, nome: 'Outros', tipo: 'DESPESA', padrao: true }]),
        },
      });
      const { fixture, el } = await criar();
      el.querySelector<HTMLInputElement>('input[aria-label="Selecionar Mercado"]')!.click();
      await fixture.whenStable();
      const destino = el.querySelector<HTMLSelectElement>('#massa-categoria')!;
      destino.value = '9';
      destino.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      botao(el, 'Mover').click();
      await fixture.whenStable();
      await fixture.whenStable();

      expect(recategorizar).toHaveBeenCalledWith([11], 9);
      expect(el.querySelector('.proposta-regra')).toBeNull();
    });
  });

  describe('abre já filtrada por links (insights, recorrentes, contas)', () => {
    it('lê mes, ano, categoria, tipo e busca da URL e preenche o painel de filtros', async () => {
      consultaDaUrl = {
        mes: '3',
        ano: '2026',
        categoriaId: '1',
        tipo: 'DESPESA',
        busca: 'netflix',
      };
      const { el } = await criar();

      expect(listar).toHaveBeenCalledWith({
        mes: 3,
        ano: 2026,
        busca: 'netflix',
        categoriaId: 1,
        tipo: 'DESPESA',
      });
      expect(el.querySelector<HTMLInputElement>('#filtro-busca')?.value).toBe('netflix');
      expect(el.querySelector<HTMLSelectElement>('#filtro-tipo')?.value).toBe('DESPESA');
    });

    it('parâmetros inválidos são ignorados (abre no mês atual, sem filtros)', async () => {
      consultaDaUrl = { mes: '13', ano: 'abc', categoriaId: 'x', tipo: 'FOO', contaId: '-2' };
      await criar();
      const hoje = new Date();

      expect(listar).toHaveBeenCalledWith({ mes: hoje.getMonth() + 1, ano: hoje.getFullYear() });
    });

    it('historico=1 pesquisa em todo o histórico (sem mês nem ano)', async () => {
      consultaDaUrl = { busca: 'netflix', historico: '1' };
      const { el } = await criar();

      expect(listar).toHaveBeenCalledWith({ busca: 'netflix' });
      expect(el.querySelector<HTMLInputElement>('.todo-historico input')?.checked).toBe(true);
    });

    it('contaId na URL filtra pela conta', async () => {
      consultaDaUrl = { contaId: '2' };
      await criar();
      const hoje = new Date();

      expect(listar).toHaveBeenCalledWith({
        mes: hoje.getMonth() + 1,
        ano: hoje.getFullYear(),
        contaId: 2,
      });
    });
  });

  describe('várias contas', () => {
    const umaConta = (id: number, nome: string): Conta => ({
      id,
      nome,
      tipo: 'CONTA_CORRENTE',
      saldoInicial: 0,
      identificadorExterno: null,
      arquivada: false,
      saldo: 0,
      totalTransacoes: 0,
    });
    const doisLugares = () => [umaConta(1, 'Conta principal'), umaConta(2, 'Cartão')];
    const comTransferencia = (): Transacao[] => [
      ...transacoes,
      { ...transacoes[1], id: 12, descricao: 'Pagamento de fatura', transferenciaId: 'abc' },
    ];

    it('com uma conta só, não há coluna nem filtro de conta', async () => {
      contas = [umaConta(1, 'Conta principal')];
      const { el } = await criar();

      expect(el.querySelector('#filtro-conta')).toBeNull();
      expect(
        [...el.querySelectorAll('thead th')].map((th) => th.textContent?.trim()),
      ).not.toContain('Conta');
    });

    it('com várias contas, mostra a coluna Conta e o filtro por conta', async () => {
      contas = doisLugares();
      const { el } = await criar();

      expect([...el.querySelectorAll('thead th')].map((th) => th.textContent?.trim())).toContain(
        'Conta',
      );
      expect(el.querySelector('tbody')?.textContent).toContain('Conta principal');
      expect(el.querySelectorAll('#filtro-conta option')).toHaveLength(3);
    });

    it('a transferência aparece marcada e não tem "Editar" nem "Transferência"', async () => {
      contas = doisLugares();
      listar.mockReturnValue(of(comTransferencia()));
      const { el } = await criar();
      const linha = [...el.querySelectorAll('tbody tr')].find((tr) =>
        tr.textContent?.includes('Pagamento de fatura'),
      )!;

      expect(linha.textContent).toContain('transferência');
      expect(linha.querySelector('button[aria-label^="Editar"]')).toBeNull();
      expect(linha.querySelector('button[aria-label^="Marcar como transferência"]')).toBeNull();
      expect(linha.querySelector('button[aria-label^="Excluir"]')).not.toBeNull();
    });

    it('move as selecionadas para outra conta', async () => {
      contas = doisLugares();
      const { fixture, el } = await criar();

      el.querySelector<HTMLInputElement>('input[aria-label="Selecionar Mercado"]')!.click();
      await fixture.whenStable();
      const campo = el.querySelector<HTMLSelectElement>('#massa-conta')!;
      campo.value = '2';
      campo.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      [...el.querySelectorAll<HTMLButtonElement>('.massa button')]
        .find((b) => b.textContent?.trim() === 'Mover para a conta')!
        .click();
      await fixture.whenStable();

      expect(moverParaConta).toHaveBeenCalledWith([11], 2);
      expect(el.querySelector('[role="status"]')?.textContent).toContain('movida para Cartão');
    });

    it('marca uma transação como transferência para outra conta', async () => {
      contas = doisLugares();
      const { fixture, el } = await criar();

      el.querySelector<HTMLButtonElement>(
        'button[aria-label="Marcar como transferência: Mercado"]',
      )!.click();
      await fixture.whenStable();
      const campo = el.querySelector<HTMLSelectElement>('#transferencia-conta')!;
      expect([...campo.options].map((o) => o.textContent?.trim())).toEqual([
        'Selecione…',
        'Cartão',
      ]);
      campo.value = '2';
      campo.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      [...el.querySelectorAll<HTMLButtonElement>('dialog button')]
        .find((b) => b.textContent?.trim() === 'Marcar como transferência')!
        .click();
      await fixture.whenStable();

      expect(marcarComoTransferencia).toHaveBeenCalledWith(11, 2);
      expect(el.querySelector('[role="status"]')?.textContent).toContain(
        'agora é uma transferência',
      );
    });
  });
});
