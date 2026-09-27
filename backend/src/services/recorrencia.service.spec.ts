import { Transacao } from '../types';
import { chaveDaDescricao, detectarRecorrencias, resumirRecorrencias } from './recorrencia.service';

let proximoId = 1;
const despesa = (
  descricao: string,
  dataTransacao: string,
  valor: number,
  categoriaId = 1,
): Transacao => ({
  id: proximoId++,
  usuarioId: 1,
  categoriaId,
  descricao,
  valor,
  tipo: 'DESPESA',
  dataTransacao,
  contaId: 1,
  createdAt: new Date(),
});

const mensal = (descricao: string, valores: number[], inicio = '2026-04-05') =>
  valores.map((valor, i) => {
    const [ano, mes, dia] = inicio.split('-').map(Number);
    const indice = ano * 12 + (mes - 1) + i;
    const data = `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    return despesa(descricao, data, valor);
  });

describe('chaveDaDescricao', () => {
  it('ignora acento, caixa, números, datas e parcelas', () => {
    expect(chaveDaDescricao('Netflix.com 12/09')).toBe(chaveDaDescricao('NETFLIX.COM 13/10'));
    expect(chaveDaDescricao('Loja Ágil - Parcela 02/10')).toBe(
      chaveDaDescricao('Loja Agil - Parcela 03/10'),
    );
    expect(chaveDaDescricao('Academia 123')).toBe('academia');
  });
});

describe('detectarRecorrencias', () => {
  const hoje = '2026-09-10';

  it('detecta uma assinatura mensal e calcula a próxima cobrança', () => {
    const [r] = detectarRecorrencias(mensal('Netflix', [39.9, 39.9, 39.9, 39.9, 39.9]), hoje);

    expect(r).toMatchObject({
      chave: 'netflix',
      valorTipico: 39.9,
      valorAtual: 39.9,
      valorVariavel: false,
      ultimaData: '2026-08-05',
      proximaData: '2026-09-05',
      situacao: 'ATIVA',
      ocorrencias: 5,
      periodicidade: 'MENSAL',
    });
  });

  it('exige ao menos 3 meses distintos', () => {
    expect(detectarRecorrencias(mensal('Netflix', [39.9, 39.9]), hoje)).toEqual([]);
  });

  it('compras avulsas do mesmo mercado (intervalos irregulares) não são recorrentes', () => {
    const compras = [
      '2026-06-03',
      '2026-06-04',
      '2026-06-20',
      '2026-07-01',
      '2026-07-09',
      '2026-08-15',
    ].map((data, i) => despesa('Mercado Bom Preço', data, 80 + i));

    expect(detectarRecorrencias(compras, hoje)).toEqual([]);
  });

  it('tolera reajuste (dentro de ±15%) e informa a variação sobre o valor anterior', () => {
    const [r] = detectarRecorrencias(mensal('Netflix', [39.9, 39.9, 39.9, 44.9]), hoje);

    expect(r.valorVariavel).toBe(false);
    expect(r.valorAnterior).toBe(39.9);
    expect(r.valorAtual).toBe(44.9);
    expect(r.variacaoPercentual).toBe(12.5);
  });

  it('valor que oscila muito (conta de luz) vira "valor variável", com o valor médio', () => {
    const [r] = detectarRecorrencias(mensal('Conta de luz', [100, 180, 90, 210]), hoje);

    expect(r.valorVariavel).toBe(true);
    expect(r.valorTipico).toBe(145);
    expect(r.variacaoPercentual).toBeNull();
  });

  it('a última cobrança há mais de 45 dias deixa a recorrência "possivelmente encerrada"', () => {
    const [r] = detectarRecorrencias(mensal('Revista', [30, 30, 30], '2026-01-10'), hoje);

    expect(r.situacao).toBe('POSSIVELMENTE_ENCERRADA');
  });

  it('funciona na virada do ano (dezembro → janeiro)', () => {
    const [r] = detectarRecorrencias(
      mensal('Internet', [100, 100, 100], '2025-11-20'),
      '2026-02-01',
    );

    expect(r.ultimaData).toBe('2026-01-20');
    expect(r.proximaData).toBe('2026-02-20');
  });

  it('dia 31 vai para o último dia do mês seguinte', () => {
    const datas = ['2026-05-31', '2026-06-30', '2026-07-31'].map((d) => despesa('Plano', d, 50));
    const [r] = detectarRecorrencias(datas, '2026-08-05');

    expect(r.proximaData).toBe('2026-08-31');
  });

  it('parcelas de uma mesma compra (02/10, 03/10...) viram uma só recorrência', () => {
    const parcelas = mensal('Loja Tal 02/10', [200, 200, 200]).map((t, i) => ({
      ...t,
      descricao: `Loja Tal ${String(i + 2).padStart(2, '0')}/10`,
    }));

    expect(detectarRecorrencias(parcelas, hoje)).toHaveLength(1);
  });

  it('marca as ignoradas e ordena pelo valor', () => {
    const todas = [...mensal('Netflix', [40, 40, 40]), ...mensal('Aluguel', [1000, 1000, 1000])];
    const recorrencias = detectarRecorrencias(todas, '2026-07-10', new Set(['netflix']));

    expect(recorrencias.map((r) => r.chave)).toEqual(['aluguel', 'netflix']);
    expect(recorrencias.map((r) => r.ignorada)).toEqual([false, true]);
  });

  it('ignora receitas e transferências', () => {
    const itens = mensal('Salário', [5000, 5000, 5000]).map((t) => ({
      ...t,
      tipo: 'RECEITA' as const,
    }));
    const transferencias = mensal('Pagamento fatura', [900, 900, 900]).map((t) => ({
      ...t,
      transferenciaId: 'abc',
    }));

    expect(detectarRecorrencias([...itens, ...transferencias], hoje)).toEqual([]);
  });
});

describe('resumirRecorrencias', () => {
  const todas = detectarRecorrencias(
    [
      ...mensal('Netflix', [40, 40, 40, 40, 40]), // última 05/08 → próxima 05/09
      ...mensal('Spotify', [20, 20, 20], '2026-06-15'), // última 15/08 → próxima 15/09
      ...mensal('Revista', [30, 30, 30], '2026-01-10'), // encerrada
    ],
    '2026-09-10',
    new Set(['spotify']),
  );

  it('soma o custo mensal e anual só das ativas e não ignoradas', () => {
    const resumo = resumirRecorrencias(todas, '2026-09-10', false);

    expect(resumo.custoMensal).toBe(40);
    expect(resumo.custoAnual).toBe(480);
    expect(resumo.recorrencias.map((r) => r.chave)).toEqual(['netflix', 'revista']);
  });

  it('o comprometido do mês são as ativas previstas para o mês que ainda não caíram', () => {
    const resumo = resumirRecorrencias(todas, '2026-09-10', false);

    expect(resumo.comprometidoNoMes).toEqual({ valor: 40, quantidade: 1 });
  });

  it('pode incluir as ignoradas na lista, sem contá-las nos totais', () => {
    const resumo = resumirRecorrencias(todas, '2026-09-10', true);

    expect(resumo.recorrencias.map((r) => r.chave)).toContain('spotify');
    expect(resumo.custoMensal).toBe(40);
  });
});
