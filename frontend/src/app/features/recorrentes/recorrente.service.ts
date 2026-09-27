import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RecorrentesResumo } from '../../core/models/api.models';

/** Gastos que se repetem todo mês, detectados a partir do histórico (não criam lançamentos futuros). */
@Injectable({ providedIn: 'root' })
export class RecorrenteService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/recorrentes`;

  listar(incluirIgnoradas = false): Observable<RecorrentesResumo> {
    return this.http.get<RecorrentesResumo>(this.url, {
      params: new HttpParams().set('ignoradas', incluirIgnoradas),
    });
  }

  /** Marca como "isso não é recorrente" (a chave é a descrição normalizada). */
  ignorar(chave: string): Observable<{ chave: string }> {
    return this.http.post<{ chave: string }>(`${this.url}/ignorar`, { chave });
  }

  desfazer(chave: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/ignorar/${encodeURIComponent(chave)}`);
  }
}
