import { CategoriaRepository } from '../repositories/categoria.repository';
import {
  MetaCategoriaLinha,
  MetaCategoriaRepository,
  MetaTotalLinha,
} from '../repositories/meta-categoria.repository';
import { MetaRepository } from '../repositories/meta.repository';
import { TransacaoRepository } from '../repositories/transacao.repository';
import {
  CopiarMetasDTO,
  DefinirMetaCategoriaDTO,
  MesDoAno,
  MetaCategoriaDefinida,
  MetaCategoriaMes,
  MetasCategoriaDoMes,
  ResultadoCopiaMetas,
} from '../types';
import { AppError } from '../utils/app-error';
import { calcularPeriodo } from '../utils/periodo';
import { percentualDaMeta, situacaoDaMeta } from '../utils/situacao-meta';

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;
const rotuloMes = ({ ano, mes }: MesDoAno): string => `${String(mes).padStart(2, '0')}/${ano}`;

export class MetaCategoriaService {
  constructor(
    private readonly metasCategoria: MetaCategoriaRepository,
    private readonly metas: MetaRepository,
    private readonly categorias: CategoriaRepository,
    private readonly transacoes: TransacaoRepository,
  ) {}

  /**
   * Categorias de despesa do usuário no mês: as que têm meta (com gasto, percentual e situação,
   * das mais próximas de estourar para as menos) e as que não têm (com o gasto, para decidir
   * onde criar meta).
   */
  async obterDoMes(usuarioId: number, ano: number, mes: number): Promise<MetasCategoriaDoMes> {
    const [categorias, metas, transacoes] = await Promise.all([
      this.categorias.listarVisiveis(usuarioId),
      this.metasCategoria.listarDoMes(usuarioId, ano, mes),
      this.transacoes.listarPorUsuarioEPeriodo(usuarioId, calcularPeriodo(mes, ano)),
    ]);

    const gastos = new Map<number, number>();
    for (const t of transacoes) {
      if (t.tipo === 'DESPESA')
        gastos.set(t.categoriaId, (gastos.get(t.categoriaId) ?? 0) + t.valor);
    }

    const comMeta: MetaCategoriaMes[] = [];
    const semMeta: MetasCategoriaDoMes['semMeta'] = [];
    for (const categoria of categorias.filter((c) => c.tipo === 'DESPESA')) {
      const gasto = arredondar(gastos.get(categoria.id) ?? 0);
      const meta = metas.get(categoria.id);
      if (meta === undefined) {
        semMeta.push({ categoriaId: categoria.id, categoria: categoria.nome, gasto });
      } else {
        comMeta.push({
          categoriaId: categoria.id,
          categoria: categoria.nome,
          meta,
          gasto,
          percentual: percentualDaMeta(gasto, meta),
          situacao: situacaoDaMeta(gasto, meta),
        });
      }
    }

    const porNome = (a: { categoria: string }, b: { categoria: string }) =>
      a.categoria.localeCompare(b.categoria, 'pt-BR');
    comMeta.sort((a, b) => b.percentual - a.percentual || porNome(a, b));
    semMeta.sort((a, b) => b.gasto - a.gasto || porNome(a, b));

    return {
      ano,
      mes,
      comMeta,
      semMeta,
      totalMetas: arredondar([...metas.values()].reduce((soma, valor) => soma + valor, 0)),
    };
  }

  /** `valor: null` remove a meta da categoria no mês. */
  async definir(usuarioId: number, dto: DefinirMetaCategoriaDTO): Promise<MetaCategoriaDefinida> {
    const categoria = await this.categorias.buscarVisivel(dto.categoriaId, usuarioId);
    if (!categoria) {
      throw new AppError(400, 'Categoria inexistente');
    }
    if (categoria.tipo !== 'DESPESA') {
      throw new AppError(400, 'Só categorias de despesa têm meta');
    }

    if (dto.valor === null) {
      await this.metasCategoria.remover(usuarioId, dto.ano, dto.mes, dto.categoriaId);
    } else {
      await this.metasCategoria.definir(usuarioId, dto.ano, dto.mes, dto.categoriaId, dto.valor);
    }
    return { ano: dto.ano, mes: dto.mes, categoriaId: dto.categoriaId, valor: dto.valor };
  }

  /**
   * Copia as metas de um mês para outros. Sem `sobrescrever`, o que já existe no destino é
   * preservado e os meses em que isso aconteceu são informados.
   */
  async copiar(usuarioId: number, dto: CopiarMetasDTO): Promise<ResultadoCopiaMetas> {
    const { origem, incluir, sobrescrever } = dto;
    const destinos = [...new Map(dto.destino.map((d) => [`${d.ano}-${d.mes}`, d])).values()];
    if (destinos.some((d) => d.ano === origem.ano && d.mes === origem.mes)) {
      throw new AppError(400, 'O mês de origem não pode ser também um destino');
    }

    const copiaTotal = incluir !== 'CATEGORIAS';
    const copiaCategorias = incluir !== 'TOTAL';
    const totalOrigem = copiaTotal
      ? ((await this.metas.listarDoAno(usuarioId, origem.ano)).get(origem.mes) ?? null)
      : null;
    const categoriasOrigem = copiaCategorias
      ? await this.metasCategoria.listarDoMes(usuarioId, origem.ano, origem.mes)
      : new Map<number, number>();
    if (totalOrigem === null && categoriasOrigem.size === 0) {
      throw new AppError(400, `Não há metas em ${rotuloMes(origem)} para copiar`);
    }

    const anos = [...new Set(destinos.map((d) => d.ano))];
    const totaisExistentes = new Map<number, ReadonlyMap<number, number>>();
    const categoriasExistentes = new Set<string>();
    for (const ano of anos) {
      if (totalOrigem !== null) {
        totaisExistentes.set(ano, await this.metas.listarDoAno(usuarioId, ano));
      }
      if (categoriasOrigem.size > 0) {
        for (const l of await this.metasCategoria.listarDoAno(usuarioId, ano)) {
          categoriasExistentes.add(`${l.ano}-${l.mes}-${l.categoriaId}`);
        }
      }
    }

    const totais: MetaTotalLinha[] = [];
    const categorias: MetaCategoriaLinha[] = [];
    const mesesPulados: MesDoAno[] = [];
    let puladas = 0;

    for (const destino of destinos) {
      let pulouAlgo = false;
      if (totalOrigem !== null) {
        if (!sobrescrever && totaisExistentes.get(destino.ano)?.has(destino.mes)) {
          puladas += 1;
          pulouAlgo = true;
        } else {
          totais.push({ ...destino, valor: totalOrigem });
        }
      }
      for (const [categoriaId, valor] of categoriasOrigem) {
        if (
          !sobrescrever &&
          categoriasExistentes.has(`${destino.ano}-${destino.mes}-${categoriaId}`)
        ) {
          puladas += 1;
          pulouAlgo = true;
        } else {
          categorias.push({ ...destino, categoriaId, valor });
        }
      }
      if (pulouAlgo) mesesPulados.push({ ano: destino.ano, mes: destino.mes });
    }

    if (totais.length + categorias.length > 0) {
      await this.metasCategoria.gravarCopia(usuarioId, totais, categorias);
    }
    return { copiadas: totais.length + categorias.length, puladas, mesesPulados };
  }
}
