import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, switchMap } from 'rxjs';
import { RecorrentesResumo } from '../../../core/models/api.models';
import { RecorrenteService } from '../../recorrentes/recorrente.service';

/** "Já comprometido este mês": cobranças recorrentes previstas que ainda não caíram (só no mês corrente). */
@Component({
  selector: 'app-comprometido',
  imports: [CurrencyPipe, RouterLink],
  template: `
    @if (visivel(); as comprometido) {
      <p class="comprometido">
        <strong>Já comprometido este mês:</strong>
        {{ comprometido.valor | currency: 'BRL' }} em {{ comprometido.quantidade }}
        {{ comprometido.quantidade === 1 ? 'cobrança prevista' : 'cobranças previstas' }}.
        <a routerLink="/recorrentes">Ver recorrentes</a>
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .comprometido {
      padding: var(--espaco-2) var(--espaco-3);
      margin: var(--espaco-3) 0 0;
      background: var(--cor-superficie);
      border: 1px solid var(--cor-borda);
      border-left: 4px solid var(--cor-primaria);
      border-radius: var(--raio);
    }
  `,
})
export class Comprometido {
  private readonly service = inject(RecorrenteService);

  readonly mes = input<number | null>(null);
  readonly ano = input.required<number>();
  /** Muda a cada clique em "Atualizar" para refazer a consulta. */
  readonly atualizacao = input(0);

  private readonly dados = signal<RecorrentesResumo | null>(null);

  private readonly ehMesCorrente = computed(() => {
    const hoje = new Date();
    return this.mes() === hoje.getMonth() + 1 && this.ano() === hoje.getFullYear();
  });

  /** Só aparece no mês corrente e quando há alguma cobrança prevista. */
  protected readonly visivel = computed(() => {
    const comprometido = this.dados()?.comprometidoNoMes;
    return this.ehMesCorrente() && comprometido && comprometido.quantidade > 0
      ? comprometido
      : null;
  });

  constructor() {
    toObservable(this.atualizacao)
      .pipe(
        // Falha aqui só esconde o aviso: não é essencial para o Resumo.
        switchMap(() => this.service.listar().pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(),
      )
      .subscribe((resumo) => this.dados.set(resumo));
  }
}
