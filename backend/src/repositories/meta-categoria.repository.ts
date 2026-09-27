import { prisma } from '../config/database';

export interface MetaCategoriaLinha {
  categoriaId: number;
  ano: number;
  mes: number;
  valor: number;
}

export interface MetaTotalLinha {
  ano: number;
  mes: number;
  valor: number;
}

export interface MetaCategoriaRepository {
  /** Todas as metas por categoria do ano (qualquer mês). */
  listarDoAno(usuarioId: number, ano: number): Promise<MetaCategoriaLinha[]>;
  /** Mapa categoriaId → meta, só das categorias que têm meta no mês. */
  listarDoMes(usuarioId: number, ano: number, mes: number): Promise<Map<number, number>>;
  definir(
    usuarioId: number,
    ano: number,
    mes: number,
    categoriaId: number,
    valor: number,
  ): Promise<void>;
  remover(usuarioId: number, ano: number, mes: number, categoriaId: number): Promise<void>;
  /** Grava (cria ou substitui) as metas totais e por categoria de uma cópia, tudo ou nada. */
  gravarCopia(
    usuarioId: number,
    totais: MetaTotalLinha[],
    categorias: MetaCategoriaLinha[],
  ): Promise<void>;
}

export class PrismaMetaCategoriaRepository implements MetaCategoriaRepository {
  async listarDoAno(usuarioId: number, ano: number): Promise<MetaCategoriaLinha[]> {
    const linhas = await prisma.metaCategoria.findMany({ where: { usuarioId, ano } });
    return linhas.map((l) => ({
      categoriaId: l.categoriaId,
      ano: l.ano,
      mes: l.mes,
      valor: l.valor.toNumber(),
    }));
  }

  async listarDoMes(usuarioId: number, ano: number, mes: number): Promise<Map<number, number>> {
    const linhas = await prisma.metaCategoria.findMany({ where: { usuarioId, ano, mes } });
    return new Map(linhas.map((l) => [l.categoriaId, l.valor.toNumber()]));
  }

  async definir(
    usuarioId: number,
    ano: number,
    mes: number,
    categoriaId: number,
    valor: number,
  ): Promise<void> {
    await prisma.metaCategoria.upsert({
      where: { usuarioId_categoriaId_ano_mes: { usuarioId, categoriaId, ano, mes } },
      create: { usuarioId, categoriaId, ano, mes, valor },
      update: { valor },
    });
  }

  async remover(usuarioId: number, ano: number, mes: number, categoriaId: number): Promise<void> {
    await prisma.metaCategoria.deleteMany({ where: { usuarioId, categoriaId, ano, mes } });
  }

  async gravarCopia(
    usuarioId: number,
    totais: MetaTotalLinha[],
    categorias: MetaCategoriaLinha[],
  ): Promise<void> {
    await prisma.$transaction([
      ...totais.map(({ ano, mes, valor }) =>
        prisma.metaMensal.upsert({
          where: { usuarioId_ano_mes: { usuarioId, ano, mes } },
          create: { usuarioId, ano, mes, orcamentoLimite: valor },
          update: { orcamentoLimite: valor },
        }),
      ),
      ...categorias.map(({ categoriaId, ano, mes, valor }) =>
        prisma.metaCategoria.upsert({
          where: { usuarioId_categoriaId_ano_mes: { usuarioId, categoriaId, ano, mes } },
          create: { usuarioId, categoriaId, ano, mes, valor },
          update: { valor },
        }),
      ),
    ]);
  }
}
