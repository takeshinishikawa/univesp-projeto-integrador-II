import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { authGuard, visitanteGuard } from './auth.guard';

describe('guards', () => {
  let sessaoValida: boolean;

  beforeEach(() => {
    sessaoValida = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: AuthService, useValue: { sessaoValida: () => sessaoValida } },
      ],
    });
  });

  const executar = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  it('authGuard libera com sessão válida', () => {
    sessaoValida = true;
    expect(executar(authGuard)).toBe(true);
  });

  it('authGuard redireciona para /login sem sessão', () => {
    const resultado = executar(authGuard) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(resultado)).toBe('/login');
  });

  it('visitanteGuard manda usuário autenticado para /dashboard', () => {
    sessaoValida = true;
    const resultado = executar(visitanteGuard) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(resultado)).toBe('/dashboard');
  });

  it('visitanteGuard libera visitante', () => {
    expect(executar(visitanteGuard)).toBe(true);
  });
});
