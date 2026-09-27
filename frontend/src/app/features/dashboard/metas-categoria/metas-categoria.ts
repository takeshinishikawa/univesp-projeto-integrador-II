import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, switchMap, tap } from 'rxjs';
import { descreverErro } from '../../../core/models/api-error';
import { MetasCategoriaDoMes, SituacaoMeta } from '../../../core/models/api.models';
import { formatarMoeda, formatarPercentual, nomeDoMes } from '../../../core/utils/formato';
import { MetasService } from '../../metas/metas.service';

// Ícone + texto para a situação: a cor sozinha não basta (daltonismo, leitores de tela).
const SITUACAO: Record<SituacaoMeta, { icone: string; texto: string }> = {
  DENTRO: { icone: '✓', texto: 'dentro da meta' },
  ATENCAO: { icone: '⚠', texto: 'atenção: perto do limite' },
  ESTOURADA: { icone: '✕', texto: 'meta estourada' },
};

const MAXIMO_DICAS = 3;

/** Barras de progresso das metas por categoria do mês (no ano inteiro, lista os meses estourados). */
@Component({
  selector: 'app-metas-categoria',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './metas-categoria.html',
  styleUrl: './metas-categoria.scss',
})
export class MetasCategoria {
  private readonly service = inject(MetasService);

  /** `null` = o ano inteiro. */
  readonly mes = input<number | null>(null);
  readonly ano = input.required<number>();
  /** Muda a cada clique em "Atualizar" para refazer a consulta. */
  readonly atualizacao = input(0);
  /** Só no ano inteiro: meses em que alguma categoria passou da meta (`null` = ainda carregando). */
  readonly mesesEstourados = input<readonly number[] | null>(null);

  protected readonly dados = signal<MetasCategoriaDoMes | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly periodo = computed(() => {
    const mes = this.mes();
    return mes === null ? `${this.ano()}` : `${nomeDoMes(mes)} de ${this.ano()}`;
  });

  protected readonly paramsMetas = computed(() => {
    const mes = this.mes();
    return mes === null ? { ano: this.ano() } : { ano: this.ano(), mes };
  });

  protected readonly textoMesesEstourados = computed(() => {
    const meses = (this.mesesEstourados() ?? []).map(nomeDoMes);
    if (meses.length === 0) return '';
    const lista =
      meses.length > 1 ? `${meses.slice(0, -1).join(', ')} e ${meses.at(-1)}` : meses.join('');
    return `Em ${meses.length} ${meses.length === 1 ? 'mês' : 'meses'} de ${this.ano()}, alguma categoria passou da própria meta: ${lista}.`;
  });

  /** Onde mais se gasta, entre as categorias sem meta: sugestão de onde criar uma. */
  protected readonly dica = computed(() => {
    const principais = (this.dados()?.semMeta ?? [])
      .filter((c) => c.gasto > 0)
      .slice(0, MAXIMO_DICAS)
      .map((c) => `${c.categoria} (${formatarMoeda(c.gasto)})`);
    return principais.length === 0
      ? ''
      : `Que tal definir metas onde você mais gasta? ${principais.join(', ')}.`;
  });

  constructor() {
    const consulta = computed(() => ({
      mes: this.mes(),
      ano: this.ano(),
      rodada: this.atualizacao(),
    }));

    toObservable(consulta)
      .pipe(
        tap(({ mes }) => {
          // No ano inteiro não há consulta por categoria; só a lista de meses estourados.
          this.carregando.set(mes !== null);
          this.erro.set(null);
        }),
        switchMap(({ mes, ano }) => {
          if (mes === null) {
            this.dados.set(null);
            return EMPTY;
          }
          return this.service.obterCategoriasDoMes(ano, mes).pipe(
            catchError((e: unknown) => {
              this.erro.set(descreverErro(e));
              this.carregando.set(false);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((dados) => {
        this.dados.set(dados);
        this.carregando.set(false);
      });
  }

  protected barra(percentual: number): number {
    return Math.min(percentual, 100);
  }

  protected situacao(situacao: SituacaoMeta): { icone: string; texto: string } {
    return SITUACAO[situacao];
  }

  protected percentualTexto(percentual: number): string {
    return formatarPercentual(percentual);
  }
}
