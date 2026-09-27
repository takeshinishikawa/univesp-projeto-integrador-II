import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Protege rotas privadas; sem sessão válida redireciona para /login. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.sessaoValida() ? true : inject(Router).createUrlTree(['/login']);
};

/** Para /login e /registro: quem já está autenticado vai direto ao dashboard. */
export const visitanteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.sessaoValida() ? inject(Router).createUrlTree(['/dashboard']) : true;
};
