import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ApiError } from '../models/api-error';
import { AuthService } from '../services/auth.service';
import { errorInterceptor } from './error.interceptor';
import { jwtInterceptor } from './jwt.interceptor';

describe('interceptors', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let auth: AuthService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([jwtInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => controller.verify());

  function autenticar(): void {
    (auth as unknown as { _token: { set(v: string): void } })._token.set('meu-token');
  }

  describe('jwtInterceptor', () => {
    it('anexa Authorization: Bearer nas requisições para a API', () => {
      autenticar();
      http.get(`${environment.apiUrl}/transacoes`).subscribe();
      const req = controller.expectOne(`${environment.apiUrl}/transacoes`);
      expect(req.request.headers.get('Authorization')).toBe('Bearer meu-token');
      req.flush([]);
    });

    it('não envia o token para outras origens', () => {
      autenticar();
      http.get('https://outro-site.com/dados').subscribe();
      const req = controller.expectOne('https://outro-site.com/dados');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });

    it('não anexa header sem token', () => {
      http.get(`${environment.apiUrl}/categorias`).subscribe();
      const req = controller.expectOne(`${environment.apiUrl}/categorias`);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush([]);
    });
  });

  describe('errorInterceptor', () => {
    it('mapeia { erro, detalhes } da API para ApiError', () => {
      let recebido: unknown;
      http.post(`${environment.apiUrl}/transacoes`, {}).subscribe({ error: (e) => (recebido = e) });
      controller.expectOne(`${environment.apiUrl}/transacoes`).flush(
        {
          erro: 'Dados inválidos',
          detalhes: [{ campo: 'valor', mensagem: 'Valor deve ser positivo' }],
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(recebido).toBeInstanceOf(ApiError);
      const erro = recebido as ApiError;
      expect(erro.status).toBe(400);
      expect(erro.message).toBe('Dados inválidos');
      expect(erro.detalhes[0].mensagem).toBe('Valor deve ser positivo');
    });

    it('usa mensagem amigável quando o servidor está inacessível', () => {
      let recebido: ApiError | undefined;
      http.get(`${environment.apiUrl}/categorias`).subscribe({ error: (e) => (recebido = e) });
      controller.expectOne(`${environment.apiUrl}/categorias`).error(new ProgressEvent('error'));

      expect(recebido?.status).toBe(0);
      expect(recebido?.message).toContain('conectar ao servidor');
    });

    it('401 em rota protegida faz logout e redireciona para /login', () => {
      autenticar();
      http.get(`${environment.apiUrl}/transacoes`).subscribe({ error: () => undefined });
      controller
        .expectOne(`${environment.apiUrl}/transacoes`)
        .flush({ erro: 'Token inválido' }, { status: 401, statusText: 'Unauthorized' });

      expect(auth.autenticado()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });

    it('401 do próprio login (credenciais inválidas) só repassa a mensagem', () => {
      let recebido: ApiError | undefined;
      http.post(`${environment.apiUrl}/auth/login`, {}).subscribe({ error: (e) => (recebido = e) });
      controller
        .expectOne(`${environment.apiUrl}/auth/login`)
        .flush({ erro: 'Credenciais inválidas' }, { status: 401, statusText: 'Unauthorized' });

      expect(recebido?.message).toBe('Credenciais inválidas');
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
