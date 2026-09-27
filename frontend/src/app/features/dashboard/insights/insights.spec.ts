import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../../core/models/api-error';
import { Insight } from '../../../core/models/api.models';
import { DashboardService } from '../dashboard.service';
import { Insights } from './insights';

const INSIGHTS: Insight[] = [
  {
    id: 'CATEGORIA_EM_ALTA:1',
    tipo: 'CATEGORIA_EM_ALTA',
    severidade: 'ATENCAO',
    titulo: 'Alimentação em alta',
    texto: 'Alimentação subiu 32% em relação à média dos 3 meses anteriores.',
    link: { mes: 3, ano: 2026, categoriaId: 1, tipo: 'DESPESA' },
  },
  {
    id: 'VARIACAO_TOTAL_MES_ANTERIOR',
    tipo: 'VARIACAO_TOTAL_MES_ANTERIOR',
    severidade: 'POSITIVO',
    titulo: 'Gastos menores',
    texto: 'Você gastou 12% menos que em fevereiro.',
    link: { mes: 3, ano: 2026, tipo: 'DESPESA' },
  },
  {
    id: 'REAJUSTE_RECORRENTE:netflix',
    tipo: 'REAJUSTE_RECORRENTE',
    severidade: 'INFO',
    titulo: 'Reajuste',
    texto: 'Netflix passou de R$ 39,90 para R$ 44,90.',
    link: { mes: 3, ano: 2026, busca: 'netflix' },
  },
];

describe('Insights (card do Resumo)', () => {
  const obterInsights = vi.fn();

  async function montar(mes: number | null = 3) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DashboardService, useValue: { obterInsights } }],
    });
    const fixture = TestBed.createComponent(Insights);
    fixture.componentRef.setInput('mes', mes);
    fixture.componentRef.setInput('ano', 2026);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(() => obterInsights.mockReset().mockReturnValue(of(INSIGHTS)));

  it('consulta o mês e lista as frases em uma lista semântica', async () => {
    const { el } = await montar();

    expect(obterInsights).toHaveBeenCalledWith(2026, 3);
    expect(texto(el.querySelector('h2'))).toBe('O que chamou atenção — março de 2026');
    expect(el.querySelectorAll('ul.insights > li')).toHaveLength(3);
  });

  it('a severidade vem em ícone e em texto para leitores de tela, não só em cor', async () => {
    const { el } = await montar();
    const itens = [...el.querySelectorAll('.insight')];

    expect(itens.map((i) => i.querySelector('.insight__icone')?.textContent)).toEqual([
      '⚠',
      '✓',
      'ℹ',
    ]);
    expect(texto(itens[0].querySelector('.sr-only'))).toBe('Atenção:');
    expect(texto(itens[1].querySelector('.sr-only'))).toBe('Boa notícia:');
    expect(itens[0].querySelector('.insight__icone')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('cada frase tem link que abre as Transações já filtradas', async () => {
    const { el } = await montar();
    const links = [...el.querySelectorAll('.insight a')].map((a) => a.getAttribute('href') ?? '');

    expect(links[0]).toContain('/transacoes?');
    expect(links[0]).toContain('categoriaId=1');
    expect(links[0]).toContain('tipo=DESPESA');
    expect(links[0]).toContain('mes=3');
    expect(links[2]).toContain('busca=netflix');
  });

  it('sem nada a destacar, diz isso', async () => {
    obterInsights.mockReturnValue(of([]));
    const { el } = await montar();

    expect(el.textContent).toContain('Ainda não há o que destacar neste mês.');
  });

  it('a falha é só deste card, com aviso próprio', async () => {
    obterInsights.mockReturnValue(throwError(() => new ApiError(500, 'Erro interno')));
    const { el } = await montar();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Não foi possível gerar os destaques',
    );
    expect(el.querySelector('ul.insights')).toBeNull();
  });

  it('no ano inteiro o card não aparece e nada é consultado', async () => {
    const { el } = await montar(null);

    expect(obterInsights).not.toHaveBeenCalled();
    expect(el.querySelector('section')).toBeNull();
  });
});
