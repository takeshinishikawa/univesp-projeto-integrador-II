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
}
