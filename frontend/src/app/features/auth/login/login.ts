import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { descreverErro } from '../../../core/models/api-error';
import { AuthService } from '../../../core/services/auth.service';
import { Button } from '../../../shared/button/button';
import { FormField } from '../../../shared/form-field/form-field';

function lerAviso(): string | null {
  const aviso: unknown = typeof history === 'undefined' ? null : history.state?.aviso;
  return typeof aviso === 'string' ? aviso : null;
}

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, Button, FormField],
  templateUrl: './login.html',
  styleUrl: '../auth.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required]],
  });

  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);
  /** Recado de quem trouxe até aqui (ex.: conta excluída), passado no `state` da navegação. */
  protected readonly aviso = signal<string | null>(lerAviso());

  protected entrar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigate(['/dashboard']),
      error: (e: unknown) => {
        this.erro.set(descreverErro(e));
        this.enviando.set(false);
      },
    });
  }
}
