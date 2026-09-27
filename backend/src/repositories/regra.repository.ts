import { prisma } from '../config/database';
import { RegraCategoria } from '../types';

export interface RegraRepository {
  /** Regras do usuário, da mais recente para a mais antiga. */
  listar(usuarioId: number): Promise<RegraCategoria[]>;
  buscarPorId(id: number, usuarioId: number): Promise<RegraCategoria | null>;
  buscarPorTermo(usuarioId: number, termo: string): Promise<RegraCategoria | null>;
  criar(usuarioId: number, dados: { termo: string; categoriaId: number }): Promise<RegraCategoria>;
  atualizar(id: number, dados: { termo?: string; categoriaId?: number }): Promise<RegraCategoria>;
  excluir(id: number): Promise<void>;
}

const campos = { id: true, categoriaId: true, termo: true } as const;

export class PrismaRegraRepository implements RegraRepository {
  listar(usuarioId: number): Promise<RegraCategoria[]> {
    return prisma.regraCategoria.findMany({
      where: { usuarioId },
      select: campos,
      orderBy: { id: 'desc' },
    });
  }

  buscarPorId(id: number, usuarioId: number): Promise<RegraCategoria | null> {
    return prisma.regraCategoria.findFirst({ where: { id, usuarioId }, select: campos });
  }

  buscarPorTermo(usuarioId: number, termo: string): Promise<RegraCategoria | null> {
    return prisma.regraCategoria.findUnique({
      where: { usuarioId_termo: { usuarioId, termo } },
      select: campos,
    });
  }

  criar(usuarioId: number, dados: { termo: string; categoriaId: number }): Promise<RegraCategoria> {
    return prisma.regraCategoria.create({ data: { usuarioId, ...dados }, select: campos });
  }

  atualizar(id: number, dados: { termo?: string; categoriaId?: number }): Promise<RegraCategoria> {
    return prisma.regraCategoria.update({ where: { id }, data: dados, select: campos });
  }

  async excluir(id: number): Promise<void> {
    await prisma.regraCategoria.delete({ where: { id } });
  }
}
