import { ContaRepository } from '../repositories/conta.repository';
import { AtualizarContaDTO, Conta, ContaComSaldo, CriarContaDTO } from '../types/novas-features';
import { AppError } from '../utils/app-error';

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

export class ContaService {
  constructor(private readonly contas: ContaRepository) {}

  /** Contas com o saldo atual (saldo inicial + receitas − despesas, transferências incluídas). */
  async listar(usuarioId: number): Promise<ContaComSaldo[]> {
    await this.contas.garantirPrincipal(usuarioId);
    const [contas, totais] = await Promise.all([
      this.contas.listar(usuarioId),
      this.contas.totaisPorConta(usuarioId),
    ]);
    return contas.map((conta) => {
      const total = totais.get(conta.id) ?? { receitas: 0, despesas: 0, quantidade: 0 };
      return {
        ...conta,
        saldo: arredondar(conta.saldoInicial + total.receitas - total.despesas),
        totalTransacoes: total.quantidade,
      };
    });
  }

  async criar(usuarioId: number, dto: CriarContaDTO): Promise<Conta> {
    await this.garantirNomeLivre(usuarioId, dto.nome);
    if (dto.identificadorExterno) {
      await this.garantirIdentificadorLivre(usuarioId, dto.identificadorExterno);
    }
    return this.contas.criar(usuarioId, dto);
  }

  async atualizar(usuarioId: number, id: number, dto: AtualizarContaDTO): Promise<Conta> {
    const conta = await this.obter(usuarioId, id);
    if (dto.nome !== undefined && dto.nome !== conta.nome) {
      await this.garantirNomeLivre(usuarioId, dto.nome);
    }
    if (dto.identificadorExterno && dto.identificadorExterno !== conta.identificadorExterno) {
      await this.garantirIdentificadorLivre(usuarioId, dto.identificadorExterno);
    }
    if (dto.arquivada === true && !conta.arquivada) {
      await this.garantirOutraAtiva(usuarioId, id, 'arquivar');
    }
    return this.contas.atualizar(id, dto);
  }

  async excluir(usuarioId: number, id: number): Promise<void> {
    await this.obter(usuarioId, id);
    const quantidade = await this.contas.contarTransacoes(id);
    if (quantidade > 0) {
      throw new AppError(
        409,
        `A conta tem ${quantidade} ${quantidade === 1 ? 'transação' : 'transações'}. Mova-as para outra conta ou arquive a conta.`,
      );
    }
    await this.garantirOutraAtiva(usuarioId, id, 'excluir');
    await this.contas.excluir(id);
  }

  /** 404 (e não 403): conta de outro usuário se comporta como inexistente. */
  async obter(usuarioId: number, id: number): Promise<Conta> {
    const conta = await this.contas.buscarPorId(id, usuarioId);
    if (!conta) {
      throw new AppError(404, 'Conta não encontrada');
    }
    return conta;
  }

  private async garantirNomeLivre(usuarioId: number, nome: string): Promise<void> {
    if (await this.contas.buscarPorNome(usuarioId, nome)) {
      throw new AppError(409, `Já existe uma conta chamada "${nome}"`);
    }
  }

  private async garantirIdentificadorLivre(
    usuarioId: number,
    identificador: string,
  ): Promise<void> {
    const existente = await this.contas.buscarPorIdentificador(usuarioId, identificador);
    if (existente) {
      throw new AppError(409, `Esse banco/conta já está vinculado à conta "${existente.nome}"`);
    }
  }

  // Todo usuário mantém ao menos uma conta ativa.
  private async garantirOutraAtiva(
    usuarioId: number,
    id: number,
    acao: 'arquivar' | 'excluir',
  ): Promise<void> {
    const outras = (await this.contas.listar(usuarioId)).filter((c) => c.id !== id && !c.arquivada);
    if (outras.length === 0) {
      throw new AppError(409, `Não é possível ${acao} a única conta ativa`);
    }
  }
}
