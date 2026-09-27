import {
  MetaCategoriaLinha,
  MetaCategoriaRepository,
} from '../repositories/meta-categoria.repository';
import { MetaRepository } from '../repositories/meta.repository';
import { MetaService } from './meta.service';

function montar(antigas: Record<number, number> = {}, porCategoria: MetaCategoriaLinha[] = []) {
  const repositorio = {
    listarDoAno: jest
      .fn()
      .mockResolvedValue(new Map(Object.entries(antigas).map(([m, v]) => [Number(m), v]))),
    definir: jest.fn().mockResolvedValue(undefined),
    remover: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MetaRepository>;
  const repositorioCategorias = {
    listarDoAno: jest.fn().mockResolvedValue(porCategoria),
  } as unknown as jest.Mocked<MetaCategoriaRepository>;
  return {
    service: new MetaService(repositorio, repositorioCategorias),
    repositorio,
    repositorioCategorias,
  };
}

const linha = (mes: number, categoriaId: number, valor: number): MetaCategoriaLinha => ({
  ano: 2026,
  mes,
  categoriaId,
  valor,
});

describe('MetaService', () => {
  it('obterAno devolve sempre os 12 meses, com null onde não há meta', async () => {
    const { service, repositorio, repositorioCategorias } = montar({ 1: 2000, 3: 1800.5 });

    const resultado = await service.obterAno(7, 2026);

    expect(repositorio.listarDoAno).toHaveBeenCalledWith(7, 2026);
    expect(repositorioCategorias.listarDoAno).toHaveBeenCalledWith(7, 2026);
    expect(resultado.ano).toBe(2026);
    expect(resultado.meses).toHaveLength(12);
    expect(resultado.meses.map((m) => m.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(resultado.meses.map((m) => m.orcamentoLimite)).toEqual([
      2000,
      null,
      1800.5,
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
  });

  it('a meta do mês é a soma das metas por categoria', async () => {
    const { service } = montar({}, [linha(9, 1, 1500.1), linha(9, 2, 800.2), linha(9, 3, 1699.7)]);

    const setembro = (await service.obterAno(7, 2026)).meses[8];

    expect(setembro).toEqual({ mes: 9, orcamentoLimite: 4000, origem: 'CATEGORIAS' });
  });

  it('com metas por categoria, a meta total antiga do mês deixa de valer', async () => {
    const { service } = montar({ 9: 9999 }, [linha(9, 1, 300), linha(9, 2, 200)]);

    const setembro = (await service.obterAno(7, 2026)).meses[8];

    expect(setembro).toEqual({ mes: 9, orcamentoLimite: 500, origem: 'CATEGORIAS' });
  });

  it('sem metas por categoria, vale a meta total antiga e ela é identificada como tal', async () => {
    const { service } = montar({ 4: 2500 }, [linha(9, 1, 300)]);

    const meses = (await service.obterAno(7, 2026)).meses;

    expect(meses[3]).toEqual({ mes: 4, orcamentoLimite: 2500, origem: 'ANTIGA' });
    expect(meses[4]).toEqual({ mes: 5, orcamentoLimite: null, origem: null });
  });

  it('definir grava a meta do mês do usuário e a devolve', async () => {
    const { service, repositorio } = montar();

    await expect(
      service.definir(7, { ano: 2026, mes: 3, orcamentoLimite: 1200.5 }),
    ).resolves.toEqual({ ano: 2026, mes: 3, orcamentoLimite: 1200.5 });
    expect(repositorio.definir).toHaveBeenCalledWith(7, 2026, 3, 1200.5);
    expect(repositorio.remover).not.toHaveBeenCalled();
  });

  it('null remove a meta do mês', async () => {
    const { service, repositorio } = montar();

    await expect(service.definir(7, { ano: 2026, mes: 3, orcamentoLimite: null })).resolves.toEqual(
      { ano: 2026, mes: 3, orcamentoLimite: null },
    );
    expect(repositorio.remover).toHaveBeenCalledWith(7, 2026, 3);
    expect(repositorio.definir).not.toHaveBeenCalled();
  });
});
