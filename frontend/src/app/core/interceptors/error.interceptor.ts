import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError, DetalheErro } from '../models/api-error';
import { AuthService } from '../services/auth.service';

const MENSAGEM_PADRAO: Record<number, string> = {
  0: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
  401: 'Sua sessão expirou. Entre novamente.',
  404: 'Recurso não encontrado.',
  500: 'Erro interno do servidor. Tente novamente em instantes.',
};

/** Traduz o corpo de erro da API (`{ erro, detalhes }`) em um `ApiError` tipado. */
export function mapearErro(resposta: HttpErrorResponse): ApiError {
  const corpo = resposta.error as { erro?: unknown; detalhes?: unknown } | null;
  const mensagem =
    typeof corpo?.erro === 'string'
      ? corpo.erro
      : (MENSAGEM_PADRAO[resposta.status] ?? 'Ocorreu um erro inesperado. Tente novamente.');
  const detalhes = Array.isArray(corpo?.detalhes)
    ? (corpo.detalhes as DetalheErro[]).filter((d) => typeof d?.mensagem === 'string')
    : [];
  return new ApiError(resposta.status, mensagem, detalhes);
}

/**
 * Trata 401 (logout + redirect ao login) e normaliza os erros da API.
 * O 401 do próprio /auth/login (credenciais inválidas) não derruba nada: só exibe a mensagem.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((erro: unknown) => {
      if (!(erro instanceof HttpErrorResponse)) {
        return throwError(() => erro);
      }
      const ehLogin = req.url === `${environment.apiUrl}/auth/login`;
      if (erro.status === 401 && !ehLogin && auth.autenticado()) {
        auth.sair();
      }
      return throwError(() => mapearErro(erro));
    }),
  );
};
