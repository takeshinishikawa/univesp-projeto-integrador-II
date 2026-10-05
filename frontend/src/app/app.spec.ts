import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/services/auth.service';
import { violacoesDeAcessibilidade } from './testing/a11y';

describe('App', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('não mostra o menu principal para visitantes', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('nav')).toBeNull();
    expect(el.querySelector('main#conteudo')).not.toBeNull();
    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('mostra menu e botão Sair quando autenticado', async () => {
    const auth = TestBed.inject(AuthService);
    // token com exp no futuro não é necessário aqui: apenas o estado do signal importa
    (auth as unknown as { _token: { set(v: string): void } })._token.set('token');
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('nav[aria-label="Principal"]')).not.toBeNull();
    expect(el.textContent).toContain('Sair');
    expect(el.querySelector('nav a[href="/metas"]')?.textContent).toContain('Metas');
    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });
});
