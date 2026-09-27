import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  EvolucaoMensal,
  Insight,
  PeriodoFiltro,
  ResumoFinanceiro,
  TipoTransacao,
  TotaisPorCategoria,
} from '../../core/models/api.models';
import { paramsDoPeriodo } from '../../core/utils/data';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/dashboard`;

  obterResumo(filtro: PeriodoFiltro = {}): Observable<ResumoFinanceiro> {
    return this.http.get<ResumoFinanceiro>(`${this.url}/resumo`, {
      params: paramsDoPeriodo(filtro),
    });
  }

  /** Receitas, despesas e saldo dos 12 meses do ano (meses sem lançamento vêm zerados). */
  obterEvolucao(ano: number, contaId?: number): Observable<EvolucaoMensal> {
    let params = new HttpParams().set('ano', ano);
    if (contaId !== undefined) params = params.set('contaId', contaId);
    return this.http.get<EvolucaoMensal>(`${this.url}/evolucao`, { params });
  }

  /** Até 5 frases sobre o mês, com o filtro de Transações que cada uma abre. */
  obterInsights(ano: number, mes: number): Observable<Insight[]> {
    return this.http.get<Insight[]>(`${this.url}/insights`, {
      params: new HttpParams().set('ano', ano).set('mes', mes),
    });
  }

  obterCategorias(
    filtro: PeriodoFiltro = {},
    tipo: TipoTransacao = 'DESPESA',
  ): Observable<TotaisPorCategoria> {
    return this.http.get<TotaisPorCategoria>(`${this.url}/categorias`, {
      params: paramsDoPeriodo(filtro).set('tipo', tipo),
    });
  }
}
