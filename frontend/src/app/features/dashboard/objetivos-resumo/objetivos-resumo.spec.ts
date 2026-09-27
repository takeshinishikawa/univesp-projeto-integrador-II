import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Objetivo } from '../../../core/models/api.models';
import { ObjetivoService } from '../../objetivos/objetivo.service';
import { ObjetivosResumo } from './objetivos-resumo';

registerLocaleData(localePt);

const objetivo = (extra: Partial<Objetivo>): Objetivo => ({
  id: 1,
  nome: 'Viagem',
  valorAlvo: 6000,
  prazoAno: 2027,
  prazoMes: 12,
  criadoEm: '2026-01-01',
  concluidoEm: null,
  acumulado: 2400,
  percentual: 40,
  mesesRestantes: 15,
  valorMensalNecessario: 240,
  guardarEsteMes: 240,
  situacao: 'NO_RITMO',
  aportes: [],
  ...extra,
});

describe('ObjetivosResumo (card do Resumo)', () => {
  const resumo = vi.fn();

  async function montar() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: ObjetivoService, useValue: { resumo } },
      ],
    });
    const fixture = TestBed.createComponent(ObjetivosResumo);
    await fixture.whenStable();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('mostra o progresso de cada objetivo e quanto falta guardar este mês', async () => {
    resumo.mockReturnValue(
      of([objetivo({}), objetivo({ id: 2, nome: 'Reserva', guardarEsteMes: 0 })]),
    );
    const el = await montar();
    const itens = [...el.querySelectorAll('.objetivo')];

    expect(texto(itens[0])).toMatch(/R\$\s?2\.400,00 de R\$\s?6\.000,00 — 40,0%/);
    expect(texto(itens[0])).toMatch(/Falta guardar este mês: R\$\s?240,00/);
    expect(itens[0].querySelector('progress')?.getAttribute('aria-label')).toBe(
      'Progresso de Viagem: 40,0%',
    );
    expect(texto(itens[1])).toContain('Você já guardou o necessário para este mês.');
    expect(el.querySelector('a[href="/objetivos"]')).not.toBeNull();
  });

  it('sem objetivos, convida a criar o primeiro', async () => {
    resumo.mockReturnValue(of([]));
    const el = await montar();

    expect(texto(el)).toContain('Crie seu primeiro objetivo');
    expect(el.querySelector('a[href="/objetivos"]')).not.toBeNull();
  });

  it('a falha aparece só neste card', async () => {
    resumo.mockReturnValue(throwError(() => new Error('falhou')));
    const el = await montar();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Não foi possível carregar os objetivos',
    );
  });
});
