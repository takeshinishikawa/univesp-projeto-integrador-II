import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, switchMap, tap } from 'rxjs';
import { Insight, LinkInsight, SeveridadeInsight } from '../../../core/models/api.models';
import { nomeDoMes } from '../../../core/utils/formato';
import { DashboardService } from '../dashboard.service';

// Ícone + texto: a cor sozinha não basta (daltonismo, leitores de tela).
const SEVERIDADE: Record<SeveridadeInsight, { icone: string; texto: string }> = {
  INFO: { icone: 'ℹ', texto: 'Informação' },
  ATENCAO: { icone: '⚠', texto: 'Atenção' },
  POSITIVO: { icone: '✓', texto: 'Boa notícia' },
};

/** "O que chamou atenção": até 5 frases sobre o mês, geradas por regras no backend. */
@Component({
  selector: 'app-insights',
  imports: [RouterLink],
  templateUrl: './insights.html',
  styleUrl: './insights.scss',
})
export class Insights {
  private readonly service = inject(DashboardService);

  /** `null` = o ano inteiro (não há insights nesse caso). */
  readonly mes = input<number | null>(null);
  readonly ano = input.required<number>();
  /** Muda a cada clique em "Atualizar" para refazer a consulta. */
  readonly atualizacao = input(0);

  protected readonly insights = signal<Insight[] | null>(null);
  protected readonly carregando = signal(false);
  // Falha aqui não derruba o resto do Resumo: só este card avisa.
  protected readonly erro = signal(false);

  protected readonly periodo = computed(() => {
    const mes = this.mes();
    return mes === null ? '' : `${nomeDoMes(mes)} de ${this.ano()}`;
  });

  constructor() {
    const consulta = computed(() => ({
      mes: this.mes(),
      ano: this.ano(),
      rodada: this.atualizacao(),
    }));

    toObservable(consulta)
      .pipe(
        tap(() => {
          this.erro.set(false);
          this.insights.set(null);
        }),
        switchMap(({ mes, ano }) => {
          if (mes === null) return EMPTY;
          this.carregando.set(true);
          return this.service.obterInsights(ano, mes).pipe(
            catchError(() => {
              this.erro.set(true);
              this.carregando.set(false);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((insights) => {
        this.insights.set(insights);
        this.carregando.set(false);
      });
  }

  protected severidade(insight: Insight): { icone: string; texto: string } {
    return SEVERIDADE[insight.severidade];
  }

  /** Query da tela Transações que mostra as transações do insight. */
  protected params(link: LinkInsight): Record<string, string | number> {
    return {
      mes: link.mes,
      ano: link.ano,
      ...(link.categoriaId !== undefined && { categoriaId: link.categoriaId }),
      ...(link.tipo && { tipo: link.tipo }),
      ...(link.busca && { busca: link.busca }),
    };
  }
}
