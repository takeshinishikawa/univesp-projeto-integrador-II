import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-error';
import { AuthService } from '../../core/services/auth.service';
import { violacoesDeAcessibilidade } from '../../testing/a11y';
import { digitar, enviarFormulario } from '../../testing/dom';
import { MinhaConta } from './minha-conta';

describe('MinhaConta', () => {
  const excluirConta = vi.fn();
  let navigate: ReturnType<typeof vi.spyOn>;

  async function criar() {
    const fixture = TestBed.createComponent(MinhaConta);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function marcarCiente(el: HTMLElement) {
    const caixa = el.querySelector<HTMLInputElement>('#excluir-ciente')!;
    caixa.checked = true;
    caixa.dispatchEvent(new Event('change'));
  }

  beforeEach(() => {
    excluirConta.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            excluirConta,
            usuario: () => ({
              id: 1,
              nome: 'Ana',
              email: 'ana@exemplo.com',
              createdAt: '2026-08-22T12:00:00.000Z',
            }),
          },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('mostra os dados do usuário, sem violações de acessibilidade (axe-core)', async () => {
    const { el } = await criar();

    expect(el.querySelector('.dados')?.textContent).toContain('ana@exemplo.com');
    expect(el.querySelector('#excluir-senha')?.getAttribute('aria-required')).toBe('true');
    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('não chama a API sem a confirmação e a senha', async () => {
    const { fixture, el } = await criar();
    enviarFormulario(el);
    await fixture.whenStable();

    expect(el.querySelector('#excluir-ciente-erro')?.textContent).toContain('Marque a caixa');
    expect(excluirConta).not.toHaveBeenCalled();
    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('exclui com a senha e volta ao login com o aviso', async () => {
    excluirConta.mockReturnValue(of(undefined));
    const { fixture, el } = await criar();
    marcarCiente(el);
    digitar(el, '#excluir-senha', 'senha-segura-123');
    enviarFormulario(el);
    await fixture.whenStable();

    expect(excluirConta).toHaveBeenCalledWith('senha-segura-123');
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      state: { aviso: 'Sua conta e todos os seus dados foram excluídos.' },
    });
  });

  it('mostra o erro da API (ex.: senha incorreta) e continua na página', async () => {
    excluirConta.mockReturnValue(throwError(() => new ApiError(401, 'Senha incorreta')));
    const { fixture, el } = await criar();
    marcarCiente(el);
    digitar(el, '#excluir-senha', 'errada');
    enviarFormulario(el);
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Senha incorreta');
    expect(navigate).not.toHaveBeenCalled();
  });
});
