import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, skip } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { Button } from './shared/button/button';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Button],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly conteudo = viewChild.required<ElementRef<HTMLElement>>('conteudo');

  constructor() {
    // Após cada navegação, o foco vai para o conteúdo: leitores de tela e teclado acompanham a troca de página.
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        skip(1),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.conteudo().nativeElement.focus());
  }

  protected sair(): void {
    this.auth.sair();
  }
}
