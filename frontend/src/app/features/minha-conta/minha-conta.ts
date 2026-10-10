import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { descreverErro } from '../../core/models/api-error';
import { AuthService } from '../../core/services/auth.service';
import { Button } from '../../shared/button/button';
import { FormField } from '../../shared/form-field/form-field';

/** Dados do usuário e exclusão da conta com tudo o que ela guarda (LGPD, art. 18). */
@Component({
  selector: 'app-minha-conta',
  imports: [DatePipe, ReactiveFormsModule, Button, FormField],
  templateUrl: './minha-conta.html',
  styleUrl: './minha-conta.scss',
})
export class MinhaConta {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    ciente: [false, [Validators.requiredTrue]],
    senha: ['', [Validators.required]],
  });

  protected readonly excluindo = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected excluir(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.excluindo.set(true);
    this.erro.set(null);
    this.auth.excluirConta(this.form.getRawValue().senha).subscribe({
      next: () =>
        void this.router.navigate(['/login'], {
          state: { aviso: 'Sua conta e todos os seus dados foram excluídos.' },
        }),
      error: (e: unknown) => {
        this.erro.set(descreverErro(e));
        this.excluindo.set(false);
      },
    });
  }
}
