import { prisma } from '../config/database';
import { Usuario } from '../types';

export interface NovoUsuario {
  nome: string;
  email: string;
  senhaHash: string;
}

export interface UsuarioRepository {
  buscarPorEmail(email: string): Promise<Usuario | null>;
  buscarPorId(id: number): Promise<Usuario | null>;
  criar(dados: NovoUsuario): Promise<Usuario>;
  /** Apaga o usuário e tudo o que é dele (transações, contas, categorias, metas, regras, objetivos). */
  excluirComDados(id: number): Promise<void>;
}

export class PrismaUsuarioRepository implements UsuarioRepository {
  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const row = await prisma.usuario.findUnique({ where: { email } });
    return row;
  }

  async buscarPorId(id: number): Promise<Usuario | null> {
    const row = await prisma.usuario.findUnique({ where: { id } });
    return row;
  }

  async criar(dados: NovoUsuario): Promise<Usuario> {
    return prisma.usuario.create({ data: dados });
  }

  async excluirComDados(id: number): Promise<void> {
    // Transações não têm cascata no schema (evita apagar histórico por engano): saem primeiro.
    // O resto (contas, categorias, metas, regras, objetivos e aportes) cai em cascata com o usuário.
    await prisma.$transaction([
      prisma.transacao.deleteMany({ where: { usuarioId: id } }),
      prisma.usuario.delete({ where: { id } }),
    ]);
  }
}
