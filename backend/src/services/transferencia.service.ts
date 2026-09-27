import { CategoriaRepository } from '../repositories/categoria.repository';
import { ContaRepository } from '../repositories/conta.repository';
import { NovaTransacao, TransacaoRepository } from '../repositories/transacao.repository';
import { Categoria, TipoTransacao, Transacao } from '../types';
import { CriarTransferenciaDTO } from '../types/novas-features';
import { AppError } from '../utils/app-error';

/** Categoria padrão "Outros" do tipo: as transferências não entram nos relatórios, então tanto faz. */
export function categoriaOutros(categorias: ReadonlyArray<Categoria>, tipo: TipoTransacao): number {
  const outros = categorias.find((c) => c.nome === 'Outros' && c.tipo === tipo && !c.usuarioId);
  if (!outros) {
    throw new AppError(500, 'Categorias padrão não encontradas; execute o seed do banco');
  }
  return outros.id;
}

const oposto = (tipo: TipoTransacao): TipoTransacao => (tipo === 'DESPESA' ? 'RECEITA' : 'DESPESA');

export class TransferenciaService {
  constructor(
    private readonly transacoes: TransacaoRepository,
    private readonly contas: ContaRepository,
    private readonly categorias: CategoriaRepository,
  ) {}

  /** Saída na conta de origem e entrada na de destino, mesmo valor e data, gravadas juntas. */
  async criar(usuarioId: number, dto: CriarTransferenciaDTO): Promise<{ transferenciaId: string }> {
    await this.garantirConta(usuarioId, dto.contaOrigemId);
    await this.garantirConta(usuarioId, dto.contaDestinoId);
    const categorias = await this.categorias.listarVisiveis(usuarioId);
    const descricao = dto.descricao || 'Transferência entre contas';
    const base = { descricao, valor: dto.valor, dataTransacao: dto.data };
    const transferenciaId = await this.transacoes.criarPar(
      usuarioId,
      {
        ...base,
        tipo: 'DESPESA',
        contaId: dto.contaOrigemId,
        categoriaId: categoriaOutros(categorias, 'DESPESA'),
      },
      {
        ...base,
        tipo: 'RECEITA',
        contaId: dto.contaDestinoId,
        categoriaId: categoriaOutros(categorias, 'RECEITA'),
      },
    );
    return { transferenciaId };
  }

  async excluir(usuarioId: number, transferenciaId: string): Promise<void> {
    const removidas = await this.transacoes.excluirTransferencia(usuarioId, transferenciaId);
    if (removidas === 0) {
      throw new AppError(404, 'Transferência não encontrada');
    }
  }

  /** Transforma uma transação existente (ex.: pagamento de fatura) em transferência. */
  async marcar(
    usuarioId: number,
    transacaoId: number,
    contaDestinoId: number,
  ): Promise<{ transferenciaId: string }> {
    const transacao = await this.obterDoUsuario(usuarioId, transacaoId);
    if (transacao.transferenciaId) {
      throw new AppError(409, 'A transação já é uma transferência');
    }
    if (transacao.contaId === contaDestinoId) {
      throw new AppError(400, 'A conta de destino deve ser diferente da conta da transação');
    }
    await this.garantirConta(usuarioId, contaDestinoId);
    const categorias = await this.categorias.listarVisiveis(usuarioId);
    const tipo = oposto(transacao.tipo);
    const contraparte: NovaTransacao = {
      descricao: transacao.descricao,
      valor: transacao.valor,
      dataTransacao: transacao.dataTransacao,
      tipo,
      contaId: contaDestinoId,
      categoriaId: categoriaOutros(categorias, tipo),
    };
    const transferenciaId = await this.transacoes.converterEmTransferencia(
      transacaoId,
      contraparte,
    );
    return { transferenciaId };
  }

  private async obterDoUsuario(usuarioId: number, id: number): Promise<Transacao> {
    const transacao = await this.transacoes.buscarPorId(id);
    if (!transacao || transacao.usuarioId !== usuarioId) {
      throw new AppError(404, 'Transação não encontrada');
    }
    return transacao;
  }

  private async garantirConta(usuarioId: number, contaId: number): Promise<void> {
    if (!(await this.contas.buscarPorId(contaId, usuarioId))) {
      throw new AppError(400, 'Conta inexistente');
    }
  }
}
