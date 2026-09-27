import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Categoria, CategoriaRequest } from '../../core/models/api.models';

/** Sem cache: as categorias agora são do usuário e mudam quando ele cria, renomeia ou exclui. */
@Injectable({ providedIn: 'root' })
export class CategoriaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/categorias`;

  listar(): Observable<Categoria[]> {
    return this.http.get<Categoria[]>(this.url);
  }

  criar(categoria: CategoriaRequest): Observable<Categoria> {
    return this.http.post<Categoria>(this.url, categoria);
  }

  renomear(id: number, nome: string): Observable<Categoria> {
    return this.http.put<Categoria>(`${this.url}/${id}`, { nome });
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
