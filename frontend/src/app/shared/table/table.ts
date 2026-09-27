import { Component, input } from '@angular/core';

/**
 * Tabela semântica. Projete `<thead>`/`<tbody>` com `<th scope="col|row">`.
 * A região rolável é focável para que o teclado consiga rolar tabelas largas.
 */
@Component({
  selector: 'app-table',
  template: `
    <div class="tabela" role="region" tabindex="0" [attr.aria-label]="legenda()">
      <table>
        <caption class="sr-only" [textContent]="legenda()"></caption>
        <ng-content />
      </table>
    </div>
  `,
  styles: `
    .tabela {
      position: relative; // contém os textos .sr-only (absolutos) da tabela larga
      overflow-x: auto;
      background: var(--cor-superficie);
      border: 1px solid var(--cor-borda);
      border-radius: var(--raio);
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    :host ::ng-deep th,
    :host ::ng-deep td {
      padding: var(--espaco-2) var(--espaco-3);
      text-align: left;
      border-bottom: 1px solid var(--cor-borda);
    }

    :host ::ng-deep thead th {
      background: var(--cor-fundo);
      font-size: 0.875rem;
    }

    :host ::ng-deep .col-numerica {
      text-align: right;
      white-space: nowrap;
    }
  `,
})
export class Table {
  readonly legenda = input.required<string>();
}
