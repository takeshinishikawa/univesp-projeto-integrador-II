/** Datas do domínio são strings YYYY-MM-DD; estas funções trabalham em UTC para não deslocar o dia. */

const paraUtc = (iso: string): number => {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
};

const doisDigitos = (n: number): string => String(n).padStart(2, '0');

export const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Data local (a do usuário) de um instante, no formato YYYY-MM-DD. */
export function dataLocalIso(instante: Date): string {
  return `${instante.getFullYear()}-${doisDigitos(instante.getMonth() + 1)}-${doisDigitos(instante.getDate())}`;
}

/** Dias corridos de `a` até `b` (negativo se `b` é anterior). */
export function diasEntre(a: string, b: string): number {
  return Math.round((paraUtc(b) - paraUtc(a)) / MS_POR_DIA);
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Mesmo dia do mês seguinte (31/01 vira 28/02 ou 29/02). */
export function somarUmMes(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const indice = ano * 12 + mes; // mês seguinte, base 0
  const anoNovo = Math.floor(indice / 12);
  const mesNovo = (indice % 12) + 1;
  return `${anoNovo}-${doisDigitos(mesNovo)}-${doisDigitos(Math.min(dia, diasNoMes(anoNovo, mesNovo)))}`;
}

/** Diferença em meses de calendário entre dois pares (ano, mês): b − a. */
export function mesesEntre(anoA: number, mesA: number, anoB: number, mesB: number): number {
  return anoB * 12 + mesB - (anoA * 12 + mesA);
}

/** Mesmo dia `n` meses depois (ou antes, com `n` negativo), limitado ao último dia do mês. */
export function somarMeses(iso: string, n: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const indice = ano * 12 + (mes - 1) + n;
  const anoNovo = Math.floor(indice / 12);
  const mesNovo = (indice % 12) + 1;
  const diaNovo = Math.min(dia, diasNoMes(anoNovo, mesNovo));
  return `${anoNovo}-${doisDigitos(mesNovo)}-${doisDigitos(diaNovo)}`;
}
