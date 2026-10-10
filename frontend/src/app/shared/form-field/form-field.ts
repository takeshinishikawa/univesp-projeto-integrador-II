import { afterRenderEffect, Component, computed, ElementRef, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ValidationErrors } from '@angular/forms';
import { scan, startWith, switchMap } from 'rxjs';

// 0.01 -> 0,01 (vírgula decimal do pt-BR; não depende do LOCALE_ID, que não existe fora do DI)
const formatarNumero = (n: number): string =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/**
 * O campo é obrigatório se os validadores dele recusam o valor vazio com `required`. Assim entram
 * tanto `Validators.required` quanto os validadores próprios que devolvem `{ required: true }`
 * (ex.: o select com 0 = "Selecione…").
 */
export function campoObrigatorio(controle: AbstractControl): boolean {
  return controle.validator?.(new FormControl(null))?.['required'] === true;
}

export function mensagemDeErro(erros: ValidationErrors | null): string | null {
  if (!erros) return null;
  if (erros['required']) return 'Campo obrigatório.';
  if (erros['email']) return 'Informe um e-mail válido.';
  if (erros['minlength']) return `Use no mínimo ${erros['minlength'].requiredLength} caracteres.`;
  if (erros['maxlength']) return `Use no máximo ${erros['maxlength'].requiredLength} caracteres.`;
  if (erros['min']) return `O valor deve ser maior ou igual a ${formatarNumero(erros['min'].min)}.`;
  if (erros['max']) return `O valor deve ser menor ou igual a ${formatarNumero(erros['max'].max)}.`;
  if (erros['pattern']) return 'Formato inválido.';
  return 'Valor inválido.';
}

/**
 * Rótulo + campo (projetado) + dica + mensagem de erro.
 * O `<input>`/`<select>` projetado precisa ter `id` igual a `inputId`; os atributos
 * `aria-invalid`, `aria-describedby` e `aria-required` são mantidos aqui.
 */
@Component({
  selector: 'app-form-field',
  template: `
    <label class="campo__rotulo" [for]="inputId()">
      {{ label() }}
      @if (opcional()) {
        <span class="campo__opcional">(opcional)</span>
      }
    </label>
    <ng-content />
    @if (dica()) {
      <p class="campo__dica" [id]="idDica()">{{ dica() }}</p>
    }
    @if (mensagem(); as texto) {
      <p class="campo__erro" [id]="idErro()" role="alert">{{ texto }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--espaco-3);
    }

    .campo__rotulo {
      display: block;
      margin-bottom: var(--espaco-1);
      font-weight: 600;
    }

    .campo__opcional {
      font-weight: 400;
      color: var(--cor-texto-suave);
    }

    .campo__dica,
    .campo__erro {
      margin: var(--espaco-1) 0 0;
      font-size: 0.875rem;
    }

    .campo__dica {
      color: var(--cor-texto-suave);
    }

    .campo__erro {
      color: var(--cor-despesa);
      font-weight: 600;
    }
  `,
})
export class FormField {
  readonly label = input.required<string>();
  readonly inputId = input.required<string>();
  readonly control = input.required<AbstractControl>();
  readonly dica = input<string | null>(null);
  readonly opcional = input(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // Contador que muda a cada evento do controle (valor, status, touched...), para o computed reagir.
  private readonly versao = toSignal(
    toObservable(this.control).pipe(
      switchMap((c) => c.events.pipe(startWith(null))),
      scan((n) => n + 1, 0),
    ),
    { initialValue: 0 },
  );

  protected readonly idErro = computed(() => `${this.inputId()}-erro`);
  protected readonly idDica = computed(() => `${this.inputId()}-dica`);

  protected readonly mensagem = computed(() => {
    this.versao();
    const controle = this.control();
    return controle.touched && controle.invalid ? mensagemDeErro(controle.errors) : null;
  });

  constructor() {
    afterRenderEffect(() => {
      const campo = this.host.nativeElement.querySelector('input, select, textarea');
      if (!campo) return;
      const ids = [this.dica() ? this.idDica() : null, this.mensagem() ? this.idErro() : null]
        .filter(Boolean)
        .join(' ');
      campo.setAttribute('aria-invalid', this.mensagem() ? 'true' : 'false');
      // Leitores de tela anunciam "obrigatório" (WCAG 3.3.2), sem ligar a validação nativa do HTML.
      if (campoObrigatorio(this.control())) campo.setAttribute('aria-required', 'true');
      else campo.removeAttribute('aria-required');
      if (ids) campo.setAttribute('aria-describedby', ids);
      else campo.removeAttribute('aria-describedby');
    });
  }
}
