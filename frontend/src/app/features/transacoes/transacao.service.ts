import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  FiltroTransacoes,
  ResultadoEdicaoEmMassa,
  Transacao,
  TransacaoRequest,
} from '../../core/models/api.models';
import { paramsDoFiltro } from '../../core/utils/data';

@Injectable({ providedIn: 'root' })
export class TransacaoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/transacoes`;

  listar(filtro: FiltroTransacoes = {}): Observable<Transacao[]> {
    return this.http.get<Transacao[]>(this.url, { params: paramsDoFiltro(filtro) });
  }

  criar(dados: TransacaoRequest): Observable<Transacao> {
    return this.http.post<Transacao>(this.url, dados);
  }

  atualizar(id: number, dados: TransacaoRequest): Observable<Transacao> {
    return this.http.put<Transacao>(`${this.url}/${id}`, dados);
  }

  deletar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Move várias transações para uma categoria (tudo ou nada). */
  recategorizar(ids: number[], categoriaId: number): Observable<ResultadoEdicaoEmMassa> {
    return this.http.patch<ResultadoEdicaoEmMassa>(`${this.url}/categoria`, { ids, categoriaId });
  }

  /** Move várias transações para outra conta (tudo ou nada). */
  moverParaConta(ids: number[], contaId: number): Observable<ResultadoEdicaoEmMassa> {
    return this.http.patch<ResultadoEdicaoEmMassa>(`${this.url}/conta`, { ids, contaId });
  }

  /** Transforma uma transação (ex.: pagamento de fatura) em transferência para outra conta. */
  marcarComoTransferencia(
    id: number,
    contaDestinoId: number,
  ): Observable<{ transferenciaId: string }> {
    return this.http.post<{ transferenciaId: string }>(`${this.url}/${id}/transferencia`, {
      contaDestinoId,
    });
  }

  excluirVarias(ids: number[]): Observable<ResultadoEdicaoEmMassa> {
    return this.http.post<ResultadoEdicaoEmMassa>(`${this.url}/excluir`, { ids });
  }
}
