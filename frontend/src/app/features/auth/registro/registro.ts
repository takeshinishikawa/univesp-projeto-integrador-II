import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { descreverErro } from '../../../core/models/api-error';
import { AuthService } from '../../../core/services/auth.service';
import { Button } from '../../../shared/button/button';
import { FormField } from '../../../shared/form-field/form-field';

@Component({
  selector: 'app-registro',
  imports: [ReactiveFormsModule, RouterLink, Button, FormField],
  templateUrl: './registro.html',
  styleUrl: '../auth.scss',
})
export class Registro {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  // Limites espelham o backend (registrarUsuarioSchema).
  protected readonly form = inject(FormBuilder).nonNullable.group({
    nome: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    senha: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
  });

  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected criarConta(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { nome, email, senha } = this.form.getRawValue();
    this.enviando.set(true);
    this.erro.set(null);

    // A API de registro não devolve token: após criar a conta, entra automaticamente.
    this.auth
      .registrar({ nome: nome.trim(), email, senha })
      .pipe(switchMap(() => this.auth.login({ email, senha })))
      .subscribe({
        next: () => void this.router.navigate(['/dashboard']),
        error: (e: unknown) => {
          this.erro.set(descreverErro(e));
          this.enviando.set(false);
        },
      });
  }
}
