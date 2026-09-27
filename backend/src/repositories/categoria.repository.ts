import { prisma } from '../config/database';
import { Categoria, TipoTransacao } from '../types';

export interface CategoriaRepository {
  /** Padrão (de todos) + as criadas pelo usuário. */
  listarVisiveis(usuarioId: number): Promise<Categoria[]>;
  /** Só devolve se a categoria for padrão ou do usuário. */
  buscarVisivel(id: number, usuarioId: number): Promise<Categoria | null>;
  criar(usuarioId: number, dados: { nome: string; tipo: TipoTransacao }): Promise<Categoria>;
  renomear(id: number, nome: string): Promise<Categoria>;
  excluir(id: number): Promise<void>;
  contarTransacoes(id: number): Promise<number>;
}

const visiveisPara = (usuarioId: number) => ({ OR: [{ usuarioId: null }, { usuarioId }] });

export class PrismaCategoriaRepository implements CategoriaRepository {
  listarVisiveis(usuarioId: number): Promise<Categoria[]> {
    return prisma.categoria.findMany({
      where: visiveisPara(usuarioId),
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    });
  }

  buscarVisivel(id: number, usuarioId: number): Promise<Categoria | null> {
    return prisma.categoria.findFirst({ where: { id, ...visiveisPara(usuarioId) } });
  }

  criar(usuarioId: number, dados: { nome: string; tipo: TipoTransacao }): Promise<Categoria> {
    return prisma.categoria.create({ data: { ...dados, usuarioId } });
  }

  renomear(id: number, nome: string): Promise<Categoria> {
    return prisma.categoria.update({ where: { id }, data: { nome } });
  }

  async excluir(id: number): Promise<void> {
    await prisma.categoria.delete({ where: { id } });
  }

  contarTransacoes(id: number): Promise<number> {
    return prisma.transacao.count({ where: { categoriaId: id } });
  }
}
