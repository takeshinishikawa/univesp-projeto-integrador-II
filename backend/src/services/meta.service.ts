import { MetaCategoriaRepository } from '../repositories/meta-categoria.repository';
import { MetaRepository } from '../repositories/meta.repository';
import { DefinirMetaDTO, MetaDefinida, MetasDoAno } from '../types';
import { metasDoMes } from '../utils/meta-do-mes';

export class MetaService {
  constructor(
    private readonly metas: MetaRepository,
    private readonly metasCategoria: MetaCategoriaRepository,
  ) {}

  // Sempre 12 meses; os sem meta vêm com `orcamentoLimite: null`. A meta do mês é a soma das metas
  // por categoria (`origem: 'CATEGORIAS'`); a total antiga só vale onde não há meta por categoria.
  async obterAno(usuarioId: number, ano: number): Promise<MetasDoAno> {
    const [antigas, categorias] = await Promise.all([
      this.metas.listarDoAno(usuarioId, ano),
      this.metasCategoria.listarDoAno(usuarioId, ano),
    ]);
    const doAno = metasDoMes(antigas, categorias);
    return {
      ano,
      meses: Array.from({ length: 12 }, (_, i) => {
        const meta = doAno.get(i + 1);
        return {
          mes: i + 1,
          orcamentoLimite: meta?.valor ?? null,
          origem: meta?.origem ?? null,
        };
      }),
    };
  }

  /** Meta total antiga do mês; `orcamentoLimite: null` a remove. Não afeta as metas por categoria. */
  async definir(usuarioId: number, dto: DefinirMetaDTO): Promise<MetaDefinida> {
    if (dto.orcamentoLimite === null) {
      await this.metas.remover(usuarioId, dto.ano, dto.mes);
    } else {
      await this.metas.definir(usuarioId, dto.ano, dto.mes, dto.orcamentoLimite);
    }
    return { ano: dto.ano, mes: dto.mes, orcamentoLimite: dto.orcamentoLimite };
  }
}
