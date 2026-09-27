import { CurrencyPipe } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, switchMap, tap } from 'rxjs';
import { Objetivo } from '../../../core/models/api.models';
import { formatarPercentual } from '../../../core/utils/formato';
import { ObjetivoService } from '../../objetivos/objetivo.service';
import { ROTULO_SITUACAO_OBJETIVO } from '../../objetivos/objetivos';

/** Card "Objetivos" do Resumo: progresso de cada objetivo e quanto falta guardar este mês. */
@Component({
  selector: 'app-objetivos-resumo',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './objetivos-resumo.html',
  styleUrl: './objetivos-resumo.scss',
})
export class ObjetivosResumo {
  private readonly service = inject(ObjetivoService);

  /** Muda a cada clique em "Atualizar" para refazer a consulta. */
  readonly atualizacao = input(0);

  protected readonly objetivos = signal<Objetivo[] | null>(null);
  protected readonly erro = signal(false);

  constructor() {
    toObservable(this.atualizacao)
      .pipe(
        tap(() => this.erro.set(false)),
        switchMap(() =>
          this.service.resumo().pipe(
            catchError(() => {
              this.erro.set(true);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((objetivos) => this.objetivos.set(objetivos));
  }

  protected rotulo(objetivo: Objetivo) {
    return ROTULO_SITUACAO_OBJETIVO[objetivo.situacao];
  }

  protected percentualTexto(objetivo: Objetivo): string {
    return formatarPercentual(objetivo.percentual);
  }
}
