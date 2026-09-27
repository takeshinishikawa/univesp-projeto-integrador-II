import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  LoginRequest,
  LoginResponse,
  RegistrarUsuarioRequest,
  Usuario,
} from '../models/api.models';

const CHAVE_TOKEN = 'financas.token';
const CHAVE_USUARIO = 'financas.usuario';

function lerStorage(chave: string): string | null {
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

function escreverStorage(chave: string, valor: string | null): void {
  try {
    if (valor === null) sessionStorage.removeItem(chave);
    else sessionStorage.setItem(chave, valor);
  } catch {
    // sessionStorage indisponível (modo privado restrito): a sessão vale só em memória.
  }
}

function lerUsuario(): Usuario | null {
  const bruto = lerStorage(CHAVE_USUARIO);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as Usuario;
  } catch {
    return null;
  }
}

/** Retorna `true` se o JWT já expirou (ou não pode ser decodificado). */
export function tokenExpirado(token: string, agora = Date.now()): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= agora;
  } catch {
    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  private readonly _token = signal<string | null>(lerStorage(CHAVE_TOKEN));
  private readonly _usuario = signal<Usuario | null>(lerUsuario());

  readonly token = this._token.asReadonly();
  readonly usuario = this._usuario.asReadonly();
  readonly autenticado = computed(() => this._token() !== null);

  login(dados: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, dados).pipe(
      tap(({ token, usuario }) => {
        escreverStorage(CHAVE_TOKEN, token);
        escreverStorage(CHAVE_USUARIO, JSON.stringify(usuario));
        this._token.set(token);
        this._usuario.set(usuario);
      }),
    );
  }

  registrar(dados: RegistrarUsuarioRequest): Observable<Usuario> {
    return this.http.post<Usuario>(`${this.baseUrl}/register`, dados);
  }

  logout(): void {
    escreverStorage(CHAVE_TOKEN, null);
    escreverStorage(CHAVE_USUARIO, null);
    this._token.set(null);
    this._usuario.set(null);
  }

  /** Encerra a sessão e leva o usuário ao login. */
  sair(): void {
    this.logout();
    void this.router.navigate(['/login']);
  }

  /** Verifica também a expiração do JWT; se expirou, limpa a sessão. */
  sessaoValida(): boolean {
    const token = this._token();
    if (token === null) return false;
    if (tokenExpirado(token)) {
      this.logout();
      return false;
    }
    return true;
  }
}
