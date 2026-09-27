import { CategoriaRepository } from '../repositories/categoria.repository';
import {
  AtualizarCategoriaDTO,
  Categoria,
  CategoriaPublica,
  CriarCategoriaDTO,
  TipoTransacao,
} from '../types';
import { AppError } from '../utils/app-error';
import { normalizar } from './categorizacao.service';

const paraPublica = (categoria: Categoria): CategoriaPublica => ({
  id: categoria.id,
  nome: categoria.nome,
  tipo: categoria.tipo,
  padrao: categoria.usuarioId == null,
});

const rotuloTipo = (tipo: TipoTransacao): string => (tipo === 'DESPESA' ? 'despesa' : 'receita');

export class CategoriaService {
  constructor(private readonly categorias: CategoriaRepository) {}

  async listar(usuarioId: number): Promise<CategoriaPublica[]> {
    return (await this.categorias.listarVisiveis(usuarioId)).map(paraPublica);
  }

  async criar(usuarioId: number, dto: CriarCategoriaDTO): Promise<CategoriaPublica> {
    await this.garantirNomeLivre(usuarioId, dto.nome, dto.tipo);
    return paraPublica(await this.categorias.criar(usuarioId, dto));
  }

  async renomear(
    usuarioId: number,
    id: number,
    dto: AtualizarCategoriaDTO,
  ): Promise<CategoriaPublica> {
    const categoria = await this.obterEditavel(usuarioId, id);
    await this.garantirNomeLivre(usuarioId, dto.nome, categoria.tipo, id);
    return paraPublica(await this.categorias.renomear(id, dto.nome));
  }

  async excluir(usuarioId: number, id: number): Promise<void> {
    await this.obterEditavel(usuarioId, id);
    const emUso = await this.categorias.contarTransacoes(id);
    if (emUso > 0) {
      throw new AppError(
        409,
        `A categoria está em ${emUso} transação(ões). Mova-as para outra categoria antes de excluir`,
      );
    }
    await this.categorias.excluir(id);
  }

  // Categoria de outro usuário ou inexistente: 404 (não revela que existe). Padrão: 403.
  private async obterEditavel(usuarioId: number, id: number): Promise<Categoria> {
    const categoria = await this.categorias.buscarVisivel(id, usuarioId);
    if (!categoria) {
      throw new AppError(404, 'Categoria não encontrada');
    }
    if (categoria.usuarioId == null) {
      throw new AppError(403, 'As categorias padrão não podem ser alteradas');
    }
    return categoria;
  }

  // Compara sem acento e sem diferença de maiúsculas ("Saude" = "Saúde"), entre as visíveis.
  private async garantirNomeLivre(
    usuarioId: number,
    nome: string,
    tipo: TipoTransacao,
    ignorarId?: number,
  ): Promise<void> {
    const alvo = normalizar(nome);
    const visiveis = await this.categorias.listarVisiveis(usuarioId);
    const repetida = visiveis.some(
      (c) => c.id !== ignorarId && c.tipo === tipo && normalizar(c.nome) === alvo,
    );
    if (repetida) {
      throw new AppError(409, `Já existe uma categoria de ${rotuloTipo(tipo)} com esse nome`);
    }
  }
}
