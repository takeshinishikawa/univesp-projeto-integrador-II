import {
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  input,
  viewChild,
} from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  DoughnutController,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

// Só o que os gráficos usam: mantém o bundle menor do que importar `registerables`.
Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
);

export interface InstanciaGrafico {
  data: ChartConfiguration['data'];
  options: ChartConfiguration['options'];
  update(): void;
  destroy(): void;
}

export type CriarGrafico = (
  canvas: HTMLCanvasElement,
  configuracao: ChartConfiguration,
) => InstanciaGrafico;

/** Fábrica do Chart.js; os testes a substituem porque o jsdom não tem canvas. */
export const CRIAR_GRAFICO = new InjectionToken<CriarGrafico>('CRIAR_GRAFICO', {
  providedIn: 'root',
  factory: () => (canvas, configuracao) => new Chart(canvas, configuracao),
});

function preferePoucoMovimento(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Canvas do Chart.js com alternativa acessível: `descricao` vira o `aria-label` do canvas e o
 * conteúdo projetado (uma tabela com os mesmos dados) fica num `<details>`.
 */
@Component({
  selector: 'app-grafico',
  template: `
    <div class="grafico" [style.height]="altura()">
      <canvas #canvas role="img" [attr.aria-label]="descricao()"></canvas>
    </div>
    <details class="alternativa">
      <summary>Ver os dados em tabela</summary>
      <ng-content />
    </details>
  `,
  styles: `
    :host {
      display: block;
    }

    .grafico {
      position: relative;
      width: 100%;
    }

    .alternativa {
      margin-top: var(--espaco-3);
    }

    summary {
      cursor: pointer;
      font-weight: 600;
    }
  `,
})
export class Grafico {
  readonly configuracao = input.required<ChartConfiguration>();
  /** Texto lido por leitores de tela no lugar do desenho. */
  readonly descricao = input.required<string>();
  readonly altura = input('20rem');

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly criar = inject(CRIAR_GRAFICO);
  private instancia: InstanciaGrafico | null = null;
  private tipoAtual: string | null = null;

  constructor() {
    effect(() => {
      const elemento = this.canvas()?.nativeElement;
      const configuracao = this.configuracao();
      if (!elemento) return;

      const completa: ChartConfiguration = {
        ...configuracao,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          ...configuracao.options,
          ...(preferePoucoMovimento() && { animation: false }),
        },
      };

      if (this.instancia && this.tipoAtual === completa.type) {
        this.instancia.data = completa.data;
        this.instancia.options = completa.options;
        this.instancia.update();
        return;
      }
      this.instancia?.destroy();
      this.instancia = this.criar(elemento, completa);
      this.tipoAtual = completa.type;
    });

    inject(DestroyRef).onDestroy(() => this.instancia?.destroy());
  }
}
