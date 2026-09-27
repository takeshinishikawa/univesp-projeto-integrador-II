import { Categoria } from '../types';
import { Recorrencia } from '../types/novas-features';
import { EntradaInsights, gerarInsights } from './insight.service';

const categorias: Categoria[] = [
  { id: 1, nome: 'Alimentação', tipo: 'DESPESA', usuarioId: null },
  { id: 2, nome: 'Lazer', tipo: 'DESPESA', usuarioId: null },
  { id: 3, nome: 'Outros', tipo: 'DESPESA', usuarioId: null },
];

const gasto = (dataTransacao: string, valor: number, categoriaId = 1) => ({
  dataTransacao,
  valor,
  categoriaId,
  descricao: 'x',
});

function entrada(despesas: EntradaInsights['despesas'], extra: Partial<EntradaInsights> = {}) {
  return {
    ano: 2026,
    mes: 3,
    hoje: '2026-09-20', // março de 2026 já passou
    despesas,
    categorias,
    metaDoMes: null,
    recorrencias: [],
    ...extra,
  } satisfies EntradaInsights;
}

const tipos = (insights: { tipo: string }[]) => insights.map((i) => i.tipo);

describe('gerarInsights', () => {
  const historicoAlimentacao = [
    gasto('2025-12-10', 1000),
    gasto('2026-01-10', 1000),
    gasto('2026-02-10', 1000),
  ];

  it('categoria em alta: compara com a média dos meses anteriores e leva às transações dela', () => {
    const insights = gerarInsights(entrada([...historicoAlimentacao, gasto('2026-03-10', 1400)]));
    const alta = insights.find((i) => i.tipo === 'CATEGORIA_EM_ALTA');

    expect(alta?.texto).toBe(
      'Alimentação subiu 40% em relação à média dos 3 meses anteriores (R$ 1.400,00 contra R$ 1.000,00).',
    );
    expect(alta?.severidade).toBe('ATENCAO');
    expect(alta?.link).toEqual({ mes: 3, ano: 2026, categoriaId: 1, tipo: 'DESPESA' });
  });

  it('categoria em queda é um insight positivo', () => {
    const insights = gerarInsights(
      entrada([
        gasto('2025-12-10', 300, 2),
        gasto('2026-01-10', 300, 2),
        gasto('2026-02-10', 300, 2),
        gasto('2026-03-10', 100, 2),
      ]),
    );
    const queda = insights.find((i) => i.tipo === 'CATEGORIA_EM_QUEDA');

    expect(queda?.severidade).toBe('POSITIVO');
    expect(queda?.texto).toContain('Lazer caiu 67%');
  });

  it('variação pequena (menos de 25% ou menos de R$ 50) não gera insight de categoria', () => {
    const poucoPercentual = gerarInsights(
      entrada([...historicoAlimentacao, gasto('2026-03-10', 1200)]), // +20%
    );
    const poucosReais = gerarInsights(
      entrada([gasto('2026-02-10', 100), gasto('2026-03-10', 140)]), // +40%, mas só R$ 40
    );

    expect(tipos(poucoPercentual)).not.toContain('CATEGORIA_EM_ALTA');
    expect(tipos(poucosReais)).not.toContain('CATEGORIA_EM_ALTA');
  });

  it('com menos de 3 meses de histórico, usa o que houver e diz quantos', () => {
    const insights = gerarInsights(entrada([gasto('2026-02-10', 1000), gasto('2026-03-10', 1500)]));

    expect(insights.find((i) => i.tipo === 'CATEGORIA_EM_ALTA')?.texto).toContain(
      'média do mês anterior',
    );
  });

  it('sem nenhum mês anterior com dados, não compara nada (nunca inventa)', () => {
    const insights = gerarInsights(entrada([gasto('2026-03-10', 1500)]));

    expect(tipos(insights)).toEqual([]);
  });

  it('sem dados no mês, devolve lista vazia', () => {
    expect(gerarInsights(entrada([]))).toEqual([]);
  });

  it('total do mês contra o anterior: economizou (positivo) ou gastou a mais (atenção)', () => {
    const menos = gerarInsights(entrada([gasto('2026-02-10', 1000), gasto('2026-03-10', 880)]));
    const mais = gerarInsights(entrada([gasto('2026-02-10', 1000), gasto('2026-03-10', 1200)]));

    expect(menos.find((i) => i.tipo === 'VARIACAO_TOTAL_MES_ANTERIOR')?.texto).toBe(
      'Você gastou 12% menos que em fevereiro e economizou R$ 120,00.',
    );
    expect(mais.find((i) => i.tipo === 'VARIACAO_TOTAL_MES_ANTERIOR')?.severidade).toBe('ATENCAO');
  });

  it('as 5 maiores despesas: só com pelo menos 6 lançamentos', () => {
    const cinco = [100, 90, 80, 70, 60].map((v, i) => gasto(`2026-03-0${i + 1}`, v, i % 2 ? 1 : 2));
    const seis = [...cinco, gasto('2026-03-08', 40)];

    expect(tipos(gerarInsights(entrada(cinco)))).not.toContain('MAIORES_DESPESAS');
    const insight = gerarInsights(entrada(seis)).find((i) => i.tipo === 'MAIORES_DESPESAS');
    expect(insight?.texto).toBe('As 5 maiores despesas de março somam R$ 400,00, ou 91% do total.');
  });

  it('muito gasto em Outros (30% ou mais) sugere criar categorias', () => {
    const insights = gerarInsights(
      entrada([gasto('2026-03-10', 400, 3), gasto('2026-03-11', 600, 1)]),
    );
    const outros = insights.find((i) => i.tipo === 'OUTROS_ALTO');

    expect(outros?.texto).toBe(
      '40% das despesas estão em Outros. Crie categorias para enxergar melhor.',
    );
    expect(outros?.link).toMatchObject({ categoriaId: 3 });
  });

  describe('projeção do fim do mês', () => {
    const emAndamento = { mes: 9, hoje: '2026-09-15' };

    it('só no mês corrente: gasto ÷ dias decorridos × dias do mês, comparado à meta', () => {
      const insights = gerarInsights(
        entrada([gasto('2026-09-05', 1500)], { ...emAndamento, metaDoMes: 2500 }),
      );
      const projecao = insights.find((i) => i.tipo === 'PROJECAO_FIM_DO_MES');

      expect(projecao?.texto).toBe(
        'Se mantiver o ritmo, terminará setembro com R$ 3.000,00 em despesas, acima da meta de R$ 2.500,00.',
      );
      expect(projecao?.severidade).toBe('ATENCAO');
    });

    it('dentro da meta é positivo; sem meta é informativo', () => {
      const dentro = gerarInsights(
        entrada([gasto('2026-09-05', 500)], { ...emAndamento, metaDoMes: 2500 }),
      ).find((i) => i.tipo === 'PROJECAO_FIM_DO_MES');
      const semMeta = gerarInsights(entrada([gasto('2026-09-05', 500)], emAndamento)).find(
        (i) => i.tipo === 'PROJECAO_FIM_DO_MES',
      );

      expect(dentro?.severidade).toBe('POSITIVO');
      expect(semMeta?.severidade).toBe('INFO');
    });

    it('exige pelo menos 5 dias decorridos e não existe em mês passado', () => {
      const cedo = gerarInsights(
        entrada([gasto('2026-09-02', 500)], { mes: 9, hoje: '2026-09-04' }),
      );
      const passado = gerarInsights(entrada([gasto('2026-03-02', 500)]));

      expect(tipos(cedo)).not.toContain('PROJECAO_FIM_DO_MES');
      expect(tipos(passado)).not.toContain('PROJECAO_FIM_DO_MES');
    });

    it('no mês corrente compara com o mês anterior só até o mesmo dia', () => {
      const insights = gerarInsights(
        entrada([gasto('2026-08-05', 1000), gasto('2026-08-25', 5000), gasto('2026-09-05', 500)], {
          ...emAndamento,
        }),
      );
      const variacao = insights.find((i) => i.tipo === 'VARIACAO_TOTAL_MES_ANTERIOR');

      // agosto até o dia 15 = R$ 1.000 (e não R$ 6.000); setembro = R$ 500
      expect(variacao?.texto).toBe(
        'Você gastou 50% menos que em agosto (até o dia 15) e economizou R$ 500,00.',
      );
    });
  });

  it('recorrentes: reajuste e assinatura nova, quando a última cobrança é do mês', () => {
    const recorrencia = (parcial: Partial<Recorrencia>): Recorrencia => ({
      chave: 'netflix',
      descricao: 'Netflix',
      categoriaId: 2,
      valorTipico: 39.9,
      valorAtual: 44.9,
      valorAnterior: 39.9,
      variacaoPercentual: 12.5,
      valorVariavel: false,
      periodicidade: 'MENSAL',
      ultimaData: '2026-03-05',
      proximaData: '2026-04-05',
      situacao: 'ATIVA',
      ocorrencias: 5,
      ignorada: false,
      ...parcial,
    });
    const insights = gerarInsights(
      entrada([], {
        recorrencias: [
          recorrencia({}),
          recorrencia({
            chave: 'spotify',
            descricao: 'Spotify',
            valorAtual: 21.9,
            valorAnterior: 21.9,
            ocorrencias: 3,
          }),
          recorrencia({ chave: 'antiga', ultimaData: '2026-01-05' }),
        ],
      }),
    );

    expect(insights.find((i) => i.tipo === 'REAJUSTE_RECORRENTE')?.texto).toBe(
      'Netflix passou de R$ 39,90 para R$ 44,90.',
    );
    expect(insights.find((i) => i.tipo === 'ASSINATURA_NOVA')?.link).toMatchObject({
      busca: 'spotify',
    });
    expect(insights).toHaveLength(2);
  });

  it('ordena pelo impacto em reais, não repete o tipo e limita a 5', () => {
    const despesas = [
      gasto('2025-12-10', 1000, 1),
      gasto('2026-01-10', 1000, 1),
      gasto('2026-02-10', 1000, 1),
      gasto('2025-12-10', 900, 2),
      gasto('2026-01-10', 900, 2),
      gasto('2026-02-10', 900, 2),
      gasto('2026-03-01', 3000, 1),
      gasto('2026-03-02', 100, 2),
      gasto('2026-03-03', 900, 3),
      gasto('2026-03-04', 60, 3),
      gasto('2026-03-05', 50, 3),
      gasto('2026-03-06', 40, 3),
    ];
    const recorrente: Recorrencia = {
      chave: 'netflix',
      descricao: 'Netflix',
      categoriaId: 2,
      valorTipico: 40,
      valorAtual: 45,
      valorAnterior: 40,
      variacaoPercentual: 12.5,
      valorVariavel: false,
      periodicidade: 'MENSAL',
      ultimaData: '2026-03-05',
      proximaData: '2026-04-05',
      situacao: 'ATIVA',
      ocorrencias: 3,
      ignorada: false,
    };
    const insights = gerarInsights(entrada(despesas, { recorrencias: [recorrente] }));

    // 6 candidatos; sai o de menor impacto (o reajuste, R$ 5)
    expect(tipos(insights)).toEqual([
      'MAIORES_DESPESAS',
      'VARIACAO_TOTAL_MES_ANTERIOR',
      'CATEGORIA_EM_ALTA',
      'CATEGORIA_EM_QUEDA',
      'ASSINATURA_NOVA',
    ]);
  });
});
