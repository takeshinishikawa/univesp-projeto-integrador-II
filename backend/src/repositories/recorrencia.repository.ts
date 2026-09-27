import { prisma } from '../config/database';

export interface RecorrenciaRepository {
  /** Chaves que o usuário marcou como "isso não é recorrente". */
  listarIgnoradas(usuarioId: number): Promise<Set<string>>;
  ignorar(usuarioId: number, chave: string): Promise<void>;
  desfazer(usuarioId: number, chave: string): Promise<void>;
}

export class PrismaRecorrenciaRepository implements RecorrenciaRepository {
  async listarIgnoradas(usuarioId: number): Promise<Set<string>> {
    const linhas = await prisma.recorrenciaIgnorada.findMany({
      where: { usuarioId },
      select: { chave: true },
    });
    return new Set(linhas.map((l) => l.chave));
  }

  async ignorar(usuarioId: number, chave: string): Promise<void> {
    await prisma.recorrenciaIgnorada.upsert({
      where: { usuarioId_chave: { usuarioId, chave } },
      create: { usuarioId, chave },
      update: {},
    });
  }

  async desfazer(usuarioId: number, chave: string): Promise<void> {
    await prisma.recorrenciaIgnorada.deleteMany({ where: { usuarioId, chave } });
  }
}
