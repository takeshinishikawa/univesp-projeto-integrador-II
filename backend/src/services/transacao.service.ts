import { CategoriaRepository } from '../repositories/categoria.repository';
import { ContaRepository } from '../repositories/conta.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import { CriarTransacaoDTO, ResultadoEdicaoEmMassa, Transacao, TransacoesQuery } from '../types';
import { AppError } from '../utils/app-error';
import { calcularPeriodo } from '../utils/periodo';

export class TransacaoService {
  constructor(
    private readonly transacoes: TransacaoRepository,
    private readonly categorias: CategoriaRepository,
    private readonly contas: ContaRepository,
  ) {}

  listar(usuarioId: number, filtro: TransacoesQuery = {}): Promise<Transacao[]> {
    const { mes, ano, busca, ...demais } = filtro;
    return this.transacoes.listarFiltradas(usuarioId, {
      ...demais,
      periodo: calcularPeriodo(mes, ano),
      busca: busca || undefined, // "" (campo vazio) = sem filtro
    });
  }

  async criar(usuarioId: number, dto: CriarTransacaoDTO): Promise<Transacao> {
    await this.garantirCategoriaVisivel(usuarioId, dto.categoriaId);
    const contaId = await this.resolverConta(usuarioId, dto.contaId);
    return this.transacoes.criar(usuarioId, { ...dto, contaId });
  }

  async atualizar(usuarioId: number, id: number, dto: CriarTransacaoDTO): Promise<Transacao> {
    const atual = await this.obterDoUsuario(usuarioId, id);
    if (atual.transferenciaId) {
      throw new AppError(409, 'Transferências não podem ser editadas; exclua e registre de novo');
    }
    await this.garantirCategoriaVisivel(usuarioId, dto.categoriaId);
    const contaId =
      dto.contaId === undefined ? atual.contaId : await this.resolverConta(usuarioId, dto.contaId);
    return this.transacoes.atualizar(id, { ...dto, contaId });
  }

  async deletar(usuarioId: number, id: number): Promise<void> {
    await this.obterDoUsuario(usuarioId, id);
    await this.transacoes.deletar(id);
  }

  /** Move várias transações para uma categoria; tudo ou nada (nada é alterado se algo não servir). */
  async recategorizar(
    usuarioId: number,
    ids: number[],
    categoriaId: number,
  ): Promise<ResultadoEdicaoEmMassa> {
    const categoria = await this.categorias.buscarVisivel(categoriaId, usuarioId);
    if (!categoria) {
      throw new AppError(400, 'Categoria inexistente');
    }
    const selecionadas = await this.obterTodasDoUsuario(usuarioId, ids);
    const incompativeis = selecionadas.filter((t) => t.tipo !== categoria.tipo).length;
    if (incompativeis > 0) {
      const tipo = categoria.tipo === 'DESPESA' ? 'despesa' : 'receita';
      throw new AppError(
        400,
        `A categoria "${categoria.nome}" é de ${tipo}; ${incompativeis} das transações selecionadas são de outro tipo`,
      );
    }
    const afetadas = await this.transacoes.atualizarCategoria(usuarioId, ids, categoriaId);
    return { afetadas };
  }

  /** Move várias transações para outra conta; tudo ou nada. Transferências ficam onde estão. */
  async moverParaConta(
    usuarioId: number,
    ids: number[],
    contaId: number,
  ): Promise<ResultadoEdicaoEmMassa> {
    await this.resolverConta(usuarioId, contaId);
    const selecionadas = await this.obterTodasDoUsuario(usuarioId, ids);
    const transferencias = selecionadas.filter((t) => t.transferenciaId).length;
    if (transferencias > 0) {
      throw new AppError(400, `${transferencias} das transações selecionadas são transferências`);
    }
    try {
      return { afetadas: await this.transacoes.atualizarConta(usuarioId, ids, contaId) };
    } catch (erro) {
      // Mesmo id externo (FITID) já existe na conta de destino.
      if ((erro as { code?: string }).code === 'P2002') {
        throw new AppError(409, 'Alguma das transações já existe na conta de destino');
      }
      throw erro;
    }
  }

  async deletarVarias(usuarioId: number, ids: number[]): Promise<ResultadoEdicaoEmMassa> {
    await this.obterTodasDoUsuario(usuarioId, ids);
    return { afetadas: await this.transacoes.deletarVarias(usuarioId, ids) };
  }

  // Se qualquer id não for do usuário (ou não existir), nada é feito: 404 sem revelar qual.
  private async obterTodasDoUsuario(usuarioId: number, ids: number[]): Promise<Transacao[]> {
    const encontradas = await this.transacoes.buscarPorIds(usuarioId, ids);
    if (encontradas.length !== ids.length) {
      throw new AppError(404, 'Transação não encontrada');
    }
    return encontradas;
  }

  // 404 (e não 403) para não revelar a existência de transações de outros usuários.
  private async obterDoUsuario(usuarioId: number, id: number): Promise<Transacao> {
    const transacao = await this.transacoes.buscarPorId(id);
    if (!transacao || transacao.usuarioId !== usuarioId) {
      throw new AppError(404, 'Transação não encontrada');
    }
    return transacao;
  }

  // Categoria de outro usuário se comporta como inexistente.
  private async garantirCategoriaVisivel(usuarioId: number, categoriaId: number): Promise<void> {
    const categoria = await this.categorias.buscarVisivel(categoriaId, usuarioId);
    if (!categoria) {
      throw new AppError(400, 'Categoria inexistente');
    }
  }

  // Sem conta informada vale a principal; conta de outro usuário se comporta como inexistente.
  private async resolverConta(usuarioId: number, contaId?: number): Promise<number> {
    if (contaId === undefined) {
      return (await this.contas.garantirPrincipal(usuarioId)).id;
    }
    const conta = await this.contas.buscarPorId(contaId, usuarioId);
    if (!conta) {
      throw new AppError(400, 'Conta inexistente');
    }
    return conta.id;
  }
}
