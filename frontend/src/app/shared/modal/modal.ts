import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  viewChild,
} from '@angular/core';

let proximoId = 0;

/**
 * Modal sobre o `<dialog>` nativo: o navegador cuida do foco preso, do `inert` no restante da
 * página e devolve o foco ao elemento que abriu. `Esc` emite `fechar`.
 * Uso: renderize dentro de `@if (aberto())` e trate `(fechar)`.
 */
@Component({
  selector: 'app-modal',
  template: `
    <dialog #dialogo class="modal" [attr.aria-labelledby]="idTitulo" (cancel)="aoCancelar($event)">
      <header class="modal__cabecalho">
        <h2 class="modal__titulo" [id]="idTitulo">{{ titulo() }}</h2>
        <button type="button" class="modal__fechar" aria-label="Fechar" (click)="fechar.emit()">
          <span aria-hidden="true">&times;</span>
        </button>
      </header>
      <div class="modal__corpo"><ng-content /></div>
    </dialog>
  `,
  styles: `
    .modal {
      width: min(100% - 2rem, 32rem);
      max-height: calc(100vh - 2rem);
      padding: var(--espaco-4);
      overflow-y: auto;
      color: var(--cor-texto);
      background: var(--cor-superficie);
      border: 1px solid var(--cor-borda);
      border-radius: var(--raio);
    }

    .modal::backdrop {
      background: rgb(26 36 51 / 60%);
    }

    .modal__cabecalho {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--espaco-3);
    }

    .modal__titulo {
      margin: 0 0 var(--espaco-3);
    }

    .modal__fechar {
      min-width: 2.75rem;
      min-height: 2.75rem;
      font-size: 1.5rem;
      line-height: 1;
      background: transparent;
      border: 0;
      border-radius: var(--raio);
      cursor: pointer;
    }
  `,
})
export class Modal implements AfterViewInit, OnDestroy {
  readonly titulo = input.required<string>();
  readonly fechar = output<void>();

  protected readonly idTitulo = `modal-titulo-${proximoId++}`;
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  ngAfterViewInit(): void {
    const el = this.dialogo().nativeElement;
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', ''); // ambientes sem suporte a <dialog> modal (ex.: jsdom)
  }

  ngOnDestroy(): void {
    const el = this.dialogo().nativeElement;
    if (typeof el.close === 'function' && el.open) el.close();
  }

  protected aoCancelar(evento: Event): void {
    evento.preventDefault(); // quem controla o ciclo de vida é o pai (@if)
    this.fechar.emit();
  }
}
