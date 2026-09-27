import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../../core/models/api-error';
import { MetasCategoriaDoMes } from '../../../core/models/api.models';
import { MetasService } from '../../metas/metas.service';
import { MetasCategoria } from './metas-categoria';

registerLocaleData(localePt);

const DADOS: MetasCategoriaDoMes = {
  ano: 2026,
  mes: 3,
  totalMetas: 2700,
  comMeta: [
    {
      categoriaId: 2,
      categoria: 'Lazer',
      meta: 200,
      gasto: 300,
      percentual: 150,
      situacao: 'ESTOURADA',
    },
    {
      categoriaId: 1,
      categoria: 'Alimentação',
      meta: 1200,
      gasto: 980,
      percentual: 81.7,
      situacao: 'ATENCAO',
    },
    {
      categoriaId: 3,
      categoria: 'Transporte',
      meta: 1300,
      gasto: 130,
      percentual: 10,
      situacao: 'DENTRO',
    },
  ],
  semMeta: [{ categoriaId: 5, categoria: 'Saúde', gasto: 90 }],
};

describe('MetasCategoria (card do Resumo)', () => {
  const obterCategoriasDoMes = vi.fn();

  async function montar(
    entradas: { mes: number | null; ano?: number; mesesEstourados?: number[] | null } = {
      mes: 3,
    },
  ) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: MetasService, useValue: { obterCategoriasDoMes } },
      ],
    });
    const fixture = TestBed.createComponent(MetasCategoria);
    fixture.componentRef.setInput('mes', entradas.mes);
    fixture.componentRef.setInput('ano', entradas.ano ?? 2026);
    fixture.componentRef.setInput('mesesEstourados', entradas.mesesEstourados ?? null);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const texto = (el: HTMLElement, seletor: string) =>
    (el.querySelector(seletor)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    obterCategoriasDoMes.mockReset().mockReturnValue(of(DADOS));
  });

  it('consulta o mês e mostra uma barra de progresso por categoria, na ordem da API', async () => {
    const { el } = await montar();

    expect(obterCategoriasDoMes).toHaveBeenCalledWith(2026, 3);
    expect(texto(el, 'h2')).toBe('Metas por categoria — março de 2026');
    expect([...el.querySelectorAll('.meta__topo strong')].map((n) => n.textContent)).toEqual([
      'Lazer',
      'Alimentação',
      'Transporte',
    ]);
    expect(el.querySelectorAll('progress')).toHaveLength(3);
  });

  it('cada barra diz quanto foi usado em texto e tem nome acessível', async () => {
    const { el } = await montar();
    const alimentacao = el.querySelectorAll('.meta')[1];

    expect(alimentacao.querySelector('.meta__texto')?.textContent?.replace(/\s+/g, ' ')).toMatch(
      /R\$\s?980,00 de R\$\s?1\.200,00 — 81,7%/,
    );
    expect(alimentacao.querySelector('progress')?.getAttribute('aria-label')).toBe(
      'Meta de Alimentação: 81,7% usados',
    );
  });

  it('a situação vem em ícone + texto, não só em cor', async () => {
    const { el } = await montar();
    const situacoes = [...el.querySelectorAll('.meta__situacao')].map((s) =>
      s.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(situacoes).toEqual([
      '✕ meta estourada',
      '⚠ atenção: perto do limite',
      '✓ dentro da meta',
    ]);
    expect(el.querySelector('.meta__situacao [aria-hidden="true"]')).not.toBeNull();
  });

  it('a barra é limitada a 100%, mas o percentual real aparece no texto', async () => {
    const { el } = await montar();
    const lazer = el.querySelector('.meta')!;

    expect(lazer.querySelector('progress')?.value).toBe(100);
    expect(lazer.querySelector('.meta__texto')?.textContent).toContain('150,0%');
  });

  it('tem link para ajustar as metas já no mês visto', async () => {
    const { el } = await montar();
    const link = el.querySelector('a');

    expect(link?.textContent).toContain('Ajustar metas');
    expect(link?.getAttribute('href')).toContain('ano=2026');
    expect(link?.getAttribute('href')).toContain('mes=3');
  });

  it('dá uma dica com as categorias sem meta em que mais se gasta', async () => {
    const { el } = await montar();

    expect(texto(el, '.dica')).toMatch(/onde você mais gasta\? Saúde \(R\$\s?90,00\)\./);
  });

  it('sem metas no mês, convida a definir e sugere onde', async () => {
    obterCategoriasDoMes.mockReturnValue(
      of({
        ...DADOS,
        comMeta: [],
        totalMetas: 0,
        semMeta: [
          { categoriaId: 1, categoria: 'Alimentação', gasto: 500 },
          { categoriaId: 2, categoria: 'Lazer', gasto: 0 },
        ],
      }),
    );
    const { el } = await montar();

    expect(texto(el, 'section')).toContain('ainda não definiu metas por categoria');
    expect(el.querySelector('progress')).toBeNull();
    expect(texto(el, '.dica')).toContain('Alimentação');
    expect(texto(el, '.dica')).not.toContain('Lazer'); // sem gasto: não vale sugerir
  });

  it('mostra o erro da API sem esconder o resto da tela', async () => {
    obterCategoriasDoMes.mockReturnValue(
      throwError(() => new ApiError(500, 'Erro interno do servidor')),
    );
    const { el } = await montar();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Erro interno do servidor');
    expect(el.querySelector('progress')).toBeNull();
  });

  describe('ano inteiro', () => {
    it('não consulta por categoria e lista os meses com categoria estourada', async () => {
      const { el } = await montar({ mes: null, mesesEstourados: [1, 3, 8] });

      expect(obterCategoriasDoMes).not.toHaveBeenCalled();
      expect(texto(el, 'h2')).toBe('Metas por categoria — 2026');
      expect(texto(el, '.atencao-meses')).toContain(
        'Em 3 meses de 2026, alguma categoria passou da própria meta: janeiro, março e agosto.',
      );
    });

    it('sem nenhum mês estourado, diz que está tudo dentro', async () => {
      const { el } = await montar({ mes: null, mesesEstourados: [] });

      expect(el.textContent).toContain('Nenhuma categoria passou da própria meta em 2026.');
      expect(el.querySelector('.atencao-meses')).toBeNull();
    });

    it('enquanto o resumo do ano carrega, mostra "Carregando…"', async () => {
      const { el } = await montar({ mes: null, mesesEstourados: null });

      expect(el.textContent).toContain('Carregando…');
    });
  });

  it('trocar de mês para o ano inteiro esconde as barras', async () => {
    const { fixture, el } = await montar();
    expect(el.querySelectorAll('progress')).toHaveLength(3);

    fixture.componentRef.setInput('mes', null);
    fixture.componentRef.setInput('mesesEstourados', []);
    await fixture.whenStable();

    expect(el.querySelector('progress')).toBeNull();
  });
});
