import { CategoriaRepository } from '../repositories/categoria.repository';
import {
  MetaCategoriaLinha,
  MetaCategoriaRepository,
} from '../repositories/meta-categoria.repository';
import { MetaRepository } from '../repositories/meta.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import {
  Categoria,
  CategoriaTotal,
  DespesasPorCategoria,
  EvolucaoMensal,
  MesEvolucao,
  PeriodoQuery,
  ResumoFinanceiro,
  TipoTransacao,
} from '../types';
import { calcularPeriodo } from '../utils/periodo';
import { metasDoMes, valoresDasMetas } from '../utils/meta-do-mes';
import { situacaoDaMeta } from '../utils/situacao-meta';

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

export function calcularResumo(
  transacoes: ReadonlyArray<{ tipo: 'RECEITA' | 'DESPESA'; valor: number }>,
  orcamentoLimite: number | null,
): ResumoFinanceiro {
  let receitas = 0;
  let despesas = 0;
  for (const { tipo, valor } of transacoes) {
    if (tipo === 'RECEITA') receitas += valor;
    else despesas += valor;
  }

  const totalReceitas = arredondar(receitas);
  const totalDespesas = arredondar(despesas);
  return {
    totalReceitas,
    totalDespesas,
    saldoAtual: arredondar(totalReceitas - totalDespesas),
    orcamentoLimite,
    mesesAcimaDaMeta: [],
    mesesComMeta: 0,
    mesesComCategoriaEstourada: [],
    alertaOrcamentoEstourado: orcamentoLimite !== null && totalDespesas > orcamentoLimite,
    situacaoOrcamento:
      orcamentoLimite === null ? 'SEM_META' : situacaoDaMeta(totalDespesas, orcamentoLimite),
  };
}

// Meses (1-12) em que alguma categoria de despesa gastou mais que a própria meta do mês.
export function mesesComCategoriaEstourada(
  transacoes: ReadonlyArray<{
    tipo: TipoTransacao;
    valor: number;
    categoriaId: number;
    dataTransacao: string;
  }>,
  metas: ReadonlyArray<MetaCategoriaLinha>,
): number[] {
  const gastos = new Map<string, number>();
  for (const t of transacoes) {
    if (t.tipo !== 'DESPESA') continue;
    const chave = `${Number(t.dataTransacao.slice(5, 7))}-${t.categoriaId}`;
    gastos.set(chave, (gastos.get(chave) ?? 0) + t.valor);
  }
  const meses = new Set<number>();
  for (const { mes, categoriaId, valor } of metas) {
    if (situacaoDaMeta(gastos.get(`${mes}-${categoriaId}`) ?? 0, valor) === 'ESTOURADA') {
      meses.add(mes);
    }
  }
  return [...meses].sort((a, b) => a - b);
}

// Sempre 12 itens (meses sem lançamento zerados). O mês vem direto da string YYYY-MM-DD,
// sem passar por Date, então não há deslocamento de fuso.
export function calcularEvolucaoMensal(
  transacoes: ReadonlyArray<{ tipo: TipoTransacao; valor: number; dataTransacao: string }>,
  ano: number,
  metas: ReadonlyMap<number, number> = new Map(),
): MesEvolucao[] {
  const prefixo = `${ano}-`;
  const receitas = new Array<number>(12).fill(0);
  const despesas = new Array<number>(12).fill(0);

  for (const { tipo, valor, dataTransacao } of transacoes) {
    if (!dataTransacao.startsWith(prefixo)) continue;
    const indice = Number(dataTransacao.slice(5, 7)) - 1;
    if (tipo === 'RECEITA') receitas[indice] += valor;
    else despesas[indice] += valor;
  }

  return receitas.map((_, indice) => {
    const totalReceitas = arredondar(receitas[indice]);
    const totalDespesas = arredondar(despesas[indice]);
    return {
      mes: indice + 1,
      totalReceitas,
      totalDespesas,
      saldo: arredondar(totalReceitas - totalDespesas),
      orcamentoLimite: metas.get(indice + 1) ?? null,
    };
  });
}

// Percentuais com 1 casa decimal que somam exatamente 100 (método do maior resto).
function distribuirPercentuais(totais: number[]): number[] {
  const soma = totais.reduce((acumulado, total) => acumulado + total, 0);
  if (soma === 0) return totais.map(() => 0);

  const decimos = totais.map((total) => (total / soma) * 1000);
  const base = decimos.map(Math.floor);
  let faltam = 1000 - base.reduce((acumulado, valor) => acumulado + valor, 0);

  const porResto = decimos
    .map((valor, indice) => ({ indice, resto: valor - base[indice] }))
    .sort((a, b) => b.resto - a.resto || a.indice - b.indice);
  for (const { indice } of porResto) {
    if (faltam <= 0) break;
    base[indice] += 1;
    faltam -= 1;
  }
  return base.map((valor) => valor / 10);
}

export function calcularPorCategoria(
  transacoes: ReadonlyArray<{ categoriaId: number; valor: number }>,
  categorias: ReadonlyArray<Categoria>,
): CategoriaTotal[] {
  const nomes = new Map(categorias.map((categoria) => [categoria.id, categoria.nome]));
  const somas = new Map<number, number>();
  for (const { categoriaId, valor } of transacoes) {
    somas.set(categoriaId, (somas.get(categoriaId) ?? 0) + valor);
  }

  const ordenadas = [...somas.entries()]
    .map(([categoriaId, soma]) => ({
      categoriaId,
      categoria: nomes.get(categoriaId) ?? 'Sem categoria',
      total: arredondar(soma),
    }))
    .sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria, 'pt-BR'));

  const percentuais = distribuirPercentuais(ordenadas.map((item) => item.total));
  return ordenadas.map((item, indice) => ({ ...item, percentual: percentuais[indice] }));
}

export class DashboardService {
  constructor(
    private readonly transacoes: TransacaoRepository,
    private readonly metas: MetaRepository,
    private readonly categorias: CategoriaRepository,
    private readonly metasCategoria: MetaCategoriaRepository,
  ) {}

  // A meta do mês é a soma das metas por categoria (ou a total antiga, onde não há por categoria).
  private async metasDoAno(usuarioId: number, ano: number) {
    const [antigas, porCategoria] = await Promise.all([
      this.metas.listarDoAno(usuarioId, ano),
      this.metasCategoria.listarDoAno(usuarioId, ano),
    ]);
    return { metas: valoresDasMetas(metasDoMes(antigas, porCategoria)), porCategoria };
  }

  // Em um mês compara com a meta desse mês; no ano inteiro conta os meses que passaram da própria
  // meta (uma meta mensal não faz sentido contra o total do ano); sem ano não há o que comparar.
  async obterResumo(usuarioId: number, filtro: PeriodoQuery = {}): Promise<ResumoFinanceiro> {
    const periodo = calcularPeriodo(filtro.mes, filtro.ano);
    const transacoes = await this.transacoes.listarPorUsuarioEPeriodo(
      usuarioId,
      periodo,
      filtro.contaId,
    );
    if (filtro.ano === undefined) {
      return calcularResumo(transacoes, null);
    }

    const { metas, porCategoria } = await this.metasDoAno(usuarioId, filtro.ano);
    if (filtro.mes !== undefined) {
      return calcularResumo(transacoes, metas.get(filtro.mes) ?? null);
    }

    const acima = calcularEvolucaoMensal(transacoes, filtro.ano, metas)
      .filter((m) => m.orcamentoLimite !== null && m.totalDespesas > m.orcamentoLimite)
      .map((m) => m.mes);
    return {
      ...calcularResumo(transacoes, null),
      mesesAcimaDaMeta: acima,
      mesesComMeta: metas.size,
      mesesComCategoriaEstourada: mesesComCategoriaEstourada(transacoes, porCategoria),
      alertaOrcamentoEstourado: acima.length > 0,
      situacaoOrcamento: acima.length > 0 ? 'ESTOURADA' : metas.size > 0 ? 'DENTRO' : 'SEM_META',
    };
  }

  async obterEvolucao(usuarioId: number, ano?: number, contaId?: number): Promise<EvolucaoMensal> {
    const anoConsulta = ano ?? new Date().getUTCFullYear();
    const [transacoes, { metas }] = await Promise.all([
      this.transacoes.listarPorUsuarioEPeriodo(
        usuarioId,
        calcularPeriodo(undefined, anoConsulta),
        contaId,
      ),
      this.metasDoAno(usuarioId, anoConsulta),
    ]);
    return { ano: anoConsulta, meses: calcularEvolucaoMensal(transacoes, anoConsulta, metas) };
  }

  async obterPorCategoria(
    usuarioId: number,
    filtro: PeriodoQuery = {},
    tipo: TipoTransacao = 'DESPESA',
  ): Promise<DespesasPorCategoria> {
    const periodo = calcularPeriodo(filtro.mes, filtro.ano);
    const [transacoes, categorias] = await Promise.all([
      this.transacoes.listarPorUsuarioEPeriodo(usuarioId, periodo, filtro.contaId),
      this.categorias.listarVisiveis(usuarioId),
    ]);
    const doTipo = transacoes.filter((transacao) => transacao.tipo === tipo);
    return {
      tipo,
      total: arredondar(doTipo.reduce((soma, transacao) => soma + transacao.valor, 0)),
      categorias: calcularPorCategoria(doTipo, categorias),
    };
  }
}
