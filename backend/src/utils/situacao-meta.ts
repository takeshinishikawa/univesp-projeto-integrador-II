import { LIMITE_ATENCAO_META_PERCENTUAL, SituacaoMeta } from '../types';

const emCentavos = (valor: number): number => Math.round(valor * 100);

/**
 * `DENTRO` até 79,99% da meta, `ATENCAO` de 80% até a meta inclusive, `ESTOURADA` acima dela.
 * Compara em centavos inteiros para não errar nos limites por causa de ponto flutuante.
 */
export function situacaoDaMeta(gasto: number, meta: number): SituacaoMeta {
  const g = emCentavos(gasto);
  const m = emCentavos(meta);
  if (g > m) return 'ESTOURADA';
  if (g * 100 >= m * LIMITE_ATENCAO_META_PERCENTUAL) return 'ATENCAO';
  return 'DENTRO';
}

/** Quanto da meta foi usado, com 1 casa decimal (pode passar de 100). Meta zero não ocorre. */
export function percentualDaMeta(gasto: number, meta: number): number {
  const m = emCentavos(meta);
  return m === 0 ? 0 : Math.round((emCentavos(gasto) * 1000) / m) / 10;
}
