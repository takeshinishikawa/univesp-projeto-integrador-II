import { prisma } from '../config/database';

export interface MetaRepository {
  /** Mapa mês (1-12) → meta, só dos meses que têm meta. */
  listarDoAno(usuarioId: number, ano: number): Promise<Map<number, number>>;
  definir(usuarioId: number, ano: number, mes: number, orcamentoLimite: number): Promise<void>;
  remover(usuarioId: number, ano: number, mes: number): Promise<void>;
}

export class PrismaMetaRepository implements MetaRepository {
  async listarDoAno(usuarioId: number, ano: number): Promise<Map<number, number>> {
    const linhas = await prisma.metaMensal.findMany({ where: { usuarioId, ano } });
    return new Map(linhas.map((linha) => [linha.mes, linha.orcamentoLimite.toNumber()]));
  }

  async definir(
    usuarioId: number,
    ano: number,
    mes: number,
    orcamentoLimite: number,
  ): Promise<void> {
    await prisma.metaMensal.upsert({
      where: { usuarioId_ano_mes: { usuarioId, ano, mes } },
      create: { usuarioId, ano, mes, orcamentoLimite },
      update: { orcamentoLimite },
    });
  }

  async remover(usuarioId: number, ano: number, mes: number): Promise<void> {
    await prisma.metaMensal.deleteMany({ where: { usuarioId, ano, mes } });
  }
}
