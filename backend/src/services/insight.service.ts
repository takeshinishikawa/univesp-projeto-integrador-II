import { CategoriaRepository } from '../repositories/categoria.repository';
import { MetaCategoriaRepository } from '../repositories/meta-categoria.repository';
import { MetaRepository } from '../repositories/meta.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import { Categoria, Transacao } from '../types';
import { Insight, Recorrencia } from '../types/novas-features';
import { dataLocalIso, diasNoMes } from '../utils/datas';
import { metasDoMes } from '../utils/meta-do-mes';
import { RecorrenciaService } from './recorrencia.service';

export const MAXIMO_DE_INSIGHTS = 5;
export const LIMIAR_VARIACAO_CATEGORIA_PERCENTUAL = 25;
export const LIMIAR_VARIACAO_REAIS = 50;
export const LIMIAR_VARIACAO_TOTAL_PERCENTUAL = 5;
export const LIMIAR_OUTROS_PERCENTUAL = 30;
export const MINIMO_DE_DESPESAS_PARA_MAIORES = 6;
export const MINIMO_DE_DIAS_PARA_PROJECAO = 5;
export const MESES_DE_HISTORICO = 3;

const NOMES_MES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;
const percentual = (valor: number): number => Math.round(valor);

export function moeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(valor)
    .replace(/\s/g, ' ');
}

export interface EntradaInsights {
  ano: number;
  mes: number;
  /** Data de hoje (YYYY-MM-DD); só no mês corrente há corte por dia e projeção. */
  hoje: string;
  /** Despesas (sem transferências) do mês e dos até 3 anteriores. */
  despesas: ReadonlyArray<Pick<Transacao, 'valor' | 'categoriaId' | 'dataTransacao' | 'descricao'>>;
  categorias: ReadonlyArray<Categoria>;
  metaDoMes: number | null;
  recorrencias: ReadonlyArray<Recorrencia>;
}

interface Candidato {
  insight: Insight;
  impacto: number; // em reais, para ordenar
}

const chaveDoMes = (ano: number, mes: number): string => `${ano}-${String(mes).padStart(2, '0')}`;

function mesesAnteriores(ano: number, mes: number): string[] {
  return Array.from({ length: MESES_DE_HISTORICO }, (_, i) => {
    const indice = ano * 12 + (mes - 1) - (i + 1);
    return chaveDoMes(Math.floor(indice / 12), (indice % 12) + 1);
  });
}

function textoMediaAnterior(meses: number): string {
  return meses === 1 ? 'do mês anterior' : `dos ${meses} meses anteriores`;
}

/**
 * Gera até 5 frases sobre o mês, sem IA: regras fixas sobre os lançamentos. No mês corrente, os
 * meses anteriores são cortados no mesmo dia do mês, para comparar períodos iguais. Não inventa
 * nada: sem base de comparação, o insight simplesmente não é gerado.
 */
export function gerarInsights(entrada: EntradaInsights): Insight[] {
  const { ano, mes, hoje, categorias, metaDoMes } = entrada;
  const chaveAtual = chaveDoMes(ano, mes);
  const ehMesCorrente = hoje.startsWith(chaveAtual);
  const diaHoje = Number(hoje.slice(8, 10));
  const corte = ehMesCorrente ? diaHoje : 31;
  const nomeDoMes = NOMES_MES[mes - 1];
  const sufixoPeriodo = ehMesCorrente ? ` (até o dia ${diaHoje})` : '';

  const anteriores = mesesAnteriores(ano, mes);
  const porMes = new Map<string, { total: number; porCategoria: Map<number, number> }>();
  for (const t of entrada.despesas) {
    const chave = t.dataTransacao.slice(0, 7);
    if (Number(t.dataTransacao.slice(8, 10)) > corte) continue;
    const item = porMes.get(chave) ?? { total: 0, porCategoria: new Map<number, number>() };
    item.total += t.valor;
    item.porCategoria.set(t.categoriaId, (item.porCategoria.get(t.categoriaId) ?? 0) + t.valor);
    porMes.set(chave, item);
  }
  const atual = porMes.get(chaveAtual) ?? { total: 0, porCategoria: new Map<number, number>() };
  // Só contam os meses anteriores que têm gastos ("com menos, usa o que houver").
  const historico = anteriores.flatMap((chave) => {
    const item = porMes.get(chave);
    return item && item.total > 0 ? [{ chave, ...item }] : [];
  });

  const candidatos: Candidato[] = [];
  const nomeDaCategoria = (id: number) =>
    categorias.find((c) => c.id === id)?.nome ?? 'Sem categoria';

  // --- categoria em alta / em queda em relação à média dos meses anteriores
  if (historico.length > 0) {
    const ids = new Set([
      ...atual.porCategoria.keys(),
      ...historico.flatMap((h) => [...h.porCategoria.keys()]),
    ]);
    const variacoes = [...ids].map((categoriaId) => {
      const media =
        historico.reduce((soma, h) => soma + (h.porCategoria.get(categoriaId) ?? 0), 0) /
        historico.length;
      const valor = atual.porCategoria.get(categoriaId) ?? 0;
      return { categoriaId, media, valor, diferenca: valor - media };
    });
    const relevante = (v: { media: number; diferenca: number }) =>
      Math.abs(v.diferenca) >= LIMIAR_VARIACAO_REAIS &&
      (v.media === 0 ||
        (Math.abs(v.diferenca) / v.media) * 100 >= LIMIAR_VARIACAO_CATEGORIA_PERCENTUAL);

    const alta = variacoes
      .filter((v) => v.diferenca > 0 && relevante(v))
      .sort((a, b) => b.diferenca - a.diferenca)[0];
    if (alta) {
      const nome = nomeDaCategoria(alta.categoriaId);
      const texto =
        alta.media === 0
          ? `${nome} somou ${moeda(alta.valor)} em ${nomeDoMes}${sufixoPeriodo}, sem gastos nos meses anteriores.`
          : `${nome} subiu ${percentual((alta.diferenca / alta.media) * 100)}% em relação à média ${textoMediaAnterior(historico.length)} (${moeda(alta.valor)} contra ${moeda(alta.media)})${ehMesCorrente ? `, no mesmo período (até o dia ${diaHoje})` : ''}.`;
      candidatos.push({
        impacto: alta.diferenca,
        insight: {
          id: `CATEGORIA_EM_ALTA:${alta.categoriaId}`,
          tipo: 'CATEGORIA_EM_ALTA',
          severidade: 'ATENCAO',
          titulo: `${nome} em alta`,
          texto,
          link: { mes, ano, categoriaId: alta.categoriaId, tipo: 'DESPESA' },
        },
      });
    }

    const queda = variacoes
      .filter((v) => v.media > 0 && v.diferenca < 0 && relevante(v))
      .sort((a, b) => a.diferenca - b.diferenca)[0];
    if (queda) {
      const nome = nomeDaCategoria(queda.categoriaId);
      candidatos.push({
        impacto: -queda.diferenca,
        insight: {
          id: `CATEGORIA_EM_QUEDA:${queda.categoriaId}`,
          tipo: 'CATEGORIA_EM_QUEDA',
          severidade: 'POSITIVO',
          titulo: `${nome} em queda`,
          texto: `${nome} caiu ${percentual((-queda.diferenca / queda.media) * 100)}% em relação à média ${textoMediaAnterior(historico.length)} (${moeda(queda.valor)} contra ${moeda(queda.media)}).`,
          link: { mes, ano, categoriaId: queda.categoriaId, tipo: 'DESPESA' },
        },
      });
    }
  }

  // --- as 5 maiores despesas do mês
  const doMes = entrada.despesas
    .filter(
      (t) =>
        t.dataTransacao.startsWith(chaveAtual) && Number(t.dataTransacao.slice(8, 10)) <= corte,
    )
    .sort((a, b) => b.valor - a.valor);
  if (doMes.length >= MINIMO_DE_DESPESAS_PARA_MAIORES && atual.total > 0) {
    const soma = doMes.slice(0, 5).reduce((total, t) => total + t.valor, 0);
    candidatos.push({
      impacto: soma,
      insight: {
        id: 'MAIORES_DESPESAS',
        tipo: 'MAIORES_DESPESAS',
        severidade: 'INFO',
        titulo: 'Maiores despesas',
        texto: `As 5 maiores despesas de ${nomeDoMes} somam ${moeda(soma)}, ou ${percentual((soma / atual.total) * 100)}% do total${sufixoPeriodo}.`,
        link: { mes, ano, tipo: 'DESPESA' },
      },
    });
  }

  // --- total do mês contra o mês anterior (no mesmo período, se o mês está em andamento)
  const mesAnterior = historico.find((h) => h.chave === anteriores[0]);
  if (mesAnterior && atual.total > 0) {
    const diferenca = atual.total - mesAnterior.total;
    const pct = (Math.abs(diferenca) / mesAnterior.total) * 100;
    if (Math.abs(diferenca) >= LIMIAR_VARIACAO_REAIS && pct >= LIMIAR_VARIACAO_TOTAL_PERCENTUAL) {
      const nomeAnterior = NOMES_MES[(mes + 10) % 12];
      const menos = diferenca < 0;
      candidatos.push({
        impacto: Math.abs(diferenca),
        insight: {
          id: 'VARIACAO_TOTAL_MES_ANTERIOR',
          tipo: 'VARIACAO_TOTAL_MES_ANTERIOR',
          severidade: menos ? 'POSITIVO' : 'ATENCAO',
          titulo: menos ? 'Gastos menores que no mês passado' : 'Gastos maiores que no mês passado',
          texto: menos
            ? `Você gastou ${percentual(pct)}% menos que em ${nomeAnterior}${sufixoPeriodo} e economizou ${moeda(-diferenca)}.`
            : `Você gastou ${percentual(pct)}% a mais que em ${nomeAnterior}${sufixoPeriodo}: ${moeda(diferenca)} a mais.`,
          link: { mes, ano, tipo: 'DESPESA' },
        },
      });
    }
  }

  // --- projeção de fim de mês (só no mês corrente)
  if (ehMesCorrente && diaHoje >= MINIMO_DE_DIAS_PARA_PROJECAO && atual.total > 0) {
    const projecao = arredondar((atual.total / diaHoje) * diasNoMes(ano, mes));
    if (projecao > atual.total) {
      const acima = metaDoMes !== null && projecao > metaDoMes;
      const complemento =
        metaDoMes === null
          ? ''
          : acima
            ? `, acima da meta de ${moeda(metaDoMes)}`
            : `, dentro da meta de ${moeda(metaDoMes)}`;
      candidatos.push({
        impacto: projecao - (acima ? (metaDoMes as number) : atual.total),
        insight: {
          id: 'PROJECAO_FIM_DO_MES',
          tipo: 'PROJECAO_FIM_DO_MES',
          severidade: acima ? 'ATENCAO' : metaDoMes === null ? 'INFO' : 'POSITIVO',
          titulo: 'Projeção do mês',
          texto: `Se mantiver o ritmo, terminará ${nomeDoMes} com ${moeda(projecao)} em despesas${complemento}.`,
          link: { mes, ano, tipo: 'DESPESA' },
        },
      });
    }
  }

  // --- muito gasto em "Outros"
  const outros = categorias.find(
    (c) => c.nome === 'Outros' && c.tipo === 'DESPESA' && !c.usuarioId,
  );
  const gastoOutros = outros ? (atual.porCategoria.get(outros.id) ?? 0) : 0;
  if (
    outros &&
    atual.total > 0 &&
    gastoOutros >= LIMIAR_VARIACAO_REAIS &&
    (gastoOutros / atual.total) * 100 >= LIMIAR_OUTROS_PERCENTUAL
  ) {
    candidatos.push({
      impacto: gastoOutros,
      insight: {
        id: 'OUTROS_ALTO',
        tipo: 'OUTROS_ALTO',
        severidade: 'ATENCAO',
        titulo: 'Muito gasto em Outros',
        texto: `${percentual((gastoOutros / atual.total) * 100)}% das despesas estão em Outros. Crie categorias para enxergar melhor.`,
        link: { mes, ano, categoriaId: outros.id, tipo: 'DESPESA' },
      },
    });
  }

  // --- recorrentes: reajuste e assinatura nova, se a última cobrança foi neste mês
  const doMesRecorrente = entrada.recorrencias.filter((r) => r.ultimaData.startsWith(chaveAtual));
  const reajuste = doMesRecorrente
    .filter((r) => !r.valorVariavel && r.valorAnterior !== null && r.valorAtual !== r.valorAnterior)
    .sort(
      (a, b) =>
        Math.abs(b.valorAtual - (b.valorAnterior ?? 0)) -
        Math.abs(a.valorAtual - (a.valorAnterior ?? 0)),
    )[0];
  if (reajuste && reajuste.valorAnterior !== null) {
    const subiu = reajuste.valorAtual > reajuste.valorAnterior;
    candidatos.push({
      impacto: Math.abs(reajuste.valorAtual - reajuste.valorAnterior),
      insight: {
        id: `REAJUSTE_RECORRENTE:${reajuste.chave}`,
        tipo: 'REAJUSTE_RECORRENTE',
        severidade: subiu ? 'ATENCAO' : 'POSITIVO',
        titulo: subiu ? 'Assinatura reajustada' : 'Assinatura mais barata',
        texto: `${reajuste.descricao} passou de ${moeda(reajuste.valorAnterior)} para ${moeda(reajuste.valorAtual)}.`,
        link: { mes, ano, busca: reajuste.chave },
      },
    });
  }
  const nova = doMesRecorrente
    .filter((r) => r.ocorrencias === 3)
    .sort((a, b) => b.valorTipico - a.valorTipico)[0];
  if (nova) {
    candidatos.push({
      impacto: nova.valorTipico,
      insight: {
        id: `ASSINATURA_NOVA:${nova.chave}`,
        tipo: 'ASSINATURA_NOVA',
        severidade: 'INFO',
        titulo: 'Gasto recorrente novo',
        texto: `${nova.descricao} se repete há 3 meses, cerca de ${moeda(nova.valorTipico)} por mês. Veja em Recorrentes.`,
        link: { mes, ano, busca: nova.chave },
      },
    });
  }

  return candidatos
    .sort((a, b) => b.impacto - a.impacto)
    .slice(0, MAXIMO_DE_INSIGHTS)
    .map((c) => c.insight);
}

export class InsightService {
  constructor(
    private readonly transacoes: TransacaoRepository,
    private readonly categorias: CategoriaRepository,
    private readonly metas: MetaRepository,
    private readonly metasCategoria: MetaCategoriaRepository,
    private readonly recorrencias: RecorrenciaService,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  async obter(usuarioId: number, ano: number, mes: number): Promise<Insight[]> {
    const indiceInicio = ano * 12 + (mes - 1) - MESES_DE_HISTORICO;
    const periodo = {
      inicio: new Date(Date.UTC(Math.floor(indiceInicio / 12), indiceInicio % 12, 1)),
      fim: new Date(Date.UTC(ano, mes, 1)),
    };
    const [transacoes, categorias, antigas, metasCategoria, recorrencias] = await Promise.all([
      this.transacoes.listarPorUsuarioEPeriodo(usuarioId, periodo),
      this.categorias.listarVisiveis(usuarioId),
      this.metas.listarDoAno(usuarioId, ano),
      this.metasCategoria.listarDoAno(usuarioId, ano),
      this.recorrencias.listarAtivas(usuarioId),
    ]);
    return gerarInsights({
      ano,
      mes,
      hoje: dataLocalIso(this.agora()),
      despesas: transacoes.filter((t) => t.tipo === 'DESPESA'),
      categorias,
      metaDoMes: metasDoMes(antigas, metasCategoria).get(mes)?.valor ?? null,
      recorrencias,
    });
  }
}
