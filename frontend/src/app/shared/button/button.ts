import { Component, computed, input } from '@angular/core';

export type VarianteBotao = 'primary' | 'secondary' | 'danger';

/** Botão reutilizável: sempre um `<button>` nativo (foco, teclado e submit funcionam de graça). */
@Component({
  selector: 'app-button',
  template: `
    <button
      [class]="classe()"
      [type]="type()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel()"
    >
      <ng-content />
    </button>
  `,
  styles: `
    :host {
      display: inline-block;
    }

    .btn {
      min-height: 2.75rem;
      padding: 0.5rem 1.25rem;
      border: 2px solid transparent;
      border-radius: var(--raio);
      font-weight: 600;
      cursor: pointer;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn--primary {
      background: var(--cor-primaria);
      color: #fff;
    }

    .btn--primary:hover:not(:disabled) {
      background: var(--cor-primaria-hover);
    }

    .btn--secondary {
      background: var(--cor-superficie);
      border-color: var(--cor-primaria);
      color: var(--cor-primaria);
    }

    .btn--secondary:hover:not(:disabled) {
      background: var(--cor-primaria-fundo);
    }

    .btn--danger {
      background: var(--cor-despesa);
      color: #fff;
    }

    .btn--danger:hover:not(:disabled) {
      background: #7f1d1d;
    }
  `,
})
export class Button {
  readonly type = input<'button' | 'submit'>('button');
  readonly variant = input<VarianteBotao>('primary');
  readonly disabled = input(false);
  readonly ariaLabel = input<string | null>(null);

  protected readonly classe = computed(() => `btn btn--${this.variant()}`);
}
