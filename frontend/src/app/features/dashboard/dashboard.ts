import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, map, of, switchMap, tap } from 'rxjs';
import { Conta, ResumoFinanceiro } from '../../core/models/api.models';
import { descreverErro } from '../../core/models/api-error';
import { formatarMoeda, nomeDoMes } from '../../core/utils/formato';
import { Card } from '../../shared/card/card';
import { SeletorPeriodo } from '../../shared/seletor-periodo/seletor-periodo';
import { ContaService } from '../contas/conta.service';
import { Comprometido } from './comprometido/comprometido';
import { DashboardService } from './dashboard.service';
import { GraficoCategorias } from './grafico-categorias/grafico-categorias';
import { GraficoEvolucao } from './grafico-evolucao/grafico-evolucao';
import { Insights } from './insights/insights';
import { MetasCategoria } from './metas-categoria/metas-categoria';
import { ObjetivosResumo } from './objetivos-resumo/objetivos-resumo';

@Component({
  selector: 'app-dashboard',
  imports: [
    CurrencyPipe,
    RouterLink,
    Card,
    Comprometido,
    GraficoCategorias,
    GraficoEvolucao,
    Insights,
    MetasCategoria,
    ObjetivosResumo,
    SeletorPeriodo,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly service = inject(DashboardService);
  private readonly contaService = inject(ContaService);

  protected readonly mes = signal<number | null>(new Date().getMonth() + 1);
  protected readonly ano = signal(new Date().getFullYear());
  /** Contas para o filtro (só aparece com mais de uma); `null` = todas as contas. */
  protected readonly contas = signal<Conta[]>([]);
  protected readonly contaId = signal<number | null>(null);

  protected readonly resumo = signal<ResumoFinanceiro | null>(null);
  // Período a que o `resumo` se refere (o seletor pode já ter mudado enquanto a nova consulta carrega).
  private readonly periodoDoResumo = signal<{ mes: number | null; ano: number } | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly saldoNegativo = computed(() => (this.resumo()?.saldoAtual ?? 0) < 0);

  /** Período do resumo mostrado, em texto: "janeiro de 2026" ou "2026". */
  protected readonly periodoTexto = computed(() => {
    const periodo = this.periodoDoResumo();
    if (!periodo) return '';
    return periodo.mes === null ? `${periodo.ano}` : `${nomeDoMes(periodo.mes)} de ${periodo.ano}`;
  });

  /** Query da tela de Metas: já abre no mês (ou ano) que está sendo visto. */
  protected readonly paramsMeta = computed(() => {
    const periodo = this.periodoDoResumo();
    if (!periodo) return {};
    return periodo.mes === null ? { ano: periodo.ano } : { ano: periodo.ano, mes: periodo.mes };
  });

  /** Mês visto sem meta definida: convida a definir uma. */
  protected readonly semMetaNoMes = computed(() => {
    const resumo = this.resumo();
    const periodo = this.periodoDoResumo();
    return periodo?.mes != null && resumo !== null && resumo.orcamentoLimite === null;
  });

  /** Diz quanto foi gasto e qual era a meta; no ano inteiro, quais meses passaram da meta. */
  protected readonly mensagemAlerta = computed(() => {
    const resumo = this.resumo();
    const periodo = this.periodoDoResumo();
    if (!resumo?.alertaOrcamentoEstourado || !periodo) return '';

    if (periodo.mes === null) {
      const nomes = resumo.mesesAcimaDaMeta.map(nomeDoMes);
      const lista =
        nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes.join('');
      return (
        `Em ${resumo.mesesAcimaDaMeta.length} de ${resumo.mesesComMeta} meses com meta em ` +
        `${periodo.ano}, as despesas passaram da meta: ${lista}.`
      );
    }
    if (resumo.orcamentoLimite === null) return '';
    const excesso = formatarMoeda(resumo.totalDespesas - resumo.orcamentoLimite);
    return (
      `Você gastou ${formatarMoeda(resumo.totalDespesas)} em ${this.periodoTexto()}, acima da ` +
      `meta de ${formatarMoeda(resumo.orcamentoLimite)} para o mês. Passou ${excesso}.`
    );
  });

  /** A partir de 80% da meta do mês (e até estourar): quanto já foi usado e quanto resta. */
  protected readonly mensagemAtencao = computed(() => {
    const resumo = this.resumo();
    const periodo = this.periodoDoResumo();
    if (resumo?.situacaoOrcamento !== 'ATENCAO' || periodo?.mes == null) return '';
    if (resumo.orcamentoLimite === null) return '';
    const usado = Math.round((resumo.totalDespesas / resumo.orcamentoLimite) * 100);
    const restam = formatarMoeda(resumo.orcamentoLimite - resumo.totalDespesas);
    return `Você já usou ${usado}% da meta de ${nomeDoMes(periodo.mes)}; restam ${restam}.`;
  });

  /** Ano inteiro: meses com categoria estourada; `null` fora do ano inteiro ou enquanto carrega. */
  protected readonly mesesComCategoriaEstourada = computed(() => {
    const resumo = this.resumo();
    return this.periodoDoResumo()?.mes === null
      ? (resumo?.mesesComCategoriaEstourada ?? null)
      : null;
  });

  constructor() {
    const consulta = computed(() => ({
      filtro: {
        mes: this.mes() ?? undefined,
        ano: this.ano(),
        ...(this.contaId() !== null && { contaId: this.contaId() as number }),
      },
    }));

    // Sem as contas o Resumo continua igual: só some o filtro.
    this.contaService
      .listar()
      .pipe(catchError(() => of([] as Conta[])))
      .subscribe((contas) => this.contas.set(contas.filter((c) => !c.arquivada)));

    toObservable(consulta)
      .pipe(
        tap(() => {
          this.carregando.set(true);
          this.erro.set(null);
        }),
        // switchMap cancela a requisição anterior se o período mudar antes da resposta.
        switchMap(({ filtro }) =>
          this.service.obterResumo(filtro).pipe(
            map((resumo) => ({ resumo, periodo: { mes: filtro.mes ?? null, ano: filtro.ano } })),
            catchError((e: unknown) => {
              this.erro.set(descreverErro(e));
              this.carregando.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ resumo, periodo }) => {
        this.resumo.set(resumo);
        this.periodoDoResumo.set(periodo);
        this.carregando.set(false);
      });
  }

  protected aoEscolherConta(evento: Event): void {
    const valor = Number((evento.target as HTMLSelectElement).value);
    this.contaId.set(valor >= 1 ? valor : null);
  }
}
