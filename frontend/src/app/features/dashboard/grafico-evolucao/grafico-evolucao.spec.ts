import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../../core/models/api-error';
import { EvolucaoMensal as Evolucao } from '../../../core/models/api.models';
import { CRIAR_GRAFICO, CRIAR_RESIZE_OBSERVER } from '../../../shared/grafico/grafico';
import { DashboardService } from '../dashboard.service';
import { GraficoEvolucao } from './grafico-evolucao';

registerLocaleData(localePt);

function montarEvolucao(sobrescrever: Partial<Evolucao> = {}): Evolucao {
  return {
    ano: 2026,
    meses: Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      totalReceitas: [10000, 10110.12, 11800][i] ?? 0,
      totalDespesas: [9718.47, 10042.07, 9000][i] ?? 0,
      saldo: [281.53, 68.05, 2800][i] ?? 0,
      orcamentoLimite: null,
    })),
    ...sobrescrever,
  };
}

@Component({
  imports: [GraficoEvolucao],
  template: `
    <app-grafico-evolucao
      [ano]="ano()"
      [mes]="mes()"
      [atualizacao]="atualizacao()"
      (mesEscolhido)="escolhidos.push($event)"
    />
  `,
})
class Anfitriao {
  readonly ano = signal(2026);
  readonly mes = signal<number | null>(null);
  readonly atualizacao = signal(0);
  readonly escolhidos: number[] = [];
}

describe('GraficoEvolucao', () => {
  const obterEvolucao = vi.fn();
  const criarGrafico = vi.fn();
  const configs = (): ChartConfiguration[] => criarGrafico.mock.calls.map((c) => c[1]);

  async function criar() {
    const fixture = TestBed.createComponent(Anfitriao);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    obterEvolucao.mockReset().mockReturnValue(of(montarEvolucao()));
    criarGrafico.mockReset().mockImplementation((_canvas: unknown, config: ChartConfiguration) => ({
      data: config.data,
      options: config.options,
      update: () => undefined,
      resize: () => undefined,
      destroy: () => undefined,
    }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: DashboardService, useValue: { obterEvolucao } },
        { provide: CRIAR_GRAFICO, useValue: criarGrafico },
        {
          provide: CRIAR_RESIZE_OBSERVER,
          useValue: () => ({ observe: () => undefined, disconnect: () => undefined }),
        },
      ],
    });
  });

  it('consulta a evolução do ano informado', async () => {
    await criar();

    expect(obterEvolucao).toHaveBeenCalledWith(2026);
  });

  it('monta colunas de receitas e despesas e a linha tracejada do saldo, com 12 meses', async () => {
    await criar();
    const [config] = configs();
    const [receitas, despesas, saldo] = config.data.datasets;

    expect(config.type).toBe('bar');
    expect(config.data.labels).toEqual([
      'jan',
      'fev',
      'mar',
      'abr',
      'mai',
      'jun',
      'jul',
      'ago',
      'set',
      'out',
      'nov',
      'dez',
    ]);
    expect(config.data.datasets).toHaveLength(3);
    expect([receitas.label, despesas.label, saldo.label]).toEqual([
      'Receitas',
      'Despesas',
      'Saldo',
    ]);
    expect(receitas.data.slice(0, 3)).toEqual([10000, 10110.12, 11800]);
    expect(despesas.data[0]).toBe(9718.47);
    expect(saldo.type).toBe('line');
    expect((saldo as unknown as { borderDash?: number[] }).borderDash).toBeDefined(); // não depende só da cor
  });

  it('marca a meta de cada mês (traços) só quando algum mês tem meta', async () => {
    await criar();
    expect(configs()[0].data.datasets.map((d) => d.label)).not.toContain('Meta de gastos');
    expect(document.querySelector('th')?.textContent).not.toContain('Meta de gastos');

    TestBed.resetTestingModule();
    criarGrafico.mockClear();
    const comMetas = montarEvolucao();
    comMetas.meses[0].orcamentoLimite = 2000;
    comMetas.meses[2].orcamentoLimite = 3500.5;
    obterEvolucao.mockReturnValue(of(comMetas));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: DashboardService, useValue: { obterEvolucao } },
        { provide: CRIAR_GRAFICO, useValue: criarGrafico },
        {
          provide: CRIAR_RESIZE_OBSERVER,
          useValue: () => ({ observe: () => undefined, disconnect: () => undefined }),
        },
      ],
    });
    const { el } = await criar();

    const meta = configs()[0].data.datasets.find((d) => d.label === 'Meta de gastos');
    expect(meta?.data).toEqual([
      2000,
      null,
      3500.5,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect((meta as unknown as { showLine: boolean }).showLine).toBe(false); // só o traço de cada mês
    expect(el.querySelector('canvas')?.getAttribute('aria-label')).toContain('meta de gastos');

    // a tabela alternativa também traz a meta (e diz "sem meta" nos outros meses)
    expect(el.querySelector('details thead')?.textContent).toContain('Meta de gastos');
    const linhas = el.querySelectorAll('details tbody tr');
    expect(linhas[0].textContent).toMatch(/R\$\s?2\.000,00/);
    expect(linhas[1].textContent).toContain('sem meta');
  });

  it('tem texto alternativo, resumo em texto e tabela com os 12 meses', async () => {
    const { el } = await criar();

    expect(el.querySelector('canvas')?.getAttribute('aria-label')).toContain(
      'Maior despesa em fevereiro',
    );
    expect(el.querySelector('.resumo-grafico')?.textContent).toMatch(
      /Maior despesa em fevereiro: R\$\s?10\.042,07/,
    );
    expect(el.querySelector('.resumo-grafico')?.textContent).toMatch(
      /Saldo acumulado em 2026: R\$\s?3\.149,58/,
    );
    expect(el.querySelectorAll('details tbody tr')).toHaveLength(12);
    expect(el.querySelector('details tbody tr th')?.textContent).toContain('Janeiro');
    expect(el.querySelector('details thead')?.textContent).toContain('Saldo');
  });

  it('destaca o mês selecionado no gráfico e na tabela', async () => {
    const { fixture, el } = await criar();

    fixture.componentInstance.mes.set(3);
    await fixture.whenStable();

    const config = criarGrafico.mock.results[0].value as ChartConfiguration; // a mesma instância é atualizada
    expect((config.data.datasets[0] as unknown as { borderWidth: number[] }).borderWidth).toEqual([
      0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(el.querySelectorAll('tbody tr')[2].classList).toContain('linha-destaque');
    expect(el.querySelectorAll('.mes-botao')[2].getAttribute('aria-pressed')).toBe('true');
    expect(obterEvolucao).toHaveBeenCalledTimes(1); // trocar o mês não refaz a consulta
  });

  it('clicar em uma coluna do gráfico emite o mês (1-12)', async () => {
    const { fixture } = await criar();
    const onClick = configs()[0].options?.onClick as (
      evento: unknown,
      elementos: { index: number }[],
    ) => void;

    onClick({}, [{ index: 6 }]);
    onClick({}, []); // clique fora das colunas não emite

    expect(fixture.componentInstance.escolhidos).toEqual([7]);
  });

  it('clicar no nome do mês na tabela (teclado) emite o mês', async () => {
    const { fixture, el } = await criar();

    el.querySelectorAll<HTMLButtonElement>('.mes-botao')[1].click();

    expect(fixture.componentInstance.escolhidos).toEqual([2]);
  });

  it('trocar o ano ou atualizar refaz a consulta', async () => {
    const { fixture } = await criar();

    fixture.componentInstance.ano.set(2025);
    await fixture.whenStable();
    fixture.componentInstance.atualizacao.set(1);
    await fixture.whenStable();

    expect(obterEvolucao.mock.calls.map((c) => c[0])).toEqual([2026, 2025, 2025]);
  });

  it('sem lançamentos no ano mostra mensagem com links e não desenha o gráfico', async () => {
    obterEvolucao.mockReturnValue(
      of(
        montarEvolucao({
          meses: Array.from({ length: 12 }, (_, i) => ({
            mes: i + 1,
            totalReceitas: 0,
            totalDespesas: 0,
            saldo: 0,
            orcamentoLimite: null,
          })),
        }),
      ),
    );
    const { el } = await criar();

    expect(el.textContent).toContain('Sem lançamentos em 2026');
    expect(el.querySelector('a[href="/transacoes"]')).not.toBeNull();
    expect(el.querySelector('a[href="/importar"]')).not.toBeNull();
    expect(el.querySelector('canvas')).toBeNull();
    expect(criarGrafico).not.toHaveBeenCalled();
  });

  it('exibe o erro da API com role="alert"', async () => {
    obterEvolucao.mockReturnValue(throwError(() => new ApiError(500, 'Erro interno do servidor')));
    const { el } = await criar();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Erro interno do servidor');
    expect(el.querySelector('canvas')).toBeNull();
  });
});
