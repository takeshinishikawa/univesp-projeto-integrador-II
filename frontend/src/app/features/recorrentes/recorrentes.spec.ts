import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-error';
import { Recorrencia, RecorrentesResumo } from '../../core/models/api.models';
import { CategoriaService } from '../categorias/categoria.service';
import { Recorrentes } from './recorrentes';
import { RecorrenteService } from './recorrente.service';
import { violacoesDeAcessibilidade } from '../../testing/a11y';

registerLocaleData(localePt);

const recorrencia = (extra: Partial<Recorrencia>): Recorrencia => ({
  chave: 'netflix',
  descricao: 'Netflix',
  categoriaId: 2,
  valorTipico: 39.9,
  valorAtual: 44.9,
  valorAnterior: 39.9,
  variacaoPercentual: 12.5,
  valorVariavel: false,
  periodicidade: 'MENSAL',
  ultimaData: '2026-08-05',
  proximaData: '2026-09-05',
  situacao: 'ATIVA',
  ocorrencias: 5,
  ignorada: false,
  ...extra,
});

const RESUMO: RecorrentesResumo = {
  recorrencias: [
    recorrencia({}),
    recorrencia({
      chave: 'conta de luz',
      descricao: 'Conta de luz',
      valorTipico: 145,
      valorVariavel: true,
      variacaoPercentual: null,
    }),
    recorrencia({
      chave: 'revista',
      descricao: 'Revista',
      situacao: 'POSSIVELMENTE_ENCERRADA',
      variacaoPercentual: 0,
    }),
  ],
  custoMensal: 184.9,
  custoAnual: 2218.8,
  comprometidoNoMes: { valor: 39.9, quantidade: 1 },
};

describe('Recorrentes', () => {
  const listar = vi.fn();
  const ignorar = vi.fn();
  const desfazer = vi.fn();

  async function montar() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        { provide: RecorrenteService, useValue: { listar, ignorar, desfazer } },
        {
          provide: CategoriaService,
          useValue: { listar: () => of([{ id: 2, nome: 'Lazer', tipo: 'DESPESA', padrao: true }]) },
        },
      ],
    });
    const fixture = TestBed.createComponent(Recorrentes);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const texto = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const linhas = (el: HTMLElement) => [...el.querySelectorAll('tbody tr')];

  beforeEach(() => {
    listar.mockReset().mockReturnValue(of(RESUMO));
    ignorar.mockReset().mockReturnValue(of({ chave: 'netflix' }));
    desfazer.mockReset().mockReturnValue(of(undefined));
  });

  it('sem violações de acessibilidade (axe-core) com os dados carregados', async () => {
    const { el } = await montar();

    expect(await violacoesDeAcessibilidade(el)).toBe('');
  });

  it('mostra o custo mensal, o anual e o que ainda será cobrado no mês', async () => {
    const { el } = await montar();
    const cartoes = [...el.querySelectorAll('app-card')].map((c) => texto(c));

    expect(cartoes[0]).toMatch(/Custo fixo por mês\s?R\$\s?184,90/);
    expect(cartoes[1]).toMatch(/Custo fixo por ano\s?R\$\s?2\.218,80/);
    expect(cartoes[2]).toMatch(/R\$\s?39,90\s?1 cobrança prevista/);
  });

  it('lista as recorrentes com categoria, valor típico e próxima cobrança', async () => {
    const { el } = await montar();
    const netflix = linhas(el)[0];

    expect(texto(netflix.querySelector('th'))).toBe('Netflix');
    expect(texto(netflix)).toContain('Lazer');
    expect(texto(netflix)).toMatch(/R\$\s?39,90/);
    expect(texto(netflix)).toContain('05/09/2026');
  });

  it('a situação vem em texto: ativa, valor variável, reajuste e possivelmente encerrada', async () => {
    const { el } = await montar();
    const [netflix, luz, revista] = linhas(el).map((l) => texto(l.querySelector('.selos')));

    expect(netflix).toContain('ativa');
    expect(netflix).toMatch(/Reajuste de \+12,5%: de R\$\s?39,90 para R\$\s?44,90/);
    expect(luz).toContain('valor variável');
    expect(revista).toContain('possivelmente encerrada');
    expect(revista).not.toContain('Reajuste');
  });

  it('cada ação tem nome acessível e "Ver transações" abre a busca pela descrição', async () => {
    const { el } = await montar();
    const link = el.querySelector('a[aria-label="Ver transações de Netflix"]');

    expect(link?.getAttribute('href')).toContain('busca=netflix');
    expect(link?.getAttribute('href')).toContain('historico=1');
    expect(texto(linhas(el)[0].querySelector('button'))).toContain('Não é recorrente');
  });

  it('"Não é recorrente" marca, avisa e oferece desfazer', async () => {
    const { fixture, el } = await montar();

    linhas(el)[0].querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    await fixture.whenStable();

    expect(ignorar).toHaveBeenCalledWith('netflix');
    expect(texto(el.querySelector('[role="status"]'))).toContain(
      'não será mais tratada como recorrente',
    );

    el.querySelector<HTMLButtonElement>('[role="status"] button')!.click();
    await fixture.whenStable();

    expect(desfazer).toHaveBeenCalledWith('netflix');
  });

  it('pode mostrar também as ignoradas', async () => {
    const { fixture, el } = await montar();

    el.querySelector<HTMLInputElement>('.mostrar-ignoradas input')!.click();
    await fixture.whenStable();

    expect(listar).toHaveBeenLastCalledWith(true);
  });

  it('sem recorrentes, explica o que fazer', async () => {
    listar.mockReturnValue(
      of({
        ...RESUMO,
        recorrencias: [],
        custoMensal: 0,
        custoAnual: 0,
      } satisfies RecorrentesResumo),
    );
    const { el } = await montar();

    expect(texto(el.querySelector('.vazio'))).toContain(
      'Ainda não encontramos gastos que se repetem',
    );
    expect(el.querySelector('table')).toBeNull();
  });

  it('mostra o erro ao carregar', async () => {
    listar.mockReturnValue(throwError(() => new ApiError(500, 'Erro interno do servidor')));
    const { el } = await montar();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Erro interno do servidor');
  });
});
