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
  resize(): void;
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

export type CriarResizeObserver = (callback: ResizeObserverCallback) => ResizeObserver;

/** Fábrica do ResizeObserver; os testes a substituem porque o jsdom não tem ResizeObserver. */
export const CRIAR_RESIZE_OBSERVER = new InjectionToken<CriarResizeObserver>(
  'CRIAR_RESIZE_OBSERVER',
  {
    providedIn: 'root',
    factory: () => (callback) => new ResizeObserver(callback),
  },
);

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
    <div class="corpo" [class.corpo--expandido]="expandido()">
      <div #caixa class="grafico" [style.height]="altura()">
        <canvas #canvas role="img" [attr.aria-label]="descricao()"></canvas>
      </div>
      <details #detalhes class="alternativa" [class.alternativa--expandida]="expandido()">
        <summary>Ver os dados em tabela</summary>
        <div class="alternativa__rolagem"><ng-content /></div>
      </details>
    </div>
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
      max-width: 100%;
      margin-top: var(--espaco-3);
    }

    // O overflow-x precisa estar num elemento DENTRO do <details>, não nele mesmo (o <details>
    // não recorta o próprio conteúdo). position: relative é necessário à parte: sem um
    // containing block aqui, os .sr-only (position: absolute) da tabela projetada escapam
    // deste contêiner e alargam a página mesmo com o overflow-x funcionando.
    .alternativa__rolagem {
      position: relative;
      max-width: 100%;
      overflow-x: auto;
    }

    summary {
      cursor: pointer;
      font-weight: 600;
    }

    // "Expandido": o <details> fica sempre aberto (via JS, abaixo) e sem o controle de
    // colapsar — visualmente é só um bloco normal, igual ao protótipo de alta fidelidade.
    .alternativa--expandida summary {
      display: none;
    }

    // "Expandido": tabela sempre visível ao lado do gráfico (telas largas) em vez de escondida num <details>.
    .corpo--expandido {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--espaco-4);

      .grafico {
        // Menor prioridade: é circular, não precisa de largura extra — só a altura já limita o raio.
        flex: 1 1 10rem;
        min-width: 10rem;
        // Rede de segurança: se o canvas chegar a renderizar com o tamanho errado (corrida entre
        // o Chart.js e o flex-wrap assentando no load), isso evita que ele vaze por cima da
        // tabela ao lado até o ResizeObserver corrigir o tamanho.
        overflow: hidden;
      }

      .alternativa--expandida {
        // Mais prioridade: tem texto (nome da categoria) que não pode quebrar de linha.
        flex: 2 1 18rem;
        // Nunca menor que o próprio conteúdo (nomes/valores em nowrap): se não couber do lado
        // do gráfico, o flex-wrap do .corpo--expandido desce a tabela para a linha de baixo
        // em vez de espremê-la com rolagem interna.
        min-width: min(100%, max-content);
        max-width: 100%;
        margin-top: 0;
      }
    }
  `,
})
export class Grafico {
  readonly configuracao = input.required<ChartConfiguration>();
  /** Texto lido por leitores de tela no lugar do desenho. */
  readonly descricao = input.required<string>();
  readonly altura = input('20rem');
  /** `true`: a tabela (conteúdo projetado) fica sempre visível ao lado do gráfico, em vez de escondida num `<details>`. */
  readonly expandido = input(false);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly caixa = viewChild<ElementRef<HTMLDivElement>>('caixa');
  private readonly detalhes = viewChild<ElementRef<HTMLDetailsElement>>('detalhes');
  private readonly criar = inject(CRIAR_GRAFICO);
  private readonly criarResizeObserver = inject(CRIAR_RESIZE_OBSERVER);
  private instancia: InstanciaGrafico | null = null;
  private tipoAtual: string | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      // Só força `open`; nunca força `false`, para não atrapalhar quem abre/fecha manualmente
      // o <details> no modo padrão (não expandido).
      if (this.expandido()) {
        const elemento = this.detalhes()?.nativeElement;
        if (elemento) elemento.open = true;
      }
    });

    effect(() => {
      // A caixa não muda de referência depois de criada; só precisa observar uma vez.
      const elemento = this.caixa()?.nativeElement;
      if (!elemento || this.resizeObserver) return;

      // O Chart.js pode criar o canvas num instante em que o layout flex ainda não assentou
      // (ex.: o parágrafo acima quebra linha um instante depois do primeiro paint), gravando um
      // tamanho errado que só um resize de verdade corrigiria. Observar a própria caixa do
      // gráfico e chamar `resize()` cobre esse reflow tardio, mesmo sem a janela mudar de tamanho.
      this.resizeObserver = this.criarResizeObserver(() => this.instancia?.resize());
      this.resizeObserver.observe(elemento);
    });

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

    inject(DestroyRef).onDestroy(() => {
      this.instancia?.destroy();
      this.resizeObserver?.disconnect();
    });
  }
}
