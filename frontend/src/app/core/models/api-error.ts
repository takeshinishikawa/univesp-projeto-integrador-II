export interface DetalheErro {
  campo: string;
  mensagem: string;
}

/** Erro normalizado pelo error.interceptor: é o que os componentes recebem no `error` do Observable. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly detalhes: DetalheErro[] = [],
  ) {
    super(mensagem);
    this.name = 'ApiError';
  }
}

/** Texto pronto para exibir na UI (mensagem + detalhes de validação, se houver). */
export function descreverErro(erro: unknown): string {
  if (erro instanceof ApiError) {
    const detalhes = erro.detalhes.map((d) => d.mensagem).join(' ');
    return detalhes ? `${erro.message} ${detalhes}` : erro.message;
  }
  return 'Ocorreu um erro inesperado. Tente novamente.';
}
