import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RecorrentesResumo } from '../../../core/models/api.models';
import { RecorrenteService } from '../../recorrentes/recorrente.service';
import { Comprometido } from './comprometido';

registerLocaleData(localePt);

const resumo = (quantidade: number, valor: number): RecorrentesResumo => ({
  recorrencias: [],
  custoMensal: 0,
  custoAnual: 0,
  comprometidoNoMes: { valor, quantidade },
});

describe('Comprometido (card do Resumo)', () => {
  const listar = vi.fn();
  const hoje = new Date();

  async function montar(mes: number | null, ano: number) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: RecorrenteService, useValue: { listar } },
      ],
    });
    const fixture = TestBed.createComponent(Comprometido);
    fixture.componentRef.setInput('mes', mes);
    fixture.componentRef.setInput('ano', ano);
    await fixture.whenStable();
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  beforeEach(() => listar.mockReset().mockReturnValue(of(resumo(2, 62.8))));

  it('no mês corrente mostra quanto já está comprometido e em quantas cobranças', async () => {
    const texto = await montar(hoje.getMonth() + 1, hoje.getFullYear());

    expect(texto).toMatch(/Já comprometido este mês: R\$\s?62,80 em 2 cobranças previstas/);
    expect(texto).toContain('Ver recorrentes');
  });

  it('em outro mês, ou no ano inteiro, não aparece', async () => {
    expect(await montar(hoje.getMonth() === 0 ? 2 : 1, hoje.getFullYear())).toBe('');
  });

  it('sem cobranças previstas, não aparece', async () => {
    listar.mockReturnValue(of(resumo(0, 0)));

    expect(await montar(hoje.getMonth() + 1, hoje.getFullYear())).toBe('');
  });

  it('se a consulta falha, só some (o Resumo não depende dele)', async () => {
    listar.mockReturnValue(throwError(() => new Error('falhou')));

    expect(await montar(hoje.getMonth() + 1, hoje.getFullYear())).toBe('');
  });
});
