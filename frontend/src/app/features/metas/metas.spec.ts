import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Params } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError } from '../../core/models/api-error';
import { MetasCategoriaDoMes, MetasDoAno } from '../../core/models/api.models';
import { digitar, escolher } from '../../testing/dom';
import { Metas } from './metas';
import { MetasService } from './metas.service';

registerLocaleData(localePt);

// `porMes`: meta do mês; `antigas`: meses cuja meta é a total antiga (sem metas por categoria).
function metasDoAno(
  ano: number,
  porMes: Record<number, number> = {},
  antigas: number[] = [],
): MetasDoAno {
  return {
    ano,
    meses: Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      orcamentoLimite: porMes[i + 1] ?? null,
      origem: i + 1 in porMes ? (antigas.includes(i + 1) ? 'ANTIGA' : 'CATEGORIAS') : null,
    })),
  };
}

const CATEGORIAS_DO_MES: MetasCategoriaDoMes = {
  ano: 2026,
  mes: 1,
  totalMetas: 1500,
  comMeta: [
    {
      categoriaId: 2,
      categoria: 'Transporte',
      meta: 500,
      gasto: 100,
      percentual: 20,
      situacao: 'DENTRO',
    },
    {
      categoriaId: 1,
      categoria: 'Alimentação',
      meta: 1000,
      gasto: 820,
      percentual: 82,
      situacao: 'ATENCAO',
    },
  ],
  semMeta: [{ categoriaId: 3, categoria: 'Lazer', gasto: 250 }],
};

describe('Metas', () => {
  const obterAno = vi.fn();
  const definir = vi.fn();
  const obterCategoriasDoMes = vi.fn();
  const definirCategoria = vi.fn();
  const copiar = vi.fn();

  async function criar(
    query: Params = { ano: '2026', mes: '1' },
    doAno = metasDoAno(2026, { 1: 2000, 3: 1500 }),
  ) {
    obterAno.mockReturnValue(of(doAno));
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: MetasService,
          useValue: { obterAno, definir, obterCategoriasDoMes, definirCategoria, copiar },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(Metas);
    await fixture.whenStable();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const botao = (el: HTMLElement, texto: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(texto));
  const texto = (el: HTMLElement, seletor: string) =>
    (el.querySelector(seletor)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    obterAno.mockReset();
    definir.mockReset();
    obterCategoriasDoMes.mockReset().mockReturnValue(of(CATEGORIAS_DO_MES));
    definirCategoria.mockReset();
    copiar.mockReset();
  });

  it('abre no mês e no ano do link e mostra a meta desse mês, que é só leitura', async () => {
    const { el } = await criar({ ano: '2026', mes: '3' });

    expect(obterAno).toHaveBeenCalledWith(2026);
    expect(texto(el, '#titulo-meta')).toBe('Meta de março de 2026');
    expect(texto(el, '.resumo-mes dd')).toMatch(/R\$\s?1\.500,00/);
    expect(el.querySelector('#meta-orcamento')).toBeNull(); // sem campo para o total
    expect(el.querySelector('.resumo-mes input')).toBeNull();
  });

  it('a meta do mês vem como soma das categorias e diz de quantas', async () => {
    const { el } = await criar();

    expect(texto(el, '.resumo-mes__origem')).toBe('Soma das metas de 2 categorias.');
    expect(el.querySelector('.resumo-mes button')).toBeNull();
  });

  it('mostra o gasto total do mês (com e sem meta) ao lado da meta', async () => {
    const { el } = await criar();

    const numeros = [...el.querySelectorAll('.resumo-mes__numeros > div')].map((d) =>
      d.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(numeros[1]).toMatch(/^Gasto no mês\s?R\$\s?1\.170,00$/); // 100 + 820 + 250
  });

  it('parâmetros inválidos na URL são ignorados (abre no ano atual)', async () => {
    await criar({ ano: 'abc', mes: '13' });

    expect(obterAno).toHaveBeenCalledWith(new Date().getFullYear());
  });

  it('a escolha de período é por mês e ano, sem "Todos os meses"', async () => {
    const { el } = await criar();

    expect(el.querySelector('#metas-mes')).not.toBeNull();
    expect(el.querySelector('#metas-ano')).not.toBeNull();
    expect(el.querySelector('#metas-mes option[value=""]')).toBeNull();
    expect(el.querySelectorAll('#metas-mes option')).toHaveLength(12);
  });

  it('mês sem meta: explica que a meta será a soma das categorias', async () => {
    const { el } = await criar({ ano: '2026', mes: '2' });

    expect(texto(el, '.resumo-mes__origem')).toContain('ainda não definiu metas');
    expect(texto(el, '.resumo-mes__origem')).toContain('soma delas');
    expect(texto(el, '.resumo-mes dd')).toContain('sem meta');
    expect(el.querySelector('.resumo-mes button')).toBeNull();
  });

  it('trocar o mês muda a meta mostrada, sem nova consulta do ano', async () => {
    const { fixture, el } = await criar();

    escolher(el, '#metas-mes', '3');
    await fixture.whenStable();

    expect(texto(el, '#titulo-meta')).toBe('Meta de março de 2026');
    expect(texto(el, '.resumo-mes dd')).toMatch(/R\$\s?1\.500,00/);
    expect(obterAno).toHaveBeenCalledTimes(1);
  });

  it('clicar no nome do mês na tabela também escolhe o mês', async () => {
    const { fixture, el } = await criar();
    const linhas = el.querySelectorAll('.tabela-metas tbody tr');

    expect(linhas).toHaveLength(12);
    expect(linhas[2].textContent).toMatch(/R\$\s?1\.500,00/);
    expect(linhas[1].textContent).toContain('sem meta');

    linhas[2].querySelector('button')!.click();
    await fixture.whenStable();

    expect(texto(el, '#titulo-meta')).toBe('Meta de março de 2026');
    expect(linhas[2].querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('trocar o ano carrega as metas daquele ano', async () => {
    const { fixture, el } = await criar();
    const anterior = new Date().getFullYear() - 1;
    obterAno.mockReturnValue(of(metasDoAno(anterior, { 1: 700 })));

    escolher(el, '#metas-ano', String(anterior));
    await fixture.whenStable();

    expect(obterAno).toHaveBeenLastCalledWith(anterior);
    expect(texto(el, '.resumo-mes dd')).toMatch(/R\$\s?700,00/);
  });

  describe('meta total antiga (definida antes das metas por categoria)', () => {
    const comAntiga = () => metasDoAno(2026, { 1: 2000 }, [1]);

    it('continua valendo, mas é explicada e marcada na tabela do ano', async () => {
      const { el } = await criar({ ano: '2026', mes: '1' }, comAntiga());

      expect(texto(el, '.resumo-mes dd')).toMatch(/R\$\s?2\.000,00/);
      expect(texto(el, '.resumo-mes__origem')).toContain('antes das metas por categoria');
      expect(el.querySelector('.tabela-metas tbody tr')?.textContent).toContain('(antiga)');
    });

    it('"Remover esta meta" envia null para o mês, avisa e relê o ano', async () => {
      definir.mockReturnValue(of({ ano: 2026, mes: 1, orcamentoLimite: null }));
      const { fixture, el } = await criar({ ano: '2026', mes: '1' }, comAntiga());

      botao(el, 'Remover esta meta')!.click();
      await fixture.whenStable();
      await fixture.whenStable();

      expect(definir).toHaveBeenCalledWith({ ano: 2026, mes: 1, orcamentoLimite: null });
      expect(texto(el, '.resumo-mes [role="status"]')).toBe(
        'Meta antiga de janeiro de 2026 removida.',
      );
      expect(obterAno).toHaveBeenCalledTimes(2);
    });

    it('mostra o erro da API ao remover', async () => {
      definir.mockReturnValue(throwError(() => new ApiError(500, 'Erro interno do servidor')));
      const { fixture, el } = await criar({ ano: '2026', mes: '1' }, comAntiga());

      botao(el, 'Remover esta meta')!.click();
      await fixture.whenStable();

      expect(el.querySelector('.resumo-mes [role="alert"]')?.textContent).toContain(
        'Erro interno do servidor',
      );
    });

    it('a mensagem some ao trocar de mês', async () => {
      definir.mockReturnValue(of({ ano: 2026, mes: 1, orcamentoLimite: null }));
      const { fixture, el } = await criar({ ano: '2026', mes: '1' }, comAntiga());

      botao(el, 'Remover esta meta')!.click();
      await fixture.whenStable();
      escolher(el, '#metas-mes', '4');
      await fixture.whenStable();

      expect(el.querySelector('.resumo-mes [role="status"]')).toBeNull();
    });
  });

  describe('metas por categoria', () => {
    const campoDe = (el: HTMLElement, categoria: string) =>
      el.querySelector<HTMLInputElement>(`input[aria-label="Meta de ${categoria}"]`)!;
    const enviarLinha = (el: HTMLElement, categoria: string) =>
      campoDe(el, categoria)
        .closest('form')!
        .dispatchEvent(new Event('submit', { cancelable: true }));

    it('consulta o mês e lista as categorias de despesa em ordem alfabética, com o gasto', async () => {
      const { el } = await criar();

      expect(obterCategoriasDoMes).toHaveBeenCalledWith(2026, 1);
      expect([...el.querySelectorAll('.categoria__nome strong')].map((n) => n.textContent)).toEqual(
        ['Alimentação', 'Lazer', 'Transporte'],
      );
      expect(texto(el, '.categoria__gasto')).toMatch(/Gasto no mês: R\$\s?820,00/);
    });

    it('cada campo tem o nome da categoria e mostra a meta atual (vazio se não há)', async () => {
      const { el } = await criar();

      expect(campoDe(el, 'Alimentação').value).toBe('1000.00');
      expect(campoDe(el, 'Transporte').value).toBe('500.00');
      expect(campoDe(el, 'Lazer').value).toBe('');
      expect(el.querySelector('button[aria-label="Salvar meta de Lazer"]')).not.toBeNull();
    });

    it('mostra a situação com texto: percentual e "atenção" aos 80%', async () => {
      const { el } = await criar();
      const selo = el.querySelector('.selo-situacao[data-situacao="ATENCAO"]');

      expect(selo?.textContent?.replace(/\s+/g, ' ')).toContain('82,0% da meta');
      expect(selo?.textContent).toContain('atenção');
      expect(el.querySelector('.selo-situacao[data-situacao="DENTRO"]')).not.toBeNull();
    });

    it('"Remover" só existe onde há meta', async () => {
      const { el } = await criar();

      expect(el.querySelector('button[aria-label="Remover meta de Alimentação"]')).not.toBeNull();
      expect(el.querySelector('button[aria-label="Remover meta de Lazer"]')).toBeNull();
    });

    it('salva a meta da categoria, avisa e relê as categorias', async () => {
      definirCategoria.mockReturnValue(of({ ano: 2026, mes: 1, categoriaId: 3, valor: 300 }));
      const { fixture, el } = await criar();

      digitar(el, 'input[aria-label="Meta de Lazer"]', '300');
      enviarLinha(el, 'Lazer');
      await fixture.whenStable();

      expect(definirCategoria).toHaveBeenCalledWith({
        ano: 2026,
        mes: 1,
        categoriaId: 3,
        valor: 300,
      });
      expect(el.textContent).toMatch(/Meta de Lazer em janeiro de 2026 salva: R\$\s?300,00/);
      expect(obterCategoriasDoMes).toHaveBeenCalledTimes(2);
    });

    it('remover envia null', async () => {
      definirCategoria.mockReturnValue(of({ ano: 2026, mes: 1, categoriaId: 1, valor: null }));
      const { fixture, el } = await criar();

      el.querySelector<HTMLButtonElement>(
        'button[aria-label="Remover meta de Alimentação"]',
      )!.click();
      await fixture.whenStable();

      expect(definirCategoria).toHaveBeenCalledWith({
        ano: 2026,
        mes: 1,
        categoriaId: 1,
        valor: null,
      });
      expect(el.textContent).toContain('Meta de Alimentação em janeiro de 2026 removida.');
    });

    it('campo vazio: avisa e não chama a API', async () => {
      const { fixture, el } = await criar();

      enviarLinha(el, 'Lazer');
      await fixture.whenStable();

      expect(el.querySelector('[role="alert"]')?.textContent).toContain(
        'Informe o valor da meta de Lazer.',
      );
      expect(definirCategoria).not.toHaveBeenCalled();
    });

    it('valor zero é rejeitado sem chamar a API', async () => {
      const { fixture, el } = await criar();

      digitar(el, 'input[aria-label="Meta de Lazer"]', '0');
      enviarLinha(el, 'Lazer');
      await fixture.whenStable();

      expect(el.querySelector('.categoria__erro')?.textContent).toContain('R$ 0,01');
      expect(definirCategoria).not.toHaveBeenCalled();
    });

    it('mostra o erro da API sem perder o valor digitado', async () => {
      definirCategoria.mockReturnValue(
        throwError(() => new ApiError(400, 'Só categorias de despesa têm meta')),
      );
      const { fixture, el } = await criar();

      digitar(el, 'input[aria-label="Meta de Lazer"]', '300');
      enviarLinha(el, 'Lazer');
      await fixture.whenStable();

      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Só categorias de despesa');
      expect(campoDe(el, 'Lazer').value).toBe('300.00');
    });

    it('o que foi digitado em outra linha sobrevive ao salvar uma linha', async () => {
      definirCategoria.mockReturnValue(of({ ano: 2026, mes: 1, categoriaId: 3, valor: 300 }));
      const { fixture, el } = await criar();

      digitar(el, 'input[aria-label="Meta de Transporte"]', '650'); // ainda não salvo
      digitar(el, 'input[aria-label="Meta de Lazer"]', '300');
      enviarLinha(el, 'Lazer');
      await fixture.whenStable();

      expect(campoDe(el, 'Transporte').value).toBe('650.00');
    });

    it('salvar ou remover a meta de uma categoria relê o ano: a meta do mês é a soma', async () => {
      definirCategoria.mockReturnValue(of({ ano: 2026, mes: 1, categoriaId: 3, valor: 300 }));
      const { fixture, el } = await criar();

      digitar(el, 'input[aria-label="Meta de Lazer"]', '300');
      enviarLinha(el, 'Lazer');
      await fixture.whenStable();
      await fixture.whenStable();

      expect(obterAno).toHaveBeenCalledTimes(2);
    });

    it('trocar o mês lê as metas por categoria do novo mês', async () => {
      const { fixture, el } = await criar();

      escolher(el, '#metas-mes', '3');
      await fixture.whenStable();

      expect(obterCategoriasDoMes).toHaveBeenLastCalledWith(2026, 3);
    });

    it('erro ao carregar as categorias aparece sem derrubar o resumo do mês', async () => {
      obterCategoriasDoMes.mockReturnValue(
        throwError(() => new ApiError(500, 'Falha nas categorias')),
      );
      const { el } = await criar();

      expect(el.querySelector('#titulo-categorias ~ [role="alert"]')?.textContent).toContain(
        'Falha nas categorias',
      );
      expect(texto(el, '.resumo-mes dd')).toMatch(/R\$\s?2\.000,00/);
    });
  });

  describe('copiar para os próximos meses', () => {
    const resultado = { copiadas: 4, puladas: 0, mesesPulados: [] };
    const copiarMetas = (el: HTMLElement) => botao(el, 'Copiar metas')!.click();

    it('não pergunta "o que copiar": o total do mês acompanha as categorias', async () => {
      const { el } = await criar();

      expect(el.querySelector('input[name="copiar-itens"]')).toBeNull();
    });

    it('oferece os 12 meses seguintes ao visto e, por padrão, copia até dezembro', async () => {
      const { el } = await criar();
      const select = el.querySelector<HTMLSelectElement>('#copiar-ate')!;

      expect(select.options).toHaveLength(12);
      expect(select.options[0].textContent?.trim()).toBe('fevereiro de 2026');
      expect(select.options[11].textContent?.trim()).toBe('janeiro de 2027');
      expect(select.selectedOptions[0].textContent?.trim()).toBe('dezembro de 2026');
    });

    it('copia o mês visto para todos os meses até o escolhido, com os padrões', async () => {
      copiar.mockReturnValue(of(resultado));
      const { fixture, el } = await criar();

      copiarMetas(el);
      await fixture.whenStable();

      const pedido = copiar.mock.calls[0][0];
      expect(pedido.origem).toEqual({ ano: 2026, mes: 1 });
      expect(pedido.destino).toHaveLength(11); // fevereiro a dezembro
      expect(pedido.destino[0]).toEqual({ ano: 2026, mes: 2 });
      expect(pedido.destino[10]).toEqual({ ano: 2026, mes: 12 });
      expect(pedido.incluir).toBe('CATEGORIAS'); // o total do mês é a soma delas
      expect(pedido.sobrescrever).toBe(false);
      expect(el.textContent).toContain('4 metas copiadas.');
    });

    it('respeita o mês final e o "substituir"', async () => {
      copiar.mockReturnValue(of({ copiadas: 2, puladas: 0, mesesPulados: [] }));
      const { fixture, el } = await criar();

      escolher(el, '#copiar-ate', '2026-3');
      el.querySelector<HTMLInputElement>('.copiar__opcao input')!.click();
      await fixture.whenStable();
      copiarMetas(el);
      await fixture.whenStable();

      expect(copiar).toHaveBeenCalledWith({
        origem: { ano: 2026, mes: 1 },
        destino: [
          { ano: 2026, mes: 2 },
          { ano: 2026, mes: 3 },
        ],
        incluir: 'CATEGORIAS',
        sobrescrever: true,
      });
    });

    it('informa o que foi mantido por já existir (e em quais meses)', async () => {
      copiar.mockReturnValue(
        of({
          copiadas: 3,
          puladas: 2,
          mesesPulados: [
            { ano: 2026, mes: 4 },
            { ano: 2026, mes: 5 },
          ],
        }),
      );
      const { fixture, el } = await criar();

      copiarMetas(el);
      await fixture.whenStable();

      const aviso = texto(el, '.copiar [role="status"]');
      expect(aviso).toContain('3 metas copiadas');
      expect(aviso).toContain(
        '2 metas que já existiam foram mantidas (abril de 2026, maio de 2026)',
      );
      expect(aviso).toContain('Substituir metas que já existem');
    });

    it('recarrega as metas do ano e das categorias depois de copiar', async () => {
      copiar.mockReturnValue(of(resultado));
      const { fixture, el } = await criar();

      copiarMetas(el);
      await fixture.whenStable();
      await fixture.whenStable();

      expect(obterAno).toHaveBeenCalledTimes(2);
      expect(obterCategoriasDoMes).toHaveBeenCalledTimes(2);
    });

    it('mostra o erro da API (ex.: mês de origem sem metas)', async () => {
      copiar.mockReturnValue(
        throwError(() => new ApiError(400, 'Não há metas em 01/2026 para copiar')),
      );
      const { fixture, el } = await criar();

      copiarMetas(el);
      await fixture.whenStable();

      expect(texto(el, '.copiar [role="alert"]')).toContain('Não há metas em 01/2026 para copiar');
    });

    it('em dezembro, os destinos passam para o ano seguinte', async () => {
      const { el } = await criar({ ano: '2026', mes: '12' });
      const select = el.querySelector<HTMLSelectElement>('#copiar-ate')!;

      expect(select.options[0].textContent?.trim()).toBe('janeiro de 2027');
      expect(select.selectedOptions[0].textContent?.trim()).toBe('janeiro de 2027');
    });
  });

  it('mostra o erro da API ao carregar', async () => {
    obterAno.mockReturnValue(throwError(() => new ApiError(500, 'Erro interno do servidor')));
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: MetasService,
          useValue: { obterAno, definir, obterCategoriasDoMes, definirCategoria, copiar },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(Metas);
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('Erro interno do servidor');
  });
});
