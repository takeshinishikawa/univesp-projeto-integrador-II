import { Component, computed, input } from '@angular/core';

export type VarianteCard = 'neutra' | 'receita' | 'despesa' | 'alerta';

@Component({
  selector: 'app-card',
  template: `
    <article [class]="classe()">
      <!-- h2: primeiro nível de seção da página (Resumo/Recorrentes só têm um h1, oculto). -->
      <h2 class="card__titulo">{{ titulo() }}</h2>
      <div class="card__corpo"><ng-content /></div>
    </article>
  `,
  styles: `
    :host {
      display: block;
    }

    .card {
      height: 100%;
      padding: var(--espaco-3) var(--espaco-4);
      background: var(--cor-superficie);
      border: 1px solid var(--cor-borda);
      border-left-width: 6px;
      border-radius: var(--raio);
      box-shadow: var(--sombra);
      text-align: right;
    }

    .card__titulo {
      margin: 0 0 var(--espaco-2);
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--cor-texto-suave);
    }

    .card--receita {
      border-left-color: var(--cor-receita);
    }

    .card--despesa {
      border-left-color: var(--cor-despesa);
    }

    .card--alerta {
      background: var(--cor-alerta-fundo);
      border-left-color: var(--cor-alerta);
      color: var(--cor-alerta);
    }

    .card--alerta .card__titulo {
      color: var(--cor-alerta);
    }
  `,
})
export class Card {
  readonly titulo = input.required<string>();
  readonly variante = input<VarianteCard>('neutra');

  protected readonly classe = computed(() => `card card--${this.variante()}`);
}
