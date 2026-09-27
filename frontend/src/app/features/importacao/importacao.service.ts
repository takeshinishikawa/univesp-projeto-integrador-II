import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  LinhaImportacaoRequest,
  PreviewImportacao,
  ResultadoImportacao,
} from '../../core/models/api.models';

@Injectable({ providedIn: 'root' })
export class ImportacaoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/importacoes`;

  /** Envia o OFX só para leitura: nada é gravado até `confirmar`. */
  enviarArquivo(arquivo: File, contaId?: number): Observable<PreviewImportacao> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, arquivo.name);
    if (contaId !== undefined) corpo.append('contaId', String(contaId));
    return this.http.post<PreviewImportacao>(`${this.url}/preview`, corpo);
  }

  confirmar(
    transacoes: LinhaImportacaoRequest[],
    conta: { contaId?: number; identificadorExterno?: string } = {},
  ): Observable<ResultadoImportacao> {
    return this.http.post<ResultadoImportacao>(`${this.url}/confirmar`, { transacoes, ...conta });
  }
}
