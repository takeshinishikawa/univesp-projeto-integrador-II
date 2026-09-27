export interface Periodo {
  inicio: Date; // inclusivo
  fim: Date; // exclusivo
}

// Sem mes/ano retorna undefined (sem filtro). Só ano = ano inteiro.
export function calcularPeriodo(mes?: number, ano?: number): Periodo | undefined {
  if (ano === undefined) return undefined;
  if (mes === undefined) {
    return { inicio: new Date(Date.UTC(ano, 0, 1)), fim: new Date(Date.UTC(ano + 1, 0, 1)) };
  }
  return { inicio: new Date(Date.UTC(ano, mes - 1, 1)), fim: new Date(Date.UTC(ano, mes, 1)) };
}
