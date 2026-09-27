import { prisma } from '../config/database';
import { AporteObjetivo } from '../types/novas-features';

export interface ObjetivoRegistro {
  id: number;
  nome: string;
  valorAlvo: number;
  prazoAno: number;
  prazoMes: number;
  criadoEm: string; // YYYY-MM-DD
  concluidoEm: string | null;
  aportes: AporteObjetivo[]; // do mais recente para o mais antigo
}

export interface DadosObjetivo {
  nome: string;
  valorAlvo: number;
  prazoAno: number;
  prazoMes: number;
}

export interface ObjetivoRepository {
  listar(usuarioId: number): Promise<ObjetivoRegistro[]>;
  buscar(id: number, usuarioId: number): Promise<ObjetivoRegistro | null>;
  contarAtivos(usuarioId: number): Promise<number>;
  criar(usuarioId: number, dados: DadosObjetivo): Promise<ObjetivoRegistro>;
  atualizar(id: number, dados: DadosObjetivo): Promise<void>;
  marcarConcluido(id: number, concluidoEm: Date | null): Promise<void>;
  excluir(id: number): Promise<void>;
  criarAporte(
    objetivoId: number,
    dados: { valor: number; data: string; observacao?: string },
  ): Promise<void>;
  buscarAporte(aporteId: number, objetivoId: number): Promise<AporteObjetivo | null>;
  excluirAporte(aporteId: number): Promise<void>;
}

const incluirAportes = {
  aportes: { orderBy: [{ data: 'desc' as const }, { id: 'desc' as const }] },
};

type Linha = {
  id: number;
  nome: string;
  valorAlvo: { toNumber(): number };
  prazoAno: number;
  prazoMes: number;
  createdAt: Date;
  concluidoEm: Date | null;
  aportes: { id: number; valor: { toNumber(): number }; data: Date; observacao: string | null }[];
};

const paraDominio = (linha: Linha): ObjetivoRegistro => ({
  id: linha.id,
  nome: linha.nome,
  valorAlvo: linha.valorAlvo.toNumber(),
  prazoAno: linha.prazoAno,
  prazoMes: linha.prazoMes,
  criadoEm: linha.createdAt.toISOString().slice(0, 10),
  concluidoEm: linha.concluidoEm ? linha.concluidoEm.toISOString().slice(0, 10) : null,
  aportes: linha.aportes.map((a) => ({
    id: a.id,
    valor: a.valor.toNumber(),
    data: a.data.toISOString().slice(0, 10),
    observacao: a.observacao,
  })),
});

export class PrismaObjetivoRepository implements ObjetivoRepository {
  async listar(usuarioId: number): Promise<ObjetivoRegistro[]> {
    const linhas = await prisma.objetivo.findMany({
      where: { usuarioId },
      include: incluirAportes,
      orderBy: [{ prazoAno: 'asc' }, { prazoMes: 'asc' }, { id: 'asc' }],
    });
    return linhas.map(paraDominio);
  }

  async buscar(id: number, usuarioId: number): Promise<ObjetivoRegistro | null> {
    const linha = await prisma.objetivo.findFirst({
      where: { id, usuarioId },
      include: incluirAportes,
    });
    return linha ? paraDominio(linha) : null;
  }

  contarAtivos(usuarioId: number): Promise<number> {
    return prisma.objetivo.count({ where: { usuarioId, concluidoEm: null } });
  }

  async criar(usuarioId: number, dados: DadosObjetivo): Promise<ObjetivoRegistro> {
    const linha = await prisma.objetivo.create({
      data: { usuarioId, ...dados },
      include: incluirAportes,
    });
    return paraDominio(linha);
  }

  async atualizar(id: number, dados: DadosObjetivo): Promise<void> {
    await prisma.objetivo.update({ where: { id }, data: dados });
  }

  async marcarConcluido(id: number, concluidoEm: Date | null): Promise<void> {
    await prisma.objetivo.update({ where: { id }, data: { concluidoEm } });
  }

  async excluir(id: number): Promise<void> {
    await prisma.objetivo.delete({ where: { id } });
  }

  async criarAporte(
    objetivoId: number,
    dados: { valor: number; data: string; observacao?: string },
  ): Promise<void> {
    await prisma.aporte.create({
      data: {
        objetivoId,
        valor: dados.valor,
        data: new Date(`${dados.data}T00:00:00.000Z`),
        observacao: dados.observacao || null,
      },
    });
  }

  async buscarAporte(aporteId: number, objetivoId: number): Promise<AporteObjetivo | null> {
    const linha = await prisma.aporte.findFirst({ where: { id: aporteId, objetivoId } });
    return linha
      ? {
          id: linha.id,
          valor: linha.valor.toNumber(),
          data: linha.data.toISOString().slice(0, 10),
          observacao: linha.observacao,
        }
      : null;
  }

  async excluirAporte(aporteId: number): Promise<void> {
    await prisma.aporte.delete({ where: { id: aporteId } });
  }
}
