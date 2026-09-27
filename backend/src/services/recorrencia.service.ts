import { RecorrenciaRepository } from '../repositories/recorrencia.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import { Transacao } from '../types';
import { Recorrencia, RecorrentesResumo } from '../types/novas-features';
import { dataLocalIso, diasEntre, somarUmMes } from '../utils/datas';
import { normalizar } from './categorizacao.service';

const MINIMO_DE_MESES = 3;
const INTERVALO_MIN_DIAS = 25;
const INTERVALO_MAX_DIAS = 35;
const PROPORCAO_MINIMA_DE_INTERVALOS = 0.8;
const TOLERANCIA_DO_VALOR = 0.15;
const DIAS_PARA_ENCERRADA = 45;

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

/** Descrição normalizada e sem números, datas nem parcelas ("Loja 02/10" e "Loja 03/10" são a mesma). */
export function chaveDaDescricao(descricao: string): string {
  return normalizar(descricao).replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
}

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

function ehRecorrente(datas: string[]): boolean {
  if (new Set(datas.map((d) => d.slice(0, 7))).size < MINIMO_DE_MESES) return false;
  const intervalos = datas.slice(1).map((data, i) => diasEntre(datas[i], data));
  const regulares = intervalos.filter((d) => d >= INTERVALO_MIN_DIAS && d <= INTERVALO_MAX_DIAS);
  return (
    regulares.length >= MINIMO_DE_MESES - 1 &&
    regulares.length / intervalos.length >= PROPORCAO_MINIMA_DE_INTERVALOS
  );
}

/**
 * Acha os gastos que se repetem todo mês: mesma descrição (sem números) em 3 ou mais meses, com
 * intervalos de 25 a 35 dias. Valores dentro de ±15% da mediana são um valor fixo (tolera reajuste);
 * fora disso, "valor variável" (conta de luz), com o valor médio. `hoje` é YYYY-MM-DD.
 */
export function detectarRecorrencias(
  despesas: ReadonlyArray<Transacao>,
  hoje: string,
  ignoradas: ReadonlySet<string> = new Set(),
): Recorrencia[] {
  const grupos = new Map<string, Transacao[]>();
  for (const t of despesas) {
    if (t.tipo !== 'DESPESA' || t.transferenciaId) continue;
    const chave = chaveDaDescricao(t.descricao);
    if (chave.length < 3) continue;
    grupos.set(chave, [...(grupos.get(chave) ?? []), t]);
  }

  const recorrencias: Recorrencia[] = [];
  for (const [chave, itens] of grupos) {
    const ordenados = [...itens].sort(
      (a, b) => a.dataTransacao.localeCompare(b.dataTransacao) || a.id - b.id,
    );
    if (!ehRecorrente(ordenados.map((t) => t.dataTransacao))) continue;

    const valores = ordenados.map((t) => t.valor);
    const ultima = ordenados[ordenados.length - 1];
    const anterior = ordenados.length > 1 ? ordenados[ordenados.length - 2] : null;
    const central = mediana(valores);
    const valorVariavel = valores.some(
      (v) => Math.abs(v - central) / central > TOLERANCIA_DO_VALOR,
    );
    const media = valores.reduce((soma, v) => soma + v, 0) / valores.length;

    recorrencias.push({
      chave,
      descricao: ultima.descricao,
      categoriaId: ultima.categoriaId,
      valorTipico: arredondar(valorVariavel ? media : central),
      valorAtual: ultima.valor,
      valorAnterior: anterior?.valor ?? null,
      variacaoPercentual:
        !valorVariavel && anterior
          ? Math.round(((ultima.valor - anterior.valor) / anterior.valor) * 1000) / 10
          : null,
      valorVariavel,
      periodicidade: 'MENSAL',
      ultimaData: ultima.dataTransacao,
      proximaData: somarUmMes(ultima.dataTransacao),
      situacao:
        diasEntre(ultima.dataTransacao, hoje) <= DIAS_PARA_ENCERRADA
          ? 'ATIVA'
          : 'POSSIVELMENTE_ENCERRADA',
      ocorrencias: ordenados.length,
      ignorada: ignoradas.has(chave),
    });
  }
  return recorrencias.sort(
    (a, b) => b.valorTipico - a.valorTipico || a.chave.localeCompare(b.chave),
  );
}

/** Custo fixo e o que já está comprometido no mês corrente; as ignoradas não entram nas somas. */
export function resumirRecorrencias(
  recorrencias: ReadonlyArray<Recorrencia>,
  hoje: string,
  incluirIgnoradas: boolean,
): RecorrentesResumo {
  const ativas = recorrencias.filter((r) => !r.ignorada && r.situacao === 'ATIVA');
  const custoMensal = arredondar(ativas.reduce((soma, r) => soma + r.valorTipico, 0));
  // A próxima cobrança cai no mês corrente e ainda não houve lançamento nele (a última foi antes).
  const previstas = ativas.filter((r) => r.proximaData.startsWith(hoje.slice(0, 7)));
  return {
    recorrencias: recorrencias.filter((r) => incluirIgnoradas || !r.ignorada),
    custoMensal,
    custoAnual: arredondar(custoMensal * 12),
    comprometidoNoMes: {
      valor: arredondar(previstas.reduce((soma, r) => soma + r.valorTipico, 0)),
      quantidade: previstas.length,
    },
  };
}

export class RecorrenciaService {
  constructor(
    private readonly transacoes: TransacaoRepository,
    private readonly ignoradas: RecorrenciaRepository,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  async obter(usuarioId: number, incluirIgnoradas = false): Promise<RecorrentesResumo> {
    const hoje = dataLocalIso(this.agora());
    const [todas, ignoradas] = await Promise.all([
      this.transacoes.listarPorUsuarioEPeriodo(usuarioId),
      this.ignoradas.listarIgnoradas(usuarioId),
    ]);
    const recorrencias = detectarRecorrencias(todas, hoje, ignoradas);
    return resumirRecorrencias(recorrencias, hoje, incluirIgnoradas);
  }

  /** As recorrências detectadas e não ignoradas (para os insights). */
  async listarAtivas(usuarioId: number): Promise<Recorrencia[]> {
    return (await this.obter(usuarioId)).recorrencias;
  }

  ignorar(usuarioId: number, chave: string): Promise<void> {
    return this.ignoradas.ignorar(usuarioId, chave);
  }

  desfazer(usuarioId: number, chave: string): Promise<void> {
    return this.ignoradas.desfazer(usuarioId, chave);
  }
}
