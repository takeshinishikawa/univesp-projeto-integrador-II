import { CategoriaRepository } from '../repositories/categoria.repository';
import { RegraRepository } from '../repositories/regra.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import {
  AtualizarRegraDTO,
  Categoria,
  CriarRegraDTO,
  RegraCategoria,
  ResultadoEdicaoEmMassa,
  TERMO_MINIMO,
} from '../types';
import { AppError } from '../utils/app-error';
import { descricaoCasaComTermo, normalizar } from './categorizacao.service';

// Limite do `IN (...)` por consulta, para não estourar o número de parâmetros do driver.
const TAMANHO_LOTE = 5000;

export class RegraService {
  constructor(
    private readonly regras: RegraRepository,
    private readonly categorias: CategoriaRepository,
    private readonly transacoes: TransacaoRepository,
  ) {}

  listar(usuarioId: number): Promise<RegraCategoria[]> {
    return this.regras.listar(usuarioId);
  }

  async criar(usuarioId: number, dto: CriarRegraDTO): Promise<RegraCategoria> {
    const termo = this.normalizarTermo(dto.termo);
    await this.obterCategoriaVisivel(usuarioId, dto.categoriaId);
    await this.garantirTermoLivre(usuarioId, termo);
    return this.regras.criar(usuarioId, { termo, categoriaId: dto.categoriaId });
  }

  async atualizar(usuarioId: number, id: number, dto: AtualizarRegraDTO): Promise<RegraCategoria> {
    const atual = await this.obterDoUsuario(usuarioId, id);
    const mudancas: { termo?: string; categoriaId?: number } = {};

    if (dto.termo !== undefined) {
      mudancas.termo = this.normalizarTermo(dto.termo);
      if (mudancas.termo !== atual.termo) {
        await this.garantirTermoLivre(usuarioId, mudancas.termo);
      }
    }
    if (dto.categoriaId !== undefined) {
      await this.obterCategoriaVisivel(usuarioId, dto.categoriaId);
      mudancas.categoriaId = dto.categoriaId;
    }
    return this.regras.atualizar(id, mudancas);
  }

  async excluir(usuarioId: number, id: number): Promise<void> {
    await this.obterDoUsuario(usuarioId, id);
    await this.regras.excluir(id);
  }

  /**
   * Reclassifica as transações do usuário, do mesmo tipo da categoria da regra, cuja descrição
   * casa com o termo. A comparação é feita sobre o texto normalizado (a mesma da importação),
   * por isso a seleção é em memória; a gravação é em lote, sem um UPDATE por transação.
   */
  async aplicar(usuarioId: number, regraId: number): Promise<ResultadoEdicaoEmMassa> {
    const regra = await this.obterDoUsuario(usuarioId, regraId);
    const categoria = await this.obterCategoriaVisivel(usuarioId, regra.categoriaId);

    const candidatas = await this.transacoes.listarFiltradas(usuarioId, { tipo: categoria.tipo });
    const ids = candidatas
      .filter(
        (t) => t.categoriaId !== categoria.id && descricaoCasaComTermo(t.descricao, regra.termo),
      )
      .map((t) => t.id);

    let afetadas = 0;
    for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
      afetadas += await this.transacoes.atualizarCategoria(
        usuarioId,
        ids.slice(i, i + TAMANHO_LOTE),
        categoria.id,
      );
    }
    return { afetadas };
  }

  private normalizarTermo(termo: string): string {
    const normalizado = normalizar(termo);
    // Conta só letras/números: "a.b" normaliza para "a b" (3 chars com o espaço), mas tem só
    // 2 caracteres que realmente identificam algo — sem isso, vira uma regra "a OU b" perigosa.
    const caracteresUteis = normalizado.replace(/[^a-z0-9]/g, '').length;
    if (caracteresUteis < TERMO_MINIMO) {
      throw new AppError(
        400,
        `O termo precisa ter ao menos ${TERMO_MINIMO} letras ou números (pontuação e acentos são ignorados)`,
      );
    }
    return normalizado;
  }

  private async garantirTermoLivre(usuarioId: number, termo: string): Promise<void> {
    if (await this.regras.buscarPorTermo(usuarioId, termo)) {
      throw new AppError(409, `Já existe uma regra para "${termo}"`);
    }
  }

  // Regra de outro usuário se comporta como inexistente.
  private async obterDoUsuario(usuarioId: number, id: number): Promise<RegraCategoria> {
    const regra = await this.regras.buscarPorId(id, usuarioId);
    if (!regra) {
      throw new AppError(404, 'Regra não encontrada');
    }
    return regra;
  }

  private async obterCategoriaVisivel(usuarioId: number, categoriaId: number): Promise<Categoria> {
    const categoria = await this.categorias.buscarVisivel(categoriaId, usuarioId);
    if (!categoria) {
      throw new AppError(400, 'Categoria inexistente');
    }
    return categoria;
  }
}
