import { CategoriaRepository } from '../repositories/categoria.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import {
  MetaCategoriaLinha,
  MetaCategoriaRepository,
} from '../repositories/meta-categoria.repository';
import { MetaRepository } from '../repositories/meta.repository';
import { Categoria } from '../types';
import {
  calcularEvolucaoMensal,
  calcularPorCategoria,
  calcularResumo,
  DashboardService,
} from './dashboard.service';

const despesa = (valor: number) => ({ tipo: 'DESPESA' as const, valor });
const receita = (valor: number) => ({ tipo: 'RECEITA' as const, valor });

describe('calcularResumo', () => {
  it('retorna zeros e sem alerta quando não há transações', () => {
    expect(calcularResumo([], 500)).toEqual({
      totalReceitas: 0,
      totalDespesas: 0,
      saldoAtual: 0,
      orcamentoLimite: 500,
      mesesAcimaDaMeta: [],
      mesesComMeta: 0,
      mesesComCategoriaEstourada: [],
      alertaOrcamentoEstourado: false,
      situacaoOrcamento: 'DENTRO',
    });
  });

  it.each([
    [79, 'DENTRO'],
    [79.99, 'DENTRO'],
    [80, 'ATENCAO'],
    [100, 'ATENCAO'],
    [100.01, 'ESTOURADA'],
  ])('com gasto de R$ %s numa meta de R$ 100 a situação é %s', (gasto, situacao) => {
    expect(calcularResumo([despesa(gasto)], 100).situacaoOrcamento).toBe(situacao);
  });

  it('sem meta a situação é SEM_META, por mais que se gaste', () => {
    expect(calcularResumo([despesa(1e6)], null).situacaoOrcamento).toBe('SEM_META');
  });

  it('calcula saldo = receitas - despesas', () => {
    const resumo = calcularResumo([receita(3000), despesa(1200), despesa(300.5)], null);
    expect(resumo.totalReceitas).toBe(3000);
    expect(resumo.totalDespesas).toBe(1500.5);
    expect(resumo.saldoAtual).toBe(1499.5);
  });

  it('permite saldo negativo', () => {
    expect(calcularResumo([receita(100), despesa(250)], null).saldoAtual).toBe(-150);
  });

  it('não tem alerta quando só há receitas', () => {
    expect(calcularResumo([receita(1000)], 100).alertaOrcamentoEstourado).toBe(false);
  });

  it('não tem alerta quando orçamentoLimite é nulo (sem limite definido)', () => {
    expect(calcularResumo([despesa(999999)], null).alertaOrcamentoEstourado).toBe(false);
  });

  it('não tem alerta quando despesas são exatamente o limite', () => {
    expect(calcularResumo([despesa(400), despesa(100)], 500).alertaOrcamentoEstourado).toBe(false);
  });

  it('tem alerta quando despesas excedem o limite', () => {
    expect(calcularResumo([despesa(400), despesa(100.01)], 500).alertaOrcamentoEstourado).toBe(
      true,
    );
  });

  it('evita ruído de ponto flutuante nas somas', () => {
    const resumo = calcularResumo([despesa(0.1), despesa(0.2)], 0.3);
    expect(resumo.totalDespesas).toBe(0.3);
    expect(resumo.alertaOrcamentoEstourado).toBe(false);
  });
});

const categoriasBase: Categoria[] = [
  { id: 1, nome: 'Alimentação', tipo: 'DESPESA' },
  { id: 4, nome: 'Salário', tipo: 'RECEITA' },
];

const lancamento = (
  tipo: 'RECEITA' | 'DESPESA',
  valor: number,
  dataTransacao: string,
  categoriaId = 1,
) => ({
  tipo,
  valor,
  dataTransacao,
  categoriaId,
});

// `metas`: mês (1-12) → meta, só dos meses que têm meta (o mock devolve o mesmo mapa para qualquer ano).
function montarService(
  metas: Record<number, number> = {},
  listagem: unknown[] = [despesa(250)],
  metasDasCategorias: MetaCategoriaLinha[] = [],
) {
  const transacoes = {
    listarPorUsuarioEPeriodo: jest.fn().mockResolvedValue(listagem),
  } as unknown as TransacaoRepository;
  const repositorioMetas = {
    listarDoAno: jest
      .fn()
      .mockResolvedValue(new Map(Object.entries(metas).map(([mes, v]) => [Number(mes), v]))),
  } as unknown as MetaRepository;
  const categorias = {
    listarVisiveis: jest.fn().mockResolvedValue(categoriasBase),
  } as unknown as CategoriaRepository;
  const repositorioMetasCategoria = {
    listarDoAno: jest.fn().mockResolvedValue(metasDasCategorias),
  } as unknown as MetaCategoriaRepository;
  return {
    service: new DashboardService(
      transacoes,
      repositorioMetas,
      categorias,
      repositorioMetasCategoria,
    ),
    transacoes,
    repositorioMetas,
    repositorioMetasCategoria,
    categorias,
  };
}

describe('DashboardService.obterResumo', () => {
  it('em um mês compara com a meta desse mês e consulta o período', async () => {
    const { service, transacoes, repositorioMetas } = montarService({ 3: 200 });

    const resumo = await service.obterResumo(7, { mes: 3, ano: 2026 });

    expect(resumo).toMatchObject({ orcamentoLimite: 200, alertaOrcamentoEstourado: true });
    expect(resumo.mesesAcimaDaMeta).toEqual([]);
    expect(repositorioMetas.listarDoAno).toHaveBeenCalledWith(7, 2026);
    expect(transacoes.listarPorUsuarioEPeriodo).toHaveBeenCalledWith(
      7,
      { inicio: new Date(Date.UTC(2026, 2, 1)), fim: new Date(Date.UTC(2026, 3, 1)) },
      undefined,
    );
  });

  it('a meta de outro mês não vale: mês sem meta nunca estoura', async () => {
    const { service } = montarService({ 3: 200 }, [despesa(9999)]);

    const resumo = await service.obterResumo(7, { mes: 4, ano: 2026 });

    expect(resumo.orcamentoLimite).toBeNull();
    expect(resumo.alertaOrcamentoEstourado).toBe(false);
  });

  it('gasto igual à meta não estoura', async () => {
    const { service } = montarService({ 3: 250 }, [despesa(250)]);

    expect((await service.obterResumo(7, { mes: 3, ano: 2026 })).alertaOrcamentoEstourado).toBe(
      false,
    );
  });

  it('no ano inteiro lista os meses que passaram da meta do próprio mês', async () => {
    const { service } = montarService({ 1: 100, 3: 5000, 6: 100 }, [
      lancamento('DESPESA', 250, '2026-01-10'),
      lancamento('DESPESA', 250, '2026-03-10'), // dentro da meta de março
      lancamento('DESPESA', 250, '2026-04-10'), // abril não tem meta
      lancamento('DESPESA', 100, '2026-06-10'), // exatamente a meta
    ]);

    const resumo = await service.obterResumo(7, { ano: 2026 });

    expect(resumo.mesesAcimaDaMeta).toEqual([1]);
    expect(resumo.mesesComMeta).toBe(3);
    expect(resumo.alertaOrcamentoEstourado).toBe(true);
    expect(resumo.orcamentoLimite).toBeNull();
    expect(resumo.totalDespesas).toBe(850);
  });

  it('no ano inteiro, sem nenhum mês acima da meta, não alerta', async () => {
    const { service } = montarService({ 1: 1000 }, [lancamento('DESPESA', 250, '2026-01-10')]);

    const resumo = await service.obterResumo(7, { ano: 2026 });

    expect(resumo.mesesAcimaDaMeta).toEqual([]);
    expect(resumo.alertaOrcamentoEstourado).toBe(false);
  });

  it('no ano inteiro a situação é ESTOURADA, DENTRO ou SEM_META conforme as metas dos meses', async () => {
    const lancamentos = [lancamento('DESPESA', 250, '2026-01-10')];
    const estourada = montarService({ 1: 100 }, lancamentos);
    const dentro = montarService({ 1: 1000 }, lancamentos);
    const semMeta = montarService({}, lancamentos);

    expect((await estourada.service.obterResumo(7, { ano: 2026 })).situacaoOrcamento).toBe(
      'ESTOURADA',
    );
    expect((await dentro.service.obterResumo(7, { ano: 2026 })).situacaoOrcamento).toBe('DENTRO');
    expect((await semMeta.service.obterResumo(7, { ano: 2026 })).situacaoOrcamento).toBe(
      'SEM_META',
    );
  });

  it('no ano inteiro lista os meses em que alguma categoria passou da própria meta', async () => {
    const { service, repositorioMetasCategoria } = montarService(
      {},
      [
        lancamento('DESPESA', 300, '2026-01-10', 1), // passou dos 200
        lancamento('DESPESA', 200, '2026-02-10', 1), // exatamente a meta
        lancamento('DESPESA', 999, '2026-03-10', 2), // categoria sem meta
        lancamento('RECEITA', 999, '2026-04-10', 1), // receita não conta
        lancamento('DESPESA', 150, '2026-05-10', 1), // a meta de maio é 100
        lancamento('DESPESA', 50, '2026-05-20', 1),
      ],
      [
        { categoriaId: 1, ano: 2026, mes: 1, valor: 200 },
        { categoriaId: 1, ano: 2026, mes: 2, valor: 200 },
        { categoriaId: 1, ano: 2026, mes: 4, valor: 10 },
        { categoriaId: 1, ano: 2026, mes: 5, valor: 100 },
      ],
    );

    const resumo = await service.obterResumo(7, { ano: 2026 });

    expect(resumo.mesesComCategoriaEstourada).toEqual([1, 5]);
    expect(repositorioMetasCategoria.listarDoAno).toHaveBeenCalledWith(7, 2026);
  });

  describe('meta do mês = soma das metas por categoria', () => {
    const metasPorCategoria: MetaCategoriaLinha[] = [
      { categoriaId: 1, ano: 2026, mes: 3, valor: 150 },
      { categoriaId: 2, ano: 2026, mes: 3, valor: 50 },
    ];

    it('no mês, compara o gasto com a soma (e ela vale mais que a meta total antiga)', async () => {
      const { service } = montarService({ 3: 99999 }, [despesa(250)], metasPorCategoria);

      const resumo = await service.obterResumo(7, { mes: 3, ano: 2026 });

      expect(resumo).toMatchObject({
        orcamentoLimite: 200,
        alertaOrcamentoEstourado: true,
        situacaoOrcamento: 'ESTOURADA',
      });
    });

    it('no ano inteiro, o mês com metas por categoria conta como mês com meta', async () => {
      const { service } = montarService(
        {},
        [lancamento('DESPESA', 250, '2026-03-10')],
        metasPorCategoria,
      );

      const resumo = await service.obterResumo(7, { ano: 2026 });

      expect(resumo.mesesComMeta).toBe(1);
      expect(resumo.mesesAcimaDaMeta).toEqual([3]);
    });

    it('a evolução traz a soma como meta do mês', async () => {
      const { service } = montarService({}, [], metasPorCategoria);

      const evolucao = await service.obterEvolucao(7, 2026);

      expect(evolucao.meses[2].orcamentoLimite).toBe(200);
      expect(evolucao.meses[3].orcamentoLimite).toBeNull();
    });
  });

  it('sem ano não há período para comparar (e nem consulta as metas)', async () => {
    const { service, repositorioMetas } = montarService({ 1: 1 }, [despesa(500)]);

    const resumo = await service.obterResumo(7);

    expect(resumo.alertaOrcamentoEstourado).toBe(false);
    expect(resumo.orcamentoLimite).toBeNull();
    expect(repositorioMetas.listarDoAno).not.toHaveBeenCalled();
  });
});

describe('calcularEvolucaoMensal', () => {
  it('devolve 12 meses zerados quando não há transações', () => {
    const meses = calcularEvolucaoMensal([], 2026);

    expect(meses).toHaveLength(12);
    expect(meses.map((m) => m.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(
      meses.every((m) => m.totalReceitas === 0 && m.totalDespesas === 0 && m.saldo === 0),
    ).toBe(true);
  });

  it('separa receita e despesa do mesmo mês e calcula o saldo', () => {
    const meses = calcularEvolucaoMensal(
      [
        lancamento('RECEITA', 10000, '2026-03-05'),
        lancamento('DESPESA', 2800, '2026-03-10'),
        lancamento('DESPESA', 199.9, '2026-03-20'),
      ],
      2026,
    );

    expect(meses[2]).toEqual({
      mes: 3,
      totalReceitas: 10000,
      totalDespesas: 2999.9,
      saldo: 7000.1,
      orcamentoLimite: null,
    });
    expect(meses[1].saldo).toBe(0);
  });

  it('anexa a meta de cada mês (null nos meses sem meta)', () => {
    const meses = calcularEvolucaoMensal(
      [],
      2026,
      new Map([
        [1, 2000],
        [6, 3500.5],
      ]),
    );

    expect(meses.map((m) => m.orcamentoLimite)).toEqual([
      2000,
      null,
      null,
      null,
      null,
      3500.5,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('coloca o dia 1 e o dia 31 no mês certo', () => {
    const meses = calcularEvolucaoMensal(
      [
        lancamento('DESPESA', 1, '2026-01-01'),
        lancamento('DESPESA', 2, '2026-01-31'),
        lancamento('DESPESA', 4, '2026-03-01'),
        lancamento('DESPESA', 8, '2026-12-31'),
      ],
      2026,
    );

    expect(meses.map((m) => m.totalDespesas)).toEqual([3, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 8]);
  });

  it('ignora lançamentos de outros anos e permite saldo negativo', () => {
    const meses = calcularEvolucaoMensal(
      [
        lancamento('DESPESA', 500, '2025-12-31'),
        lancamento('DESPESA', 500, '2027-01-01'),
        lancamento('DESPESA', 300, '2026-06-15'),
      ],
      2026,
    );

    expect(meses[11].totalDespesas).toBe(0);
    expect(meses[0].totalDespesas).toBe(0);
    expect(meses[5].saldo).toBe(-300);
  });

  it('evita ruído de ponto flutuante', () => {
    const meses = calcularEvolucaoMensal(
      [lancamento('DESPESA', 0.1, '2026-02-01'), lancamento('DESPESA', 0.2, '2026-02-02')],
      2026,
    );

    expect(meses[1].totalDespesas).toBe(0.3);
  });
});

describe('calcularPorCategoria', () => {
  const categorias: Categoria[] = [
    { id: 1, nome: 'Alimentação', tipo: 'DESPESA' },
    { id: 2, nome: 'Transporte', tipo: 'DESPESA' },
    { id: 3, nome: 'Lazer', tipo: 'DESPESA' },
  ];
  const item = (categoriaId: number, valor: number) => ({ categoriaId, valor });

  it('devolve lista vazia sem transações', () => {
    expect(calcularPorCategoria([], categorias)).toEqual([]);
  });

  it('uma categoria só fica com 100%', () => {
    expect(calcularPorCategoria([item(1, 50), item(1, 25.5)], categorias)).toEqual([
      { categoriaId: 1, categoria: 'Alimentação', total: 75.5, percentual: 100 },
    ]);
  });

  it('ordena do maior para o menor e calcula o percentual', () => {
    const resultado = calcularPorCategoria([item(2, 100), item(1, 300), item(3, 100)], categorias);

    expect(resultado.map((r) => [r.categoria, r.total, r.percentual])).toEqual([
      ['Alimentação', 300, 60],
      ['Lazer', 100, 20],
      ['Transporte', 100, 20],
    ]);
  });

  it('desempata pelo nome da categoria', () => {
    const resultado = calcularPorCategoria([item(2, 10), item(3, 10), item(1, 10)], categorias);

    expect(resultado.map((r) => r.categoria)).toEqual(['Alimentação', 'Lazer', 'Transporte']);
  });

  it('os percentuais somam exatamente 100 mesmo com dízimas', () => {
    const resultado = calcularPorCategoria([item(1, 1), item(2, 1), item(3, 1)], categorias);

    expect(resultado.map((r) => r.percentual).sort()).toEqual([33.3, 33.3, 33.4]);
    expect(resultado.reduce((soma, r) => soma + Math.round(r.percentual * 10), 0)).toBe(1000);
  });

  it('usa "Sem categoria" para uma categoria que não está na lista', () => {
    expect(calcularPorCategoria([item(99, 10)], categorias)[0].categoria).toBe('Sem categoria');
  });
});

describe('DashboardService.obterEvolucao e obterPorCategoria', () => {
  const listagem = [
    { ...lancamento('DESPESA', 40, '2026-03-10'), categoriaId: 1 },
    { ...lancamento('RECEITA', 100, '2026-03-05'), categoriaId: 4 },
  ];

  it('evolução: consulta o ano inteiro do usuário e traz a meta de cada mês', async () => {
    const { service, transacoes, repositorioMetas } = montarService({ 3: 2000 }, listagem);

    const evolucao = await service.obterEvolucao(7, 2026);

    expect(transacoes.listarPorUsuarioEPeriodo).toHaveBeenCalledWith(
      7,
      { inicio: new Date(Date.UTC(2026, 0, 1)), fim: new Date(Date.UTC(2027, 0, 1)) },
      undefined,
    );
    expect(repositorioMetas.listarDoAno).toHaveBeenCalledWith(7, 2026);
    expect(evolucao.ano).toBe(2026);
    expect(evolucao.meses).toHaveLength(12);
    expect(evolucao.meses[2]).toMatchObject({
      totalReceitas: 100,
      totalDespesas: 40,
      saldo: 60,
      orcamentoLimite: 2000,
    });
    expect(evolucao.meses[0].orcamentoLimite).toBeNull();
  });

  it('evolução: sem ano usa o ano corrente', async () => {
    const { service } = montarService({}, listagem);

    expect((await service.obterEvolucao(7)).ano).toBe(new Date().getUTCFullYear());
  });

  it('categorias: considera só o tipo pedido (despesa por padrão)', async () => {
    const { service, categorias } = montarService({}, listagem);

    expect(await service.obterPorCategoria(7, { mes: 3, ano: 2026 })).toEqual({
      tipo: 'DESPESA',
      total: 40,
      categorias: [{ categoriaId: 1, categoria: 'Alimentação', total: 40, percentual: 100 }],
    });
    expect(categorias.listarVisiveis).toHaveBeenCalledWith(7); // nomes das categorias do usuário
    const receitas = await service.obterPorCategoria(7, { mes: 3, ano: 2026 }, 'RECEITA');
    expect(receitas.categorias.map((c) => c.categoria)).toEqual(['Salário']);
  });

  it('categorias: sem lançamentos devolve lista vazia e total zero', async () => {
    const { service } = montarService({}, []);

    expect(await service.obterPorCategoria(7, { mes: 1, ano: 2026 })).toEqual({
      tipo: 'DESPESA',
      total: 0,
      categorias: [],
    });
  });
});
