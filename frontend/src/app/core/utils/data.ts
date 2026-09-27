import { HttpParams } from '@angular/common/http';
import { FiltroTransacoes, PeriodoFiltro } from '../models/api.models';

/** Data local de hoje em `YYYY-MM-DD` (sem deslocamento de fuso, ao contrário de toISOString). */
export function hojeIso(agora = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/** Converte os filtros de transações em query params, omitindo os que não foram informados. */
export function paramsDoFiltro(filtro: FiltroTransacoes = {}): HttpParams {
  let params = paramsDoPeriodo(filtro);
  if (filtro.busca) params = params.set('busca', filtro.busca);
  if (filtro.categoriaId !== undefined) params = params.set('categoriaId', filtro.categoriaId);
  if (filtro.tipo) params = params.set('tipo', filtro.tipo);
  if (filtro.valorMin !== undefined) params = params.set('valorMin', filtro.valorMin);
  if (filtro.valorMax !== undefined) params = params.set('valorMax', filtro.valorMax);
  return params;
}

/** Converte o filtro de período nos query params `mes`/`ano` aceitos pela API. */
export function paramsDoPeriodo(filtro: PeriodoFiltro = {}): HttpParams {
  let params = new HttpParams();
  if (filtro.ano !== undefined) params = params.set('ano', filtro.ano);
  if (filtro.mes !== undefined) params = params.set('mes', filtro.mes);
  if (filtro.contaId !== undefined) params = params.set('contaId', filtro.contaId);
  return params;
}
