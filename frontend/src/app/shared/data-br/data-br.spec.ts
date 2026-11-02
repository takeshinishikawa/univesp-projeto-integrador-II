import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { brParaIso, DataBr, isoParaBr, isoValida, mascararData } from './data-br';

@Component({
  imports: [ReactiveFormsModule, DataBr],
  template: '<input id="data" type="text" appDataBr [formControl]="controle" />',
})
class Anfitriao {
  readonly controle = new FormControl<string>('', {
    nonNullable: true,
    validators: Validators.required,
  });
}

describe('DataBr (campo de data em dd/mm/aaaa)', () => {
  async function montar(inicial = '') {
    const fixture = TestBed.createComponent(Anfitriao);
    fixture.componentInstance.controle.setValue(inicial);
    await fixture.whenStable();
    const campo = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#data')!;
    return { campo, controle: fixture.componentInstance.controle };
  }

  function digitar(campo: HTMLInputElement, texto: string): void {
    campo.value = texto;
    campo.dispatchEvent(new Event('input'));
  }

  it('mostra em dd/mm/aaaa a data que vem do formulário em YYYY-MM-DD', async () => {
    const { campo } = await montar('2026-09-28');

    expect(campo.value).toBe('28/09/2026');
    expect(campo.placeholder).toBe('dd/mm/aaaa');
  });

  it('põe as barras enquanto a pessoa digita e devolve YYYY-MM-DD ao formulário', async () => {
    const { campo, controle } = await montar();

    digitar(campo, '2809');
    expect(campo.value).toBe('28/09');
    expect(controle.hasError('dataInvalida')).toBe(true);

    digitar(campo, '28092026');
    expect(campo.value).toBe('28/09/2026');
    expect(controle.value).toBe('2026-09-28');
    expect(controle.valid).toBe(true);
  });

  it('recusa data que não existe no calendário', async () => {
    const { campo, controle } = await montar();

    digitar(campo, '31/02/2026');

    expect(controle.hasError('dataInvalida')).toBe(true);
  });

  it('campo vazio fica com o erro de obrigatório, não de data inválida', async () => {
    const { campo, controle } = await montar('2026-09-28');

    digitar(campo, '');

    expect(controle.hasError('required')).toBe(true);
    expect(controle.hasError('dataInvalida')).toBe(false);
  });

  it('funções de conversão', () => {
    expect(mascararData('28a09b2026xx')).toBe('28/09/2026');
    expect(brParaIso('28/09/2026')).toBe('2026-09-28');
    expect(brParaIso('28/09/26')).toBeNull();
    expect(isoParaBr('2026-09-28')).toBe('28/09/2026');
    expect(isoValida('2028-02-29')).toBe(true);
    expect(isoValida('2026-02-29')).toBe(false);
  });
});
