import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Moeda } from './moeda';

@Component({
  imports: [ReactiveFormsModule, Moeda],
  template: '<input id="valor" type="number" appMoeda [formControl]="controle" />',
})
class Anfitriao {
  readonly controle = new FormControl<number | null>(null);
}

describe('Moeda (campo de valor com centavos)', () => {
  async function montar(inicial: number | null = null) {
    const fixture = TestBed.createComponent(Anfitriao);
    fixture.componentInstance.controle.setValue(inicial);
    await fixture.whenStable();
    const campo = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#valor')!;
    return { fixture, campo, controle: fixture.componentInstance.controle };
  }

  it('mostra os centavos de um valor que já vem preenchido', async () => {
    const { campo } = await montar(3000);

    expect(campo.value).toBe('3000.00');
  });

  it('ao sair do campo, "3000" vira "3000.00" e o valor do formulário segue um número', async () => {
    const { campo, controle } = await montar();

    campo.value = '3000';
    campo.dispatchEvent(new Event('input'));
    campo.dispatchEvent(new Event('blur'));

    expect(campo.value).toBe('3000.00');
    expect(controle.value).toBe(3000);
  });

  it('valor preenchido pelo código (editar, limpar) também ganha os centavos', async () => {
    const { campo, controle } = await montar();

    controle.setValue(89.9);
    expect(campo.value).toBe('89.90');

    controle.reset();
    expect(campo.value).toBe('');
  });

  it('campo vazio continua vazio', async () => {
    const { campo } = await montar();

    campo.dispatchEvent(new Event('blur'));

    expect(campo.value).toBe('');
  });
});
