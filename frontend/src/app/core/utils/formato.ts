export const NOMES_MESES = [
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
] as const;

export const ABREVIACOES_MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percentual = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** `1234.5` → `R$ 1.234,50` (para textos montados em código; nos templates use o `currency` pipe). */
export function formatarMoeda(valor: number): string {
  return moeda.format(valor);
}

/** `38.2` → `38,2%` */
export function formatarPercentual(valor: number): string {
  return `${percentual.format(valor)}%`;
}

/** Nome do mês (1-12) em minúsculas; `''` fora da faixa. */
export function nomeDoMes(mes: number): string {
  return NOMES_MESES[mes - 1] ?? '';
}
