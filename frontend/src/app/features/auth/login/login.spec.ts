import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../../core/models/api-error';
import { AuthService } from '../../../core/services/auth.service';
import { violacoesDeAcessibilidade } from '../../../testing/a11y';
import { digitar, enviarFormulario, mensagensDeErro } from '../../../testing/dom';
import { Login } from './login';

describe('Login', () => {
  const login = vi.fn();
  let navigate: ReturnType<typeof vi.spyOn>;

  async function criar() {
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    login.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { login } }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('exibe erros inline e não chama a API com o formulário vazio', async () => {
    const { fixture, el } = await criar();
    enviarFormulario(el);
    await fixture.whenStable();

    expect(mensagensDeErro(el)).toEqual(['Campo obrigatório.', 'Campo obrigatório.']);
    expect(el.querySelector('#login-email')?.getAttribute('aria-invalid')).toBe('true');
    expect(login).not.toHaveBeenCalled();
    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('sem violações de acessibilidade (axe-core) no estado inicial', async () => {
    const { el } = await criar();

    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('rejeita e-mail em formato inválido', async () => {
    const { fixture, el } = await criar();
    digitar(el, '#login-email', 'nao-e-email');
    digitar(el, '#login-senha', 'segredo123');
    enviarFormulario(el);
    await fixture.whenStable();

    expect(mensagensDeErro(el)).toEqual(['Informe um e-mail válido.']);
    expect(login).not.toHaveBeenCalled();
  });

  it('autentica e redireciona para /dashboard', async () => {
    login.mockReturnValue(of({ token: 't', usuario: {} }));
    const { fixture, el } = await criar();
    digitar(el, '#login-email', 'ana@exemplo.com');
    digitar(el, '#login-senha', 'segredo123');
    enviarFormulario(el);
    await fixture.whenStable();

    expect(login).toHaveBeenCalledWith({ email: 'ana@exemplo.com', senha: 'segredo123' });
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('mostra a mensagem da API quando as credenciais são inválidas', async () => {
    login.mockReturnValue(throwError(() => new ApiError(401, 'Credenciais inválidas')));
    const { fixture, el } = await criar();
    digitar(el, '#login-email', 'ana@exemplo.com');
    digitar(el, '#login-senha', 'errada');
    enviarFormulario(el);
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Credenciais inválidas');
    expect(navigate).not.toHaveBeenCalled();
  });
});
