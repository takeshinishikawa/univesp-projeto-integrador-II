import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Usuario } from '../models/api.models';
import { AuthService, tokenExpirado } from './auth.service';

function criarToken(exp: number): string {
  const base64 = (obj: object) => btoa(JSON.stringify(obj));
  return `${base64({ alg: 'HS256' })}.${base64({ sub: '1', exp })}.assinatura`;
}

const usuario: Usuario = {
  id: 1,
  nome: 'Ana',
  email: 'ana@exemplo.com',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('tokenExpirado', () => {
  it('detecta expiração pelo campo exp (em segundos)', () => {
    const agora = Date.parse('2026-06-01T12:00:00Z');
    expect(tokenExpirado(criarToken(agora / 1000 - 1), agora)).toBe(true);
    expect(tokenExpirado(criarToken(agora / 1000 + 60), agora)).toBe(false);
  });

  it('trata token malformado como expirado', () => {
    expect(tokenExpirado('lixo')).toBe(true);
  });
});

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('login guarda token e usuário no sessionStorage', () => {
    service.login({ email: 'ana@exemplo.com', senha: '12345678' }).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush({ token: 'jwt', usuario });

    expect(service.autenticado()).toBe(true);
    expect(service.usuario()?.nome).toBe('Ana');
    expect(sessionStorage.getItem('financas.token')).toBe('jwt');
  });

  it('logout limpa a sessão', () => {
    service.login({ email: 'a@a.com', senha: 'x' }).subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: 'jwt', usuario });

    service.logout();

    expect(service.autenticado()).toBe(false);
    expect(service.usuario()).toBeNull();
    expect(sessionStorage.getItem('financas.token')).toBeNull();
  });

  it('sair() limpa a sessão e navega para /login', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    service.sair();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('sessaoValida() derruba a sessão quando o JWT expirou', () => {
    service.login({ email: 'a@a.com', senha: 'x' }).subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: criarToken(1), usuario });

    expect(service.sessaoValida()).toBe(false);
    expect(service.autenticado()).toBe(false);
  });

  it('sessaoValida() aceita JWT ainda válido', () => {
    const futuro = Math.floor(Date.now() / 1000) + 3600;
    service.login({ email: 'a@a.com', senha: 'x' }).subscribe();
    http
      .expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: criarToken(futuro), usuario });

    expect(service.sessaoValida()).toBe(true);
  });
});
