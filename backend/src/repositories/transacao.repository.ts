import { randomUUID } from 'node:crypto';
import { Prisma, TipoTransacao as TipoPrisma } from '@prisma/client';
import { prisma } from '../config/database';
import { CriarTransacaoDTO, LinhaImportacaoDTO, TipoTransacao, Transacao } from '../types';
import { Periodo } from '../utils/periodo';

export interface FiltroTransacoes {
  periodo?: Periodo;
  busca?: string;
  categoriaId?: number;
  contaId?: number;
  tipo?: TipoTransacao;
  valorMin?: number;
  valorMax?: number;
}

/** Transação a gravar: já com a conta resolvida (e, nas transferências, o par). */
export type NovaTransacao = Omit<CriarTransacaoDTO, 'contaId'> & {
  contaId: number;
  idExterno?: string;
};

export interface TransacaoRepository {
  criar(usuarioId: number, dados: NovaTransacao): Promise<Transacao>;
  /** Para os relatórios: as transferências entre contas ficam de fora. */
  listarPorUsuarioEPeriodo(
    usuarioId: number,
    periodo?: Periodo,
    contaId?: number,
  ): Promise<Transacao[]>;
  listarFiltradas(usuarioId: number, filtro: FiltroTransacoes): Promise<Transacao[]>;
  /** Só devolve as que pertencem ao usuário. */
  buscarPorIds(usuarioId: number, ids: number[]): Promise<Transacao[]>;
  atualizarCategoria(usuarioId: number, ids: number[], categoriaId: number): Promise<number>;
  atualizarConta(usuarioId: number, ids: number[], contaId: number): Promise<number>;
  /** Apagar uma ponta de uma transferência apaga as duas. */
  deletarVarias(usuarioId: number, ids: number[]): Promise<number>;
  buscarPorId(id: number): Promise<Transacao | null>;
  atualizar(id: number, dados: NovaTransacao): Promise<Transacao>;
  deletar(id: number): Promise<void>;
  buscarIdsExternos(
    usuarioId: number,
    contaId: number,
    idsExternos: string[],
  ): Promise<Set<string>>;
  criarVarias(usuarioId: number, contaId: number, linhas: LinhaImportacaoDTO[]): Promise<number>;
  /** Grava a saída e a entrada de uma transferência, ligadas pelo mesmo `transferenciaId`. */
  criarPar(usuarioId: number, saida: NovaTransacao, entrada: NovaTransacao): Promise<string>;
  buscarPorTransferencia(usuarioId: number, transferenciaId: string): Promise<Transacao[]>;
  excluirTransferencia(usuarioId: number, transferenciaId: string): Promise<number>;
  /** Marca uma transação existente como uma ponta e cria a outra, tudo ou nada. */
  converterEmTransferencia(id: number, contraparte: NovaTransacao): Promise<string>;
}

type TransacaoRow = {
  id: number;
  usuarioId: number;
  categoriaId: number;
  descricao: string;
  valor: Prisma.Decimal;
  tipo: TipoPrisma;
  dataTransacao: Date;
  idExterno: string | null;
  contaId: number;
  transferenciaId: string | null;
  createdAt: Date;
};

function paraDominio(row: TransacaoRow): Transacao {
  return {
    ...row,
    valor: row.valor.toNumber(),
    dataTransacao: row.dataTransacao.toISOString().slice(0, 10),
  };
}

// O Prisma não escapa os curingas do LIKE: sem isto, buscar "%" ou "_" casaria com tudo.
function escaparCuringasLike(texto: string): string {
  return texto.replace(/[\\%_]/g, '\\$&');
}

function paraDados(dados: Omit<NovaTransacao, 'idExterno'>) {
  return {
    categoriaId: dados.categoriaId,
    contaId: dados.contaId,
    descricao: dados.descricao,
    valor: dados.valor,
    tipo: dados.tipo,
    dataTransacao: new Date(`${dados.dataTransacao}T00:00:00.000Z`),
  };
}

export class PrismaTransacaoRepository implements TransacaoRepository {
  async criar(usuarioId: number, dados: NovaTransacao): Promise<Transacao> {
    const row = await prisma.transacao.create({
      data: { usuarioId, idExterno: dados.idExterno, ...paraDados(dados) },
    });
    return paraDominio(row);
  }

  async listarPorUsuarioEPeriodo(
    usuarioId: number,
    periodo?: Periodo,
    contaId?: number,
  ): Promise<Transacao[]> {
    const rows = await prisma.transacao.findMany({
      where: {
        usuarioId,
        transferenciaId: null,
        ...(contaId !== undefined && { contaId }),
        ...(periodo && { dataTransacao: { gte: periodo.inicio, lt: periodo.fim } }),
      },
      orderBy: [{ dataTransacao: 'desc' }, { id: 'desc' }],
    });
    return rows.map(paraDominio);
  }

  async listarFiltradas(usuarioId: number, filtro: FiltroTransacoes): Promise<Transacao[]> {
    const { periodo, busca, categoriaId, contaId, tipo, valorMin, valorMax } = filtro;
    const rows = await prisma.transacao.findMany({
      where: {
        usuarioId,
        ...(periodo && { dataTransacao: { gte: periodo.inicio, lt: periodo.fim } }),
        // contains vira LIKE parametrizado; a collation do MySQL ignora acento e maiúsculas
        ...(busca && { descricao: { contains: escaparCuringasLike(busca) } }),
        ...(categoriaId !== undefined && { categoriaId }),
        ...(contaId !== undefined && { contaId }),
        ...(tipo && { tipo }),
        ...((valorMin !== undefined || valorMax !== undefined) && {
          valor: {
            ...(valorMin !== undefined && { gte: valorMin }),
            ...(valorMax !== undefined && { lte: valorMax }),
          },
        }),
      },
      orderBy: [{ dataTransacao: 'desc' }, { id: 'desc' }],
    });
    return rows.map(paraDominio);
  }

  async buscarPorIds(usuarioId: number, ids: number[]): Promise<Transacao[]> {
    const rows = await prisma.transacao.findMany({ where: { usuarioId, id: { in: ids } } });
    return rows.map(paraDominio);
  }

  async atualizarCategoria(usuarioId: number, ids: number[], categoriaId: number): Promise<number> {
    const resultado = await prisma.transacao.updateMany({
      where: { usuarioId, id: { in: ids } },
      data: { categoriaId },
    });
    return resultado.count;
  }

  async atualizarConta(usuarioId: number, ids: number[], contaId: number): Promise<number> {
    const resultado = await prisma.transacao.updateMany({
      where: { usuarioId, id: { in: ids } },
      data: { contaId },
    });
    return resultado.count;
  }

  async deletarVarias(usuarioId: number, ids: number[]): Promise<number> {
    const pontas = await prisma.transacao.findMany({
      where: { usuarioId, id: { in: ids }, transferenciaId: { not: null } },
      select: { transferenciaId: true },
    });
    const transferencias = [...new Set(pontas.map((p) => p.transferenciaId as string))];
    const resultado = await prisma.transacao.deleteMany({
      where: {
        usuarioId,
        OR: [
          { id: { in: ids } },
          ...(transferencias.length ? [{ transferenciaId: { in: transferencias } }] : []),
        ],
      },
    });
    return resultado.count;
  }

  async buscarPorId(id: number): Promise<Transacao | null> {
    const row = await prisma.transacao.findUnique({ where: { id } });
    return row ? paraDominio(row) : null;
  }

  async atualizar(id: number, dados: NovaTransacao): Promise<Transacao> {
    const row = await prisma.transacao.update({ where: { id }, data: paraDados(dados) });
    return paraDominio(row);
  }

  async deletar(id: number): Promise<void> {
    const row = await prisma.transacao.findUnique({ where: { id } });
    if (row?.transferenciaId) {
      await prisma.transacao.deleteMany({ where: { transferenciaId: row.transferenciaId } });
    } else {
      await prisma.transacao.delete({ where: { id } });
    }
  }

  async buscarIdsExternos(
    usuarioId: number,
    contaId: number,
    idsExternos: string[],
  ): Promise<Set<string>> {
    const rows = await prisma.transacao.findMany({
      where: { usuarioId, contaId, idExterno: { in: idsExternos } },
      select: { idExterno: true },
    });
    return new Set(rows.flatMap((row) => (row.idExterno === null ? [] : [row.idExterno])));
  }

  // skipDuplicates (INSERT IGNORE) pula o que já existe pelo unique (usuário, conta, idExterno),
  // então reenviar o mesmo arquivo, ou duas importações simultâneas, não duplica nada.
  async criarVarias(
    usuarioId: number,
    contaId: number,
    linhas: LinhaImportacaoDTO[],
  ): Promise<number> {
    const resultado = await prisma.transacao.createMany({
      data: linhas.map((linha) => ({
        usuarioId,
        idExterno: linha.idExterno,
        ...paraDados({ ...linha, contaId }),
      })),
      skipDuplicates: true,
    });
    return resultado.count;
  }

  async criarPar(usuarioId: number, saida: NovaTransacao, entrada: NovaTransacao): Promise<string> {
    const transferenciaId = randomUUID();
    await prisma.$transaction([
      prisma.transacao.create({
        data: { usuarioId, transferenciaId, idExterno: saida.idExterno, ...paraDados(saida) },
      }),
      prisma.transacao.create({
        data: { usuarioId, transferenciaId, idExterno: entrada.idExterno, ...paraDados(entrada) },
      }),
    ]);
    return transferenciaId;
  }

  async buscarPorTransferencia(usuarioId: number, transferenciaId: string): Promise<Transacao[]> {
    const rows = await prisma.transacao.findMany({
      where: { usuarioId, transferenciaId },
      orderBy: { id: 'asc' },
    });
    return rows.map(paraDominio);
  }

  async excluirTransferencia(usuarioId: number, transferenciaId: string): Promise<number> {
    const resultado = await prisma.transacao.deleteMany({ where: { usuarioId, transferenciaId } });
    return resultado.count;
  }

  async converterEmTransferencia(id: number, contraparte: NovaTransacao): Promise<string> {
    const transferenciaId = randomUUID();
    const original = await prisma.transacao.findUniqueOrThrow({ where: { id } });
    await prisma.$transaction([
      prisma.transacao.update({ where: { id }, data: { transferenciaId } }),
      prisma.transacao.create({
        data: { usuarioId: original.usuarioId, transferenciaId, ...paraDados(contraparte) },
      }),
    ]);
    return transferenciaId;
  }
}
