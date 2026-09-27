import { prisma } from '../config/database';
import { CriarContaDTO } from '../types/novas-features';
import { Conta } from '../types/novas-features';
import { TipoConta } from '../types';

export const NOME_CONTA_PRINCIPAL = 'Conta principal';

export interface ContaRepository {
  /** Todas as contas do usuário, arquivadas inclusive, em ordem de criação. */
  listar(usuarioId: number): Promise<Conta[]>;
  buscarPorId(id: number, usuarioId: number): Promise<Conta | null>;
  buscarPorNome(usuarioId: number, nome: string): Promise<Conta | null>;
  buscarPorIdentificador(usuarioId: number, identificador: string): Promise<Conta | null>;
  /** A primeira conta ativa; se o usuário não tem nenhuma, cria a "Conta principal". */
  garantirPrincipal(usuarioId: number): Promise<Conta>;
  criar(usuarioId: number, dados: CriarContaDTO): Promise<Conta>;
  atualizar(id: number, dados: Partial<Omit<Conta, 'id'>>): Promise<Conta>;
  excluir(id: number): Promise<void>;
  contarTransacoes(id: number): Promise<number>;
  /** Soma de receitas e despesas de cada conta (transferências incluídas). */
  totaisPorConta(
    usuarioId: number,
  ): Promise<Map<number, { receitas: number; despesas: number; quantidade: number }>>;
}

type ContaRow = {
  id: number;
  nome: string;
  tipo: TipoConta;
  saldoInicial: { toNumber(): number };
  identificadorExterno: string | null;
  arquivada: boolean;
};

const paraDominio = (row: ContaRow): Conta => ({
  id: row.id,
  nome: row.nome,
  tipo: row.tipo,
  saldoInicial: row.saldoInicial.toNumber(),
  identificadorExterno: row.identificadorExterno,
  arquivada: row.arquivada,
});

export class PrismaContaRepository implements ContaRepository {
  async listar(usuarioId: number): Promise<Conta[]> {
    const rows = await prisma.conta.findMany({ where: { usuarioId }, orderBy: { id: 'asc' } });
    return rows.map(paraDominio);
  }

  async buscarPorId(id: number, usuarioId: number): Promise<Conta | null> {
    const row = await prisma.conta.findFirst({ where: { id, usuarioId } });
    return row ? paraDominio(row) : null;
  }

  async buscarPorNome(usuarioId: number, nome: string): Promise<Conta | null> {
    const row = await prisma.conta.findUnique({ where: { usuarioId_nome: { usuarioId, nome } } });
    return row ? paraDominio(row) : null;
  }

  async buscarPorIdentificador(usuarioId: number, identificador: string): Promise<Conta | null> {
    const row = await prisma.conta.findUnique({
      where: { usuarioId_identificadorExterno: { usuarioId, identificadorExterno: identificador } },
    });
    return row ? paraDominio(row) : null;
  }

  async garantirPrincipal(usuarioId: number): Promise<Conta> {
    const ativa = await prisma.conta.findFirst({
      where: { usuarioId, arquivada: false },
      orderBy: { id: 'asc' },
    });
    if (ativa) return paraDominio(ativa);
    const row = await prisma.conta.upsert({
      where: { usuarioId_nome: { usuarioId, nome: NOME_CONTA_PRINCIPAL } },
      create: { usuarioId, nome: NOME_CONTA_PRINCIPAL, tipo: 'CONTA_CORRENTE' },
      update: {},
    });
    return paraDominio(row);
  }

  async criar(usuarioId: number, dados: CriarContaDTO): Promise<Conta> {
    const row = await prisma.conta.create({
      data: {
        usuarioId,
        nome: dados.nome,
        tipo: dados.tipo,
        saldoInicial: dados.saldoInicial,
        identificadorExterno: dados.identificadorExterno ?? null,
      },
    });
    return paraDominio(row);
  }

  async atualizar(id: number, dados: Partial<Omit<Conta, 'id'>>): Promise<Conta> {
    const row = await prisma.conta.update({ where: { id }, data: dados });
    return paraDominio(row);
  }

  async excluir(id: number): Promise<void> {
    await prisma.conta.delete({ where: { id } });
  }

  contarTransacoes(id: number): Promise<number> {
    return prisma.transacao.count({ where: { contaId: id } });
  }

  async totaisPorConta(
    usuarioId: number,
  ): Promise<Map<number, { receitas: number; despesas: number; quantidade: number }>> {
    const grupos = await prisma.transacao.groupBy({
      by: ['contaId', 'tipo'],
      where: { usuarioId },
      _sum: { valor: true },
      _count: { _all: true },
    });
    const totais = new Map<number, { receitas: number; despesas: number; quantidade: number }>();
    for (const grupo of grupos) {
      const atual = totais.get(grupo.contaId) ?? { receitas: 0, despesas: 0, quantidade: 0 };
      const soma = grupo._sum.valor?.toNumber() ?? 0;
      if (grupo.tipo === 'RECEITA') atual.receitas += soma;
      else atual.despesas += soma;
      atual.quantidade += grupo._count._all;
      totais.set(grupo.contaId, atual);
    }
    return totais;
  }
}
