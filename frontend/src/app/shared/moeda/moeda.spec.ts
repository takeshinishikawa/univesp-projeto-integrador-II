import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { lerMoeda, Moeda } from './moeda';

@Component({
  imports: [ReactiveFormsModule, Moeda],
  template: '<input id="valor" type="text" appMoeda [formControl]="controle" />',
})
class Anfitriao {
  readonly controle = new FormControl<number | null>(null);
}

describe('Moeda (campo de valor em reais)', () => {
  async function montar(inicial: number | null = null) {
    const fixture = TestBed.createComponent(Anfitriao);
    fixture.componentInstance.controle.setValue(inicial);
    await fixture.whenStable();
    const campo = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#valor')!;
    return { fixture, campo, controle: fixture.componentInstance.controle };
  }

  function digitar(campo: HTMLInputElement, texto: string): void {
    campo.value = texto;
    campo.dispatchEvent(new Event('input'));
  }

  it('mostra no formato brasileiro um valor que já vem preenchido', async () => {
    const { campo } = await montar(3000);

    expect(campo.value).toBe('3.000,00');
  });

  it('ao sair do campo, "35" vira "35,00" e o valor do formulário segue um número', async () => {
    const { campo, controle } = await montar();

    digitar(campo, '35');
    campo.dispatchEvent(new Event('blur'));

    expect(campo.value).toBe('35,00');
    expect(controle.value).toBe(35);
  });

  it('aceita vírgula decimal e ponto de milhar', async () => {
    const { campo, controle } = await montar();

    digitar(campo, '1.234,5');
    campo.dispatchEvent(new Event('blur'));

    expect(controle.value).toBe(1234.5);
    expect(campo.value).toBe('1.234,50');
  });

  it('valor preenchido pelo código (editar, limpar) também é formatado', async () => {
    const { campo, controle } = await montar();

    controle.setValue(89.9);
    expect(campo.value).toBe('89,90');

    controle.reset();
    expect(campo.value).toBe('');
  });

  it('texto que não é número deixa o campo inválido', async () => {
    const { campo, controle } = await montar();

    digitar(campo, 'abc');

    expect(controle.hasError('moeda')).toBe(true);
  });

  it('campo vazio continua vazio e vale null', async () => {
    const { campo, controle } = await montar();

    digitar(campo, '');
    campo.dispatchEvent(new Event('blur'));

    expect(campo.value).toBe('');
    expect(controle.value).toBeNull();
  });

  it('lerMoeda', () => {
    expect(lerMoeda('R$ 35,00')).toBe(35);
    expect(lerMoeda('89.9')).toBe(89.9);
    expect(lerMoeda('1.500')).toBe(1500);
    expect(lerMoeda('-250,75')).toBe(-250.75);
    expect(lerMoeda('10,999')).toBe(11);
    expect(lerMoeda('1,2,3')).toBeNaN();
  });
});
