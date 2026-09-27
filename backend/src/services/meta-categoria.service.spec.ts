import {
  MetaCategoriaLinha,
  MetaCategoriaRepository,
} from '../repositories/meta-categoria.repository';
import { CategoriaRepository } from '../repositories/categoria.repository';
import { MetaRepository } from '../repositories/meta.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import { Categoria } from '../types';
import { MetaCategoriaService } from './meta-categoria.service';

const ALIMENTACAO: Categoria = { id: 1, nome: 'Alimentação', tipo: 'DESPESA', usuarioId: null };
const TRANSPORTE: Categoria = { id: 2, nome: 'Transporte', tipo: 'DESPESA', usuarioId: null };
const LAZER: Categoria = { id: 3, nome: 'Lazer', tipo: 'DESPESA', usuarioId: null };
const SALARIO: Categoria = { id: 4, nome: 'Salário', tipo: 'RECEITA', usuarioId: null };
const VISIVEIS = [ALIMENTACAO, TRANSPORTE, LAZER, SALARIO];

const despesa = (categoriaId: number, valor: number) => ({
  tipo: 'DESPESA' as const,
  categoriaId,
  valor,
});

interface Cenario {
  doMes?: Record<number, number>; // metas por categoria do mês consultado
  transacoes?: unknown[];
  totais?: Record<number, number>; // metas totais (mês → valor); vale para qualquer ano
  categoriasDoAno?: MetaCategoriaLinha[]; // metas por categoria já existentes (qualquer ano)
}

function montar({ doMes = {}, transacoes = [], totais = {}, categoriasDoAno = [] }: Cenario = {}) {
  const metasCategoria = {
    listarDoAno: jest.fn().mockResolvedValue(categoriasDoAno),
    listarDoMes: jest
      .fn()
      .mockResolvedValue(new Map(Object.entries(doMes).map(([id, v]) => [Number(id), v]))),
    definir: jest.fn().mockResolvedValue(undefined),
    remover: jest.fn().mockResolvedValue(undefined),
    gravarCopia: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MetaCategoriaRepository>;
  const metas = {
    listarDoAno: jest
      .fn()
      .mockResolvedValue(new Map(Object.entries(totais).map(([mes, v]) => [Number(mes), v]))),
  } as unknown as jest.Mocked<MetaRepository>;
  const categorias = {
    listarVisiveis: jest.fn().mockResolvedValue(VISIVEIS),
    buscarVisivel: jest
      .fn()
      .mockImplementation((id: number) =>
        Promise.resolve(VISIVEIS.find((c) => c.id === id) ?? null),
      ),
  } as unknown as jest.Mocked<CategoriaRepository>;
  const repositorioTransacoes = {
    listarPorUsuarioEPeriodo: jest.fn().mockResolvedValue(transacoes),
  } as unknown as jest.Mocked<TransacaoRepository>;
  return {
    service: new MetaCategoriaService(metasCategoria, metas, categorias, repositorioTransacoes),
    metasCategoria,
    metas,
    transacoes: repositorioTransacoes,
  };
}

describe('MetaCategoriaService.obterDoMes', () => {
  it('consulta o mês pedido', async () => {
    const { service, metasCategoria, transacoes } = montar();

    await service.obterDoMes(7, 2026, 3);

    expect(metasCategoria.listarDoMes).toHaveBeenCalledWith(7, 2026, 3);
    expect(transacoes.listarPorUsuarioEPeriodo).toHaveBeenCalledWith(7, {
      inicio: new Date(Date.UTC(2026, 2, 1)),
      fim: new Date(Date.UTC(2026, 3, 1)),
    });
  });

  it.each([
    [79, 79, 'DENTRO'],
    [80, 80, 'ATENCAO'],
    [100, 100, 'ATENCAO'],
    [101, 101, 'ESTOURADA'],
  ])('com R$ %s gastos numa meta de R$ 100 marca %s%% e %s', (gasto, percentual, situacao) => {
    const { service } = montar({ doMes: { 1: 100 }, transacoes: [despesa(1, gasto)] });

    return expect(service.obterDoMes(7, 2026, 3)).resolves.toMatchObject({
      comMeta: [{ categoriaId: 1, meta: 100, gasto, percentual, situacao }],
    });
  });

  it('ordena as com meta das mais próximas de estourar para as menos', async () => {
    const { service } = montar({
      doMes: { 1: 1000, 2: 100, 3: 500 },
      transacoes: [despesa(1, 100), despesa(2, 150), despesa(3, 400)],
    });

    const { comMeta } = await service.obterDoMes(7, 2026, 3);

    expect(comMeta.map((c) => [c.categoria, c.percentual])).toEqual([
      ['Transporte', 150],
      ['Lazer', 80],
      ['Alimentação', 10],
    ]);
  });

  it('lista à parte as categorias de despesa sem meta, com o gasto do mês', async () => {
    const { service } = montar({
      doMes: { 1: 1000 },
      transacoes: [despesa(1, 100), despesa(2, 250), despesa(3, 0.5)],
    });

    const resultado = await service.obterDoMes(7, 2026, 3);

    expect(resultado.semMeta).toEqual([
      { categoriaId: 2, categoria: 'Transporte', gasto: 250 },
      { categoriaId: 3, categoria: 'Lazer', gasto: 0.5 },
    ]);
  });

  it('só considera despesas: receita não entra e categoria de receita não aparece', async () => {
    const { service } = montar({
      doMes: { 1: 100 },
      transacoes: [{ tipo: 'RECEITA', categoriaId: 1, valor: 999 }, despesa(1, 10)],
    });

    const { comMeta, semMeta } = await service.obterDoMes(7, 2026, 3);

    expect(comMeta[0].gasto).toBe(10);
    expect([...comMeta, ...semMeta].some((c) => c.categoriaId === SALARIO.id)).toBe(false);
  });

  it('soma as metas e evita ruído de ponto flutuante', async () => {
    const { service } = montar({ doMes: { 1: 0.1, 2: 0.2 } });

    expect((await service.obterDoMes(7, 2026, 3)).totalMetas).toBe(0.3);
  });

  it('sem metas: tudo em semMeta e total zero', async () => {
    const { service } = montar();

    const resultado = await service.obterDoMes(7, 2026, 3);

    expect(resultado.comMeta).toEqual([]);
    expect(resultado.semMeta).toHaveLength(3);
    expect(resultado.totalMetas).toBe(0);
  });
});

describe('MetaCategoriaService.definir', () => {
  it('grava a meta da categoria no mês', async () => {
    const { service, metasCategoria } = montar();

    await expect(
      service.definir(7, { ano: 2026, mes: 3, categoriaId: 1, valor: 1200 }),
    ).resolves.toEqual({ ano: 2026, mes: 3, categoriaId: 1, valor: 1200 });
    expect(metasCategoria.definir).toHaveBeenCalledWith(7, 2026, 3, 1, 1200);
  });

  it('null remove a meta', async () => {
    const { service, metasCategoria } = montar();

    await service.definir(7, { ano: 2026, mes: 3, categoriaId: 1, valor: null });

    expect(metasCategoria.remover).toHaveBeenCalledWith(7, 2026, 3, 1);
    expect(metasCategoria.definir).not.toHaveBeenCalled();
  });

  it('categoria de receita ou inexistente: 400, sem gravar', async () => {
    const { service, metasCategoria } = montar();

    await expect(
      service.definir(7, { ano: 2026, mes: 3, categoriaId: SALARIO.id, valor: 10 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.definir(7, { ano: 2026, mes: 3, categoriaId: 999, valor: 10 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(metasCategoria.definir).not.toHaveBeenCalled();
  });
});

describe('MetaCategoriaService.copiar', () => {
  const origem = { ano: 2026, mes: 3 };

  it('copia o total e as categorias para vários meses', async () => {
    const { service, metasCategoria } = montar({ doMes: { 1: 1200, 2: 300 }, totais: { 3: 5000 } });

    const resultado = await service.copiar(7, {
      origem,
      destino: [
        { ano: 2026, mes: 4 },
        { ano: 2026, mes: 5 },
      ],
      incluir: 'AMBAS',
      sobrescrever: false,
    });

    expect(resultado).toEqual({ copiadas: 6, puladas: 0, mesesPulados: [] });
    const [usuarioId, totais, categorias] = metasCategoria.gravarCopia.mock.calls[0];
    expect(usuarioId).toBe(7);
    expect(totais).toEqual([
      { ano: 2026, mes: 4, valor: 5000 },
      { ano: 2026, mes: 5, valor: 5000 },
    ]);
    expect(categorias).toEqual([
      { ano: 2026, mes: 4, categoriaId: 1, valor: 1200 },
      { ano: 2026, mes: 4, categoriaId: 2, valor: 300 },
      { ano: 2026, mes: 5, categoriaId: 1, valor: 1200 },
      { ano: 2026, mes: 5, categoriaId: 2, valor: 300 },
    ]);
  });

  it('"TOTAL" copia só a meta total; "CATEGORIAS" só as das categorias', async () => {
    const total = montar({ doMes: { 1: 1200 }, totais: { 3: 5000 } });
    await total.service.copiar(7, {
      origem,
      destino: [{ ano: 2026, mes: 4 }],
      incluir: 'TOTAL',
      sobrescrever: false,
    });
    expect(total.metasCategoria.gravarCopia).toHaveBeenCalledWith(
      7,
      [{ ano: 2026, mes: 4, valor: 5000 }],
      [],
    );

    const categorias = montar({ doMes: { 1: 1200 }, totais: { 3: 5000 } });
    await categorias.service.copiar(7, {
      origem,
      destino: [{ ano: 2026, mes: 4 }],
      incluir: 'CATEGORIAS',
      sobrescrever: false,
    });
    expect(categorias.metasCategoria.gravarCopia).toHaveBeenCalledWith(
      7,
      [],
      [{ ano: 2026, mes: 4, categoriaId: 1, valor: 1200 }],
    );
    expect(categorias.metas.listarDoAno).not.toHaveBeenCalled();
  });

  it('sem sobrescrever, preserva o que já existe no destino e informa os meses pulados', async () => {
    const { service, metasCategoria } = montar({
      doMes: { 1: 1200, 2: 300 },
      totais: { 3: 5000, 4: 4000 }, // abril já tem meta total
      categoriasDoAno: [{ categoriaId: 2, ano: 2026, mes: 5, valor: 50 }], // maio já tem Transporte
    });

    const resultado = await service.copiar(7, {
      origem,
      destino: [
        { ano: 2026, mes: 4 },
        { ano: 2026, mes: 5 },
      ],
      incluir: 'AMBAS',
      sobrescrever: false,
    });

    // abril: total pulado + 2 categorias copiadas; maio: total copiado + Alimentação copiada,
    // Transporte pulado.
    expect(resultado).toEqual({
      copiadas: 4,
      puladas: 2,
      mesesPulados: [
        { ano: 2026, mes: 4 },
        { ano: 2026, mes: 5 },
      ],
    });
    const [, totais, categorias] = metasCategoria.gravarCopia.mock.calls[0];
    expect(totais).toEqual([{ ano: 2026, mes: 5, valor: 5000 }]);
    expect(categorias).toEqual([
      { ano: 2026, mes: 4, categoriaId: 1, valor: 1200 },
      { ano: 2026, mes: 4, categoriaId: 2, valor: 300 },
      { ano: 2026, mes: 5, categoriaId: 1, valor: 1200 },
    ]);
  });

  it('com sobrescrever, substitui o que já existe', async () => {
    const { service, metasCategoria } = montar({
      doMes: { 1: 1200 },
      totais: { 3: 5000, 4: 4000 },
      categoriasDoAno: [{ categoriaId: 1, ano: 2026, mes: 4, valor: 50 }],
    });

    const resultado = await service.copiar(7, {
      origem,
      destino: [{ ano: 2026, mes: 4 }],
      incluir: 'AMBAS',
      sobrescrever: true,
    });

    expect(resultado).toEqual({ copiadas: 2, puladas: 0, mesesPulados: [] });
    expect(metasCategoria.gravarCopia).toHaveBeenCalledWith(
      7,
      [{ ano: 2026, mes: 4, valor: 5000 }],
      [{ ano: 2026, mes: 4, categoriaId: 1, valor: 1200 }],
    );
  });

  it('copia para o ano seguinte (virada de ano) e ignora destinos repetidos', async () => {
    const { service, metasCategoria } = montar({ totais: { 3: 5000 } });

    const resultado = await service.copiar(7, {
      origem,
      destino: [
        { ano: 2027, mes: 1 },
        { ano: 2027, mes: 1 },
      ],
      incluir: 'TOTAL',
      sobrescrever: false,
    });

    expect(resultado.copiadas).toBe(1);
    expect(metasCategoria.gravarCopia).toHaveBeenCalledWith(
      7,
      [{ ano: 2027, mes: 1, valor: 5000 }],
      [],
    );
  });

  it('origem sem metas: 400 e nada é gravado', async () => {
    const { service, metasCategoria } = montar();

    await expect(
      service.copiar(7, {
        origem,
        destino: [{ ano: 2026, mes: 4 }],
        incluir: 'AMBAS',
        sobrescrever: false,
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('03/2026') });
    expect(metasCategoria.gravarCopia).not.toHaveBeenCalled();
  });

  it('a origem não pode ser também destino (400)', async () => {
    const { service } = montar({ totais: { 3: 5000 } });

    await expect(
      service.copiar(7, { origem, destino: [origem], incluir: 'TOTAL', sobrescrever: false }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('tudo já existente e sem sobrescrever: nada é gravado', async () => {
    const { service, metasCategoria } = montar({ totais: { 3: 5000, 4: 1 } });

    const resultado = await service.copiar(7, {
      origem,
      destino: [{ ano: 2026, mes: 4 }],
      incluir: 'TOTAL',
      sobrescrever: false,
    });

    expect(resultado).toEqual({
      copiadas: 0,
      puladas: 1,
      mesesPulados: [{ ano: 2026, mes: 4 }],
    });
    expect(metasCategoria.gravarCopia).not.toHaveBeenCalled();
  });
});
