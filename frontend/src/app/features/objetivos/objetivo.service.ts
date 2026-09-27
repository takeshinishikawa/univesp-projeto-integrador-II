import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AporteRequest, Objetivo, ObjetivoRequest } from '../../core/models/api.models';

@Injectable({ providedIn: 'root' })
export class ObjetivoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/objetivos`;

  listar(): Observable<Objetivo[]> {
    return this.http.get<Objetivo[]>(this.url);
  }

  /** Só os ainda não concluídos, para o card do Resumo. */
  resumo(): Observable<Objetivo[]> {
    return this.http.get<Objetivo[]>(`${environment.apiUrl}/dashboard/objetivos-resumo`);
  }

  criar(dados: ObjetivoRequest): Observable<Objetivo> {
    return this.http.post<Objetivo>(this.url, dados);
  }

  atualizar(id: number, dados: Omit<ObjetivoRequest, 'valorInicial'>): Observable<Objetivo> {
    return this.http.put<Objetivo>(`${this.url}/${id}`, dados);
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  guardar(id: number, aporte: AporteRequest): Observable<Objetivo> {
    return this.http.post<Objetivo>(`${this.url}/${id}/aportes`, aporte);
  }

  desfazerAporte(id: number, aporteId: number): Observable<Objetivo> {
    return this.http.delete<Objetivo>(`${this.url}/${id}/aportes/${aporteId}`);
  }
}
