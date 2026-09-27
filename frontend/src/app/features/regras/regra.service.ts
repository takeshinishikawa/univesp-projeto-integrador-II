import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Regra, RegraRequest, ResultadoEdicaoEmMassa } from '../../core/models/api.models';

/** Regras "descrição contém X → categoria Y" do usuário (a API guarda o termo normalizado). */
@Injectable({ providedIn: 'root' })
export class RegraService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/regras`;

  listar(): Observable<Regra[]> {
    return this.http.get<Regra[]>(this.url);
  }

  criar(regra: RegraRequest): Observable<Regra> {
    return this.http.post<Regra>(this.url, regra);
  }

  atualizar(id: number, mudancas: Partial<RegraRequest>): Observable<Regra> {
    return this.http.put<Regra>(`${this.url}/${id}`, mudancas);
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Move para a categoria da regra as transações que já existem e casam com o termo. */
  aplicar(regraId: number): Observable<ResultadoEdicaoEmMassa> {
    return this.http.post<ResultadoEdicaoEmMassa>(`${this.url}/aplicar`, { regraId });
  }
}
