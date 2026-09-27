import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../../core/models/api-error';
import { AuthService } from '../../../core/services/auth.service';
import { digitar, enviarFormulario, mensagensDeErro } from '../../../testing/dom';
import { Registro } from './registro';

describe('Registro', () => {
  const registrar = vi.fn();
  const login = vi.fn();
  let navigate: ReturnType<typeof vi.spyOn>;

  async function criar() {
    const fixture = TestBed.createComponent(Registro);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function preencherValido(el: HTMLElement): void {
    digitar(el, '#registro-nome', '  Ana Souza ');
    digitar(el, '#registro-email', 'ana@exemplo.com');
    digitar(el, '#registro-senha', 'segredo123');
  }

  beforeEach(() => {
    registrar.mockReset();
    login.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { registrar, login } }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('exige nome, e-mail e senha', async () => {
    const { fixture, el } = await criar();
    enviarFormulario(el);
    await fixture.whenStable();

    expect(mensagensDeErro(el)).toHaveLength(3);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('exige senha com no mínimo 8 caracteres', async () => {
    const { fixture, el } = await criar();
    preencherValido(el);
    digitar(el, '#registro-senha', '1234567');
    enviarFormulario(el);
    await fixture.whenStable();

    expect(mensagensDeErro(el)).toEqual(['Use no mínimo 8 caracteres.']);
  });

  it('não pede mais limite de orçamento (a meta é definida por mês, em Metas)', async () => {
    const { el } = await criar();

    expect(el.querySelector('#registro-orcamento')).toBeNull();
  });

  it('registra, entra automaticamente e vai ao dashboard', async () => {
    registrar.mockReturnValue(of({}));
    login.mockReturnValue(of({ token: 't', usuario: {} }));
    const { fixture, el } = await criar();
    preencherValido(el);
    enviarFormulario(el);
    await fixture.whenStable();

    expect(registrar).toHaveBeenCalledWith({
      nome: 'Ana Souza',
      email: 'ana@exemplo.com',
      senha: 'segredo123',
    });
    expect(login).toHaveBeenCalledWith({ email: 'ana@exemplo.com', senha: 'segredo123' });
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('exibe erro 409 de e-mail duplicado', async () => {
    registrar.mockReturnValue(throwError(() => new ApiError(409, 'E-mail já cadastrado')));
    const { fixture, el } = await criar();
    preencherValido(el);
    enviarFormulario(el);
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('E-mail já cadastrado');
    expect(login).not.toHaveBeenCalled();
  });
});
