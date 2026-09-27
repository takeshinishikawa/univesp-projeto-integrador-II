import { MetaCategoriaLinha } from '../repositories/meta-categoria.repository';
import { OrigemMeta } from '../types';

export interface MetaDoMes {
  valor: number;
  origem: OrigemMeta;
}

/**
 * A meta de gastos de cada mês do ano. Ela é a soma das metas por categoria do mês; só quando o mês
 * não tem nenhuma categoria com meta vale a meta total antiga (definida antes das metas por
 * categoria), se existir. Mês sem nenhuma das duas não entra no mapa. A soma é feita em centavos.
 */
export function metasDoMes(
  antigas: ReadonlyMap<number, number>,
  categorias: ReadonlyArray<Pick<MetaCategoriaLinha, 'mes' | 'valor'>>,
): Map<number, MetaDoMes> {
  const centavos = new Map<number, number>();
  for (const { mes, valor } of categorias) {
    centavos.set(mes, (centavos.get(mes) ?? 0) + Math.round(valor * 100));
  }

  const metas = new Map<number, MetaDoMes>();
  for (const [mes, soma] of centavos) metas.set(mes, { valor: soma / 100, origem: 'CATEGORIAS' });
  for (const [mes, valor] of antigas) {
    if (!metas.has(mes)) metas.set(mes, { valor, origem: 'ANTIGA' });
  }
  return metas;
}

/** Só os valores, para quem não precisa saber de onde a meta veio. */
export function valoresDasMetas(metas: ReadonlyMap<number, MetaDoMes>): Map<number, number> {
  return new Map([...metas].map(([mes, meta]) => [mes, meta.valor]));
}
