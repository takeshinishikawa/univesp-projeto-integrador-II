import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../../core/models/api-error';
import { TotaisPorCategoria } from '../../../core/models/api.models';
import { CRIAR_GRAFICO } from '../../../shared/grafico/grafico';
import { DashboardService } from '../dashboard.service';
import { GraficoCategorias } from './grafico-categorias';

registerLocaleData(localePt);

const totais: TotaisPorCategoria = {
  tipo: 'DESPESA',
  total: 1000,
  categorias: [
    { categoriaId: 1, categoria: 'Alimentação', total: 382, percentual: 38.2 },
    { categoriaId: 2, categoria: 'Moradia', total: 300, percentual: 30 },
    { categoriaId: 3, categoria: 'Outros', total: 318, percentual: 31.8 },
  ],
};

@Component({
  imports: [GraficoCategorias],
  template: '<app-grafico-categorias [mes]="mes()" [ano]="ano()" [atualizacao]="atualizacao()" />',
})
class Anfitriao {
  readonly mes = signal<number | null>(3);
  readonly ano = signal(2026);
  readonly atualizacao = signal(0);
}

describe('GraficoCategorias', () => {
  const obterCategorias = vi.fn();
  const criarGrafico = vi.fn();

  async function criar() {
    const fixture = TestBed.createComponent(Anfitriao);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    obterCategorias.mockReset().mockReturnValue(of(totais));
    criarGrafico.mockReset().mockImplementation((_canvas: unknown, config: ChartConfiguration) => ({
      data: config.data,
      options: config.options,
      update: () => undefined,
      destroy: () => undefined,
    }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: DashboardService, useValue: { obterCategorias } },
        { provide: CRIAR_GRAFICO, useValue: criarGrafico },
      ],
    });
  });

  it('consulta as despesas do mês e ano informados', async () => {
    await criar();

    expect(obterCategorias).toHaveBeenCalledWith({ mes: 3, ano: 2026 }, 'DESPESA');
  });

  it('o título já diz a que período o gráfico se refere', async () => {
    const { fixture, el } = await criar();
    const titulo = () => el.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim();

    expect(titulo()).toBe('Despesas por categoria — março de 2026');

    fixture.componentInstance.mes.set(null);
    await fixture.whenStable();
    expect(titulo()).toBe('Despesas por categoria — todo o ano de 2026');
  });

  it('desenha uma rosca com nome e percentual na legenda', async () => {
    await criar();
    const config: ChartConfiguration = criarGrafico.mock.calls[0][1];

    expect(config.type).toBe('doughnut');
    expect(config.data.labels).toEqual([
      'Alimentação (38,2%)',
      'Moradia (30,0%)',
      'Outros (31,8%)',
    ]);
    expect(config.data.datasets[0].data).toEqual([382, 300, 318]);
  });

  it('resume em texto a categoria principal e oferece a tabela equivalente', async () => {
    const { el } = await criar();

    expect(el.querySelector('.resumo-grafico')?.textContent).toMatch(
      /Alimentação é 38,2% das despesas de março de 2026 \(R\$\s?382,00 de R\$\s?1\.000,00\)/,
    );
    expect(el.querySelector('canvas')?.getAttribute('aria-label')).toContain(
      'Alimentação, 38,2%; Moradia, 30,0%; Outros, 31,8%',
    );
    const linhas = el.querySelectorAll('details tbody tr');
    expect(linhas).toHaveLength(3);
    expect(linhas[0].textContent).toContain('Alimentação');
    expect(linhas[0].textContent).toMatch(/R\$\s?382,00/);
    expect(linhas[0].textContent).toContain('38,2%');
  });

  it('sem mês, consulta e descreve o ano inteiro', async () => {
    const { fixture, el } = await criar();

    fixture.componentInstance.mes.set(null);
    await fixture.whenStable();

    expect(obterCategorias).toHaveBeenLastCalledWith({ mes: undefined, ano: 2026 }, 'DESPESA');
    expect(el.querySelector('.resumo-grafico')?.textContent).toContain('todo o ano de 2026');
  });

  it('mudar o mês, o ano ou atualizar refaz a consulta', async () => {
    const { fixture } = await criar();

    fixture.componentInstance.mes.set(4);
    await fixture.whenStable();
    fixture.componentInstance.ano.set(2025);
    await fixture.whenStable();
    fixture.componentInstance.atualizacao.set(1);
    await fixture.whenStable();

    expect(obterCategorias.mock.calls.map((c) => c[0])).toEqual([
      { mes: 3, ano: 2026 },
      { mes: 4, ano: 2026 },
      { mes: 4, ano: 2025 },
      { mes: 4, ano: 2025 },
    ]);
  });

  it('lista vazia mostra mensagem com links e não desenha o gráfico', async () => {
    obterCategorias.mockReturnValue(of({ tipo: 'DESPESA', total: 0, categorias: [] }));
    const { el } = await criar();

    expect(el.textContent).toContain('Sem despesas em março de 2026');
    expect(el.querySelector('a[href="/importar"]')).not.toBeNull();
    expect(el.querySelector('canvas')).toBeNull();
    expect(criarGrafico).not.toHaveBeenCalled();
  });

  it('exibe o erro da API com role="alert"', async () => {
    obterCategorias.mockReturnValue(
      throwError(() => new ApiError(500, 'Erro interno do servidor')),
    );
    const { el } = await criar();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Erro interno do servidor');
  });
});
