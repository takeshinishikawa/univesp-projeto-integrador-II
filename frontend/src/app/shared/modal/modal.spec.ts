import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Modal } from './modal';

@Component({
  imports: [Modal],
  template: `
    @if (aberto()) {
      <app-modal titulo="Nova transação" (fechar)="aberto.set(false)">
        <p>Conteúdo</p>
      </app-modal>
    }
  `,
})
class Anfitriao {
  readonly aberto = signal(true);
}

describe('Modal', () => {
  async function criar() {
    const fixture = TestBed.createComponent(Anfitriao);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('é um <dialog> rotulado pelo título', async () => {
    const { el } = await criar();
    const dialogo = el.querySelector('dialog')!;
    const titulo = el.querySelector('h2')!;

    expect(dialogo.hasAttribute('open')).toBe(true);
    expect(dialogo.getAttribute('aria-labelledby')).toBe(titulo.id);
    expect(titulo.textContent).toContain('Nova transação');
  });

  it('Esc (evento cancel do <dialog>) fecha o modal', async () => {
    const { fixture, el } = await criar();
    const evento = new Event('cancel', { cancelable: true });
    el.querySelector('dialog')!.dispatchEvent(evento);
    await fixture.whenStable();

    expect(evento.defaultPrevented).toBe(true);
    expect(el.querySelector('dialog')).toBeNull();
  });

  it('o botão Fechar tem nome acessível e fecha o modal', async () => {
    const { fixture, el } = await criar();
    const botao = el.querySelector<HTMLButtonElement>('button[aria-label="Fechar"]')!;
    botao.click();
    await fixture.whenStable();

    expect(el.querySelector('dialog')).toBeNull();
  });
});
