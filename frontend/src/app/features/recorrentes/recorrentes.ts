import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { descreverErro } from '../../core/models/api-error';
import { Categoria, Recorrencia, RecorrentesResumo } from '../../core/models/api.models';
import { formatarPercentual } from '../../core/utils/formato';
import { Card } from '../../shared/card/card';
import { Table } from '../../shared/table/table';
import { CategoriaService } from '../categorias/categoria.service';
import { RecorrenteService } from './recorrente.service';

@Component({
  selector: 'app-recorrentes',
  imports: [CurrencyPipe, DatePipe, RouterLink, Card, Table],
  templateUrl: './recorrentes.html',
  styleUrl: './recorrentes.scss',
})
export class Recorrentes {
  private readonly service = inject(RecorrenteService);
  private readonly categoriaService = inject(CategoriaService);

  protected readonly resumo = signal<RecorrentesResumo | null>(null);
  protected readonly categorias = signal<Categoria[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly erroAcao = signal<string | null>(null);
  protected readonly mostrarIgnoradas = signal(false);
  /** Última marcada como "não é recorrente": oferece desfazer. */
  protected readonly ignoradaAgora = signal<Recorrencia | null>(null);
  protected readonly aviso = signal('');

  protected readonly nomesDasCategorias = computed(
    () => new Map(this.categorias().map((c) => [c.id, c.nome])),
  );

  constructor() {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    forkJoin({
      resumo: this.service.listar(this.mostrarIgnoradas()),
      // Sem as categorias a lista continua útil; só o nome fica "—".
      categorias: this.categoriaService.listar().pipe(catchError(() => of([] as Categoria[]))),
    }).subscribe({
      next: ({ resumo, categorias }) => {
        this.resumo.set(resumo);
        this.categorias.set(categorias);
        this.erro.set(null);
        this.carregando.set(false);
      },
      error: (e: unknown) => {
        this.erro.set(descreverErro(e));
        this.carregando.set(false);
      },
    });
  }

  protected alternarIgnoradas(evento: Event): void {
    this.mostrarIgnoradas.set((evento.target as HTMLInputElement).checked);
    this.carregar();
  }

  protected ignorar(recorrencia: Recorrencia): void {
    this.erroAcao.set(null);
    this.service.ignorar(recorrencia.chave).subscribe({
      next: () => {
        this.ignoradaAgora.set(recorrencia);
        this.aviso.set(`"${recorrencia.descricao}" não será mais tratada como recorrente.`);
        this.carregar();
      },
      error: (e: unknown) => this.erroAcao.set(descreverErro(e)),
    });
  }

  protected desfazer(recorrencia: Recorrencia): void {
    this.erroAcao.set(null);
    this.service.desfazer(recorrencia.chave).subscribe({
      next: () => {
        this.ignoradaAgora.set(null);
        this.aviso.set(`"${recorrencia.descricao}" voltou a ser tratada como recorrente.`);
        this.carregar();
      },
      error: (e: unknown) => this.erroAcao.set(descreverErro(e)),
    });
  }

  /** Abre Transações já filtrada pela descrição, em todo o histórico. */
  protected paramsTransacoes(recorrencia: Recorrencia): Record<string, string> {
    return { busca: recorrencia.chave, historico: '1' };
  }

  protected reajusteTexto(recorrencia: Recorrencia): string | null {
    const variacao = recorrencia.variacaoPercentual;
    if (recorrencia.valorVariavel || variacao === null || variacao === 0) return null;
    return `${variacao > 0 ? 'Reajuste' : 'Redução'} de ${variacao > 0 ? '+' : '−'}${formatarPercentual(Math.abs(variacao))}`;
  }
}
