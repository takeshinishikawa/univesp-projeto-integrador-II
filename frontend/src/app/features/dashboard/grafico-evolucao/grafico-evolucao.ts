import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ChartConfiguration, ChartDataset } from 'chart.js';
import { catchError, EMPTY, switchMap, tap } from 'rxjs';
import { descreverErro } from '../../../core/models/api-error';
import { EvolucaoMensal } from '../../../core/models/api.models';
import { ABREVIACOES_MESES, formatarMoeda, nomeDoMes } from '../../../core/utils/formato';
import { Grafico } from '../../../shared/grafico/grafico';
import { DashboardService } from '../dashboard.service';

// Contraste >= 4.5:1 sobre branco; as séries também se distinguem por forma (barra x linha tracejada).
const COR_RECEITA = '#166534';
const COR_DESPESA = '#991b1b';
const COR_SALDO = '#1d4ed8';
const COR_LIMITE = '#a16207'; // âmbar: a mesma cor do estado "perto do limite" em Metas; distinta do vermelho de Despesas
const COR_DESTAQUE = '#1d4ed8'; // mesma cor do Saldo: evita um contorno escuro "pesado" competindo com a marca de meta

@Component({
  selector: 'app-grafico-evolucao',
  imports: [CurrencyPipe, RouterLink, Grafico],
  templateUrl: './grafico-evolucao.html',
  styleUrl: './grafico-evolucao.scss',
})
export class GraficoEvolucao {
  private readonly service = inject(DashboardService);

  /** Ano exibido (12 meses). */
  readonly ano = input.required<number>();
  /** Mês em destaque (o mesmo do seletor do dashboard); `null` = todos. */
  readonly mes = input<number | null>(null);
  /** Muda a cada clique em "Atualizar" para refazer a consulta. */
  readonly atualizacao = input(0);
  /** Conta filtrada; `null` = todas. */
  readonly contaId = input<number | null>(null);
  readonly mesEscolhido = output<number>();

  protected readonly dados = signal<EvolucaoMensal | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly temMovimento = computed(() =>
    (this.dados()?.meses ?? []).some((m) => m.totalReceitas > 0 || m.totalDespesas > 0),
  );

  protected readonly temMetas = computed(() =>
    (this.dados()?.meses ?? []).some((m) => m.orcamentoLimite !== null),
  );

  protected readonly resumoTexto = computed(() => {
    const dados = this.dados();
    if (!dados || !this.temMovimento()) return '';

    const maiorDespesa = dados.meses.reduce((maior, m) =>
      m.totalDespesas > maior.totalDespesas ? m : maior,
    );
    const saldoAno = dados.meses.reduce((soma, m) => soma + m.saldo, 0);
    const partes = [
      `Maior despesa em ${nomeDoMes(maiorDespesa.mes)}: ${formatarMoeda(maiorDespesa.totalDespesas)}.`,
      `Saldo acumulado em ${dados.ano}: ${formatarMoeda(Math.round(saldoAno * 100) / 100)}.`,
    ];
    return partes.join(' ');
  });

  protected readonly descricao = computed(() => {
    const dados = this.dados();
    if (!dados) return '';
    return (
      `Gráfico de colunas com as receitas e as despesas de cada mês de ${dados.ano}, ` +
      'e uma linha tracejada com o saldo' +
      (this.temMetas() ? ', com um traço marcando a meta de gastos dos meses que têm meta' : '') +
      `. ${this.resumoTexto()} ` +
      'Os mesmos valores estão na tabela logo abaixo.'
    );
  });

  protected readonly configuracao = computed<ChartConfiguration | null>(() => {
    const dados = this.dados();
    if (!dados) return null;
    const destaque = this.mes();
    const larguraBorda = dados.meses.map((m) => (m.mes === destaque ? 2 : 0));

    const conjuntos: ChartDataset[] = [
      {
        type: 'bar',
        label: 'Receitas',
        data: dados.meses.map((m) => m.totalReceitas),
        backgroundColor: COR_RECEITA,
        borderColor: COR_DESTAQUE,
        borderWidth: larguraBorda,
        order: 3,
      },
      {
        type: 'bar',
        label: 'Despesas',
        data: dados.meses.map((m) => m.totalDespesas),
        backgroundColor: COR_DESPESA,
        borderColor: COR_DESTAQUE,
        borderWidth: larguraBorda,
        order: 3,
      },
      {
        type: 'line',
        label: 'Saldo',
        data: dados.meses.map((m) => m.saldo),
        borderColor: COR_SALDO,
        backgroundColor: COR_SALDO,
        borderDash: [8, 4],
        borderWidth: 2,
        pointStyle: 'rectRot',
        pointRadius: 5,
        tension: 0.2,
        order: 1,
      },
    ];
    if (this.temMetas()) {
      // Um traço por mês com meta (as metas variam de mês para mês); meses sem meta ficam sem marca.
      conjuntos.push({
        type: 'line',
        label: 'Meta de gastos',
        data: dados.meses.map((m) => m.orcamentoLimite),
        borderColor: COR_LIMITE,
        backgroundColor: COR_LIMITE,
        showLine: false,
        pointStyle: 'line',
        pointRadius: 10,
        pointBorderWidth: 3,
        order: 0,
      });
    }

    return {
      type: 'bar',
      data: { labels: [...ABREVIACOES_MESES], datasets: conjuntos },
      options: {
        interaction: { mode: 'index', intersect: false },
        onClick: (_evento, elementos) => {
          if (elementos.length > 0) this.mesEscolhido.emit(elementos[0].index + 1);
        },
        onHover: (evento, elementos) => {
          const canvas = evento.native?.target as HTMLElement | null | undefined;
          if (canvas) canvas.style.cursor = elementos.length > 0 ? 'pointer' : 'default';
        },
        scales: {
          y: { ticks: { callback: (valor) => formatarMoeda(Number(valor)) } },
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${formatarMoeda(Number(item.parsed.y))}`,
            },
          },
        },
      },
    };
  });

  constructor() {
    const consulta = computed(() => ({
      ano: this.ano(),
      contaId: this.contaId(),
      rodada: this.atualizacao(),
    }));

    toObservable(consulta)
      .pipe(
        tap(() => {
          this.carregando.set(true);
          this.erro.set(null);
        }),
        switchMap(({ ano, contaId }) =>
          (contaId === null
            ? this.service.obterEvolucao(ano)
            : this.service.obterEvolucao(ano, contaId)
          ).pipe(
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

  protected nomeCapitalizado(mes: number): string {
    const nome = nomeDoMes(mes);
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }
}
