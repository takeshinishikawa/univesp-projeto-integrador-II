import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ChartConfiguration, Plugin } from 'chart.js';
import { catchError, EMPTY, switchMap, tap } from 'rxjs';
import { descreverErro } from '../../../core/models/api-error';
import { TotaisPorCategoria } from '../../../core/models/api.models';
import { formatarMoeda, formatarPercentual, nomeDoMes } from '../../../core/utils/formato';
import { Grafico } from '../../../shared/grafico/grafico';
import { DashboardService } from '../dashboard.service';

// Paleta de Okabe-Ito (distinguível por daltônicos); a tabela ao lado traz nome e percentual
// (a legenda do Chart.js fica desligada para não duplicar a mesma informação).
const PALETA = [
  '#0072b2',
  '#e69f00',
  '#009e73',
  '#cc79a7',
  '#d55e00',
  '#56b4e9',
  '#7a6f00',
  '#4a5568',
];

// Escreve o total no centro da rosca (igual ao protótipo de alta fidelidade); usa o `total` do
// próprio dataset, então funciona com qualquer gráfico de rosca que receba esse plugin.
function criarPluginTotalCentral(textoTotal: () => string): Plugin<'doughnut'> {
  return {
    id: 'totalCentral',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      const x = (chartArea.left + chartArea.right) / 2;
      const y = (chartArea.top + chartArea.bottom) / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1a2433';
      ctx.font = "700 15px system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText(textoTotal(), x, y - 8);
      ctx.fillStyle = '#4a5568';
      ctx.font = "11px system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText('total', x, y + 10);
      ctx.restore();
    },
  };
}

@Component({
  selector: 'app-grafico-categorias',
  imports: [CurrencyPipe, DecimalPipe, RouterLink, Grafico],
  templateUrl: './grafico-categorias.html',
  styleUrl: './grafico-categorias.scss',
})
export class GraficoCategorias {
  private readonly service = inject(DashboardService);

  /** `null` = o ano inteiro. */
  readonly mes = input<number | null>(null);
  readonly ano = input.required<number>();
  /** Muda a cada clique em "Atualizar" para refazer a consulta. */
  readonly atualizacao = input(0);
  /** Conta filtrada; `null` = todas. */
  readonly contaId = input<number | null>(null);

  protected readonly dados = signal<TotaisPorCategoria | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly periodo = computed(() => {
    const mes = this.mes();
    return mes === null ? `todo o ano de ${this.ano()}` : `${nomeDoMes(mes)} de ${this.ano()}`;
  });

  protected readonly resumoTexto = computed(() => {
    const dados = this.dados();
    const maior = dados?.categorias[0];
    if (!dados || !maior) return '';
    return (
      `${maior.categoria} é ${formatarPercentual(maior.percentual)} das despesas de ` +
      `${this.periodo()} (${formatarMoeda(maior.total)} de ${formatarMoeda(dados.total)}).`
    );
  });

  protected readonly descricao = computed(() => {
    const dados = this.dados();
    if (!dados) return '';
    const lista = dados.categorias
      .map((c) => `${c.categoria}, ${formatarPercentual(c.percentual)}`)
      .join('; ');
    return (
      `Gráfico de rosca com as despesas por categoria em ${this.periodo()}. ${lista}. ` +
      'Os mesmos valores estão na tabela ao lado.'
    );
  });

  protected readonly configuracao = computed<ChartConfiguration | null>(() => {
    const dados = this.dados();
    if (!dados) return null;
    return {
      type: 'doughnut',
      data: {
        labels: dados.categorias.map((c) => `${c.categoria} (${formatarPercentual(c.percentual)})`),
        datasets: [
          {
            data: dados.categorias.map((c) => c.total),
            backgroundColor: dados.categorias.map((_, i) => PALETA[i % PALETA.length]),
            borderColor: '#ffffff',
            borderWidth: 2,
          },
        ],
      },
      plugins: [criarPluginTotalCentral(() => formatarMoeda(dados.total))],
      options: {
        plugins: {
          // A tabela ao lado (sempre visível) já mostra cor, nome e percentual de cada categoria.
          legend: { display: false },
          tooltip: {
            callbacks: { label: (item) => ` ${formatarMoeda(Number(item.parsed))}` },
          },
        },
      },
    };
  });

  constructor() {
    const consulta = computed(() => ({
      filtro: {
        mes: this.mes() ?? undefined,
        ano: this.ano(),
        ...(this.contaId() !== null && { contaId: this.contaId() as number }),
      },
      rodada: this.atualizacao(),
    }));

    toObservable(consulta)
      .pipe(
        tap(() => {
          this.carregando.set(true);
          this.erro.set(null);
        }),
        switchMap(({ filtro }) =>
          this.service.obterCategorias(filtro, 'DESPESA').pipe(
            catchError((e: unknown) => {
              this.erro.set(descreverErro(e));
              this.carregando.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((dados) => {
        this.dados.set(dados);
        this.carregando.set(false);
      });
  }

  protected corDaCategoria(indice: number): string {
    return PALETA[indice % PALETA.length];
  }
}
