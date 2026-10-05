import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChartConfiguration } from 'chart.js';
import { CRIAR_GRAFICO, CRIAR_RESIZE_OBSERVER, Grafico, InstanciaGrafico } from './grafico';

/** O jsdom não tem ResizeObserver; esse fake deixa o teste disparar o callback manualmente. */
class ResizeObserverFalso {
  desconectado = false;
  readonly observados: Element[] = [];

  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(elemento: Element): void {
    this.observados.push(elemento);
  }

  disconnect(): void {
    this.desconectado = true;
  }

  disparar(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

const configuracao = (valores: number[], type: 'bar' | 'doughnut' = 'bar'): ChartConfiguration => ({
  type,
  data: { labels: valores.map((_, i) => `m${i}`), datasets: [{ data: valores }] },
  options: { plugins: { legend: { display: false } } },
});

@Component({
  imports: [Grafico],
  template: `
    <app-grafico [configuracao]="config()" descricao="Gráfico de teste">
      <table>
        <tbody>
          <tr>
            <td>dado</td>
          </tr>
        </tbody>
      </table>
    </app-grafico>
  `,
})
class Anfitriao {
  readonly config = signal(configuracao([1, 2, 3]));
}

describe('Grafico', () => {
  const instancias: (InstanciaGrafico & {
    destruido: boolean;
    atualizacoes: number;
    redimensionamentos: number;
  })[] = [];
  const observadores: ResizeObserverFalso[] = [];
  const criar = vi.fn();
  const criarResizeObserver = vi.fn((callback: ResizeObserverCallback) => {
    const observador = new ResizeObserverFalso(callback);
    observadores.push(observador);
    return observador as unknown as ResizeObserver;
  });

  beforeEach(() => {
    instancias.length = 0;
    observadores.length = 0;
    criarResizeObserver.mockClear();
    criar
      .mockReset()
      .mockImplementation((_canvas: HTMLCanvasElement, config: ChartConfiguration) => {
        const instancia = {
          data: config.data,
          options: config.options,
          destruido: false,
          atualizacoes: 0,
          redimensionamentos: 0,
          update() {
            this.atualizacoes++;
          },
          resize() {
            this.redimensionamentos++;
          },
          destroy() {
            this.destruido = true;
          },
        };
        instancias.push(instancia);
        return instancia;
      });
    TestBed.configureTestingModule({
      providers: [
        { provide: CRIAR_GRAFICO, useValue: criar },
        { provide: CRIAR_RESIZE_OBSERVER, useValue: criarResizeObserver },
      ],
    });
  });

  async function montar() {
    const fixture = TestBed.createComponent(Anfitriao);
    await fixture.whenStable();
    return fixture;
  }

  it('cria o gráfico no canvas com a configuração recebida', async () => {
    const fixture = await montar();

    expect(criar).toHaveBeenCalledTimes(1);
    const [canvas, config] = criar.mock.calls[0];
    expect(canvas).toBe(fixture.nativeElement.querySelector('canvas'));
    expect(config.type).toBe('bar');
    expect(config.data.datasets[0].data).toEqual([1, 2, 3]);
    expect(config.options.responsive).toBe(true);
    expect(config.options.maintainAspectRatio).toBe(false);
  });

  it('expõe o texto alternativo e a tabela dentro de um details', async () => {
    const fixture = await montar();
    const el = fixture.nativeElement as HTMLElement;

    const canvas = el.querySelector('canvas');
    expect(canvas?.getAttribute('role')).toBe('img');
    expect(canvas?.getAttribute('aria-label')).toBe('Gráfico de teste');
    expect(el.querySelector('details summary')?.textContent).toContain('Ver os dados em tabela');
    expect(el.querySelector('details table')).not.toBeNull();
  });

  it('atualiza a mesma instância quando os dados mudam', async () => {
    const fixture = await montar();

    fixture.componentInstance.config.set(configuracao([4, 5, 6]));
    await fixture.whenStable();

    expect(criar).toHaveBeenCalledTimes(1);
    expect(instancias[0].atualizacoes).toBe(1);
    expect(instancias[0].data.datasets[0].data).toEqual([4, 5, 6]);
    expect(instancias[0].destruido).toBe(false);
  });

  it('recria o gráfico quando o tipo muda', async () => {
    const fixture = await montar();

    fixture.componentInstance.config.set(configuracao([1, 2], 'doughnut'));
    await fixture.whenStable();

    expect(criar).toHaveBeenCalledTimes(2);
    expect(instancias[0].destruido).toBe(true);
    expect(instancias[1].destruido).toBe(false);
  });

  it('destrói a instância ao sair da tela', async () => {
    const fixture = await montar();

    fixture.destroy();

    expect(instancias[0].destruido).toBe(true);
    expect(observadores[0].desconectado).toBe(true);
  });

  it('chama resize() na instância quando a caixa do gráfico muda de tamanho', async () => {
    const fixture = await montar();
    const caixa = fixture.nativeElement.querySelector('.grafico');

    expect(observadores).toHaveLength(1);
    expect(observadores[0].observados).toEqual([caixa]);

    observadores[0].disparar();

    expect(instancias[0].redimensionamentos).toBe(1);
  });

  it('desliga as animações quando o usuário prefere menos movimento', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    try {
      await montar();

      expect(criar.mock.calls[0][1].options.animation).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
