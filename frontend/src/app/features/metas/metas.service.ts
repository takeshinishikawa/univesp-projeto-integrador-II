import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CopiarMetasRequest,
  DefinirMetaCategoriaRequest,
  DefinirMetaRequest,
  MetasCategoriaDoMes,
  MetasDoAno,
  ResultadoCopiaMetas,
} from '../../core/models/api.models';

@Injectable({ providedIn: 'root' })
export class MetasService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/metas`;

  /** A meta de gastos de cada um dos 12 meses do ano (`null` nos meses sem meta). */
  obterAno(ano: number): Observable<MetasDoAno> {
    return this.http.get<MetasDoAno>(this.url, { params: new HttpParams().set('ano', ano) });
  }

  /** `orcamentoLimite: null` remove a meta do mês. */
  definir(meta: DefinirMetaRequest): Observable<DefinirMetaRequest> {
    return this.http.put<DefinirMetaRequest>(this.url, meta);
  }

  /** Metas por categoria do mês, com o gasto e a situação de cada uma. */
  obterCategoriasDoMes(ano: number, mes: number): Observable<MetasCategoriaDoMes> {
    return this.http.get<MetasCategoriaDoMes>(`${this.url}/categorias`, {
      params: new HttpParams().set('ano', ano).set('mes', mes),
    });
  }

  /** `valor: null` remove a meta da categoria no mês. */
  definirCategoria(meta: DefinirMetaCategoriaRequest): Observable<DefinirMetaCategoriaRequest> {
    return this.http.put<DefinirMetaCategoriaRequest>(`${this.url}/categorias`, meta);
  }

  copiar(pedido: CopiarMetasRequest): Observable<ResultadoCopiaMetas> {
    return this.http.post<ResultadoCopiaMetas>(`${this.url}/copiar`, pedido);
  }
}
