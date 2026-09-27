import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Conta, ContaRequest, TransferenciaRequest } from '../../core/models/api.models';

@Injectable({ providedIn: 'root' })
export class ContaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/contas`;

  /** Contas do usuário (arquivadas inclusive), com o saldo atual de cada uma. */
  listar(): Observable<Conta[]> {
    return this.http.get<Conta[]>(this.url);
  }

  criar(conta: ContaRequest): Observable<Conta> {
    return this.http.post<Conta>(this.url, conta);
  }

  atualizar(
    id: number,
    mudancas: Partial<ContaRequest> & { arquivada?: boolean },
  ): Observable<Conta> {
    return this.http.put<Conta>(`${this.url}/${id}`, mudancas);
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Saída na origem e entrada no destino; não entra em receitas, despesas, metas nem gráficos. */
  transferir(pedido: TransferenciaRequest): Observable<{ transferenciaId: string }> {
    return this.http.post<{ transferenciaId: string }>(
      `${environment.apiUrl}/transferencias`,
      pedido,
    );
  }
}
