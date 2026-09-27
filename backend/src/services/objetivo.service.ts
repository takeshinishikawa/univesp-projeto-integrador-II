import { ObjetivoRegistro, ObjetivoRepository } from '../repositories/objetivo.repository';
import {
  AtualizarObjetivoDTO,
  CriarAporteDTO,
  CriarObjetivoDTO,
  MAXIMO_OBJETIVOS_ATIVOS,
  ObjetivoComProgresso,
} from '../types/novas-features';
import { AppError } from '../utils/app-error';
import { dataLocalIso, mesesEntre } from '../utils/datas';
import { calcularProgresso } from '../utils/objetivo-calculo';

const centavos = (valor: number): number => Math.round(valor * 100);

export class ObjetivoService {
  constructor(
    private readonly objetivos: ObjetivoRepository,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  /** Objetivos com progresso, valor mensal necessário e situação; os mais próximos do prazo primeiro. */
  async listar(usuarioId: number): Promise<ObjetivoComProgresso[]> {
    const hoje = dataLocalIso(this.agora());
    return (await this.objetivos.listar(usuarioId)).map((o) => this.comProgresso(o, hoje));
  }

  /** Só os que ainda não foram concluídos (para o card do Resumo). */
  async resumo(usuarioId: number): Promise<ObjetivoComProgresso[]> {
    return (await this.listar(usuarioId)).filter((o) => o.concluidoEm === null);
  }

  async criar(usuarioId: number, dto: CriarObjetivoDTO): Promise<ObjetivoComProgresso> {
    this.garantirPrazoNaoPassado(dto.prazoAno, dto.prazoMes);
    if ((await this.objetivos.contarAtivos(usuarioId)) >= MAXIMO_OBJETIVOS_ATIVOS) {
      throw new AppError(409, `Você já tem ${MAXIMO_OBJETIVOS_ATIVOS} objetivos ativos`);
    }
    const criado = await this.objetivos.criar(usuarioId, {
      nome: dto.nome,
      valorAlvo: dto.valorAlvo,
      prazoAno: dto.prazoAno,
      prazoMes: dto.prazoMes,
    });
    if (dto.valorInicial && dto.valorInicial > 0) {
      await this.objetivos.criarAporte(criado.id, {
        valor: dto.valorInicial,
        data: dataLocalIso(this.agora()),
        observacao: 'Valor inicial',
      });
    }
    return this.reavaliar(usuarioId, criado.id);
  }

  async atualizar(
    usuarioId: number,
    id: number,
    dto: AtualizarObjetivoDTO,
  ): Promise<ObjetivoComProgresso> {
    const atual = await this.obter(usuarioId, id);
    // Manter o prazo que já estava vale mesmo depois de vencido; mudar exige um prazo futuro.
    if (dto.prazoAno !== atual.prazoAno || dto.prazoMes !== atual.prazoMes) {
      this.garantirPrazoNaoPassado(dto.prazoAno, dto.prazoMes);
    }
    await this.objetivos.atualizar(id, dto);
    return this.reavaliar(usuarioId, id);
  }

  async excluir(usuarioId: number, id: number): Promise<void> {
    await this.obter(usuarioId, id);
    await this.objetivos.excluir(id);
  }

  async guardar(usuarioId: number, id: number, dto: CriarAporteDTO): Promise<ObjetivoComProgresso> {
    await this.obter(usuarioId, id);
    await this.objetivos.criarAporte(id, dto);
    return this.reavaliar(usuarioId, id);
  }

  async desfazerAporte(
    usuarioId: number,
    id: number,
    aporteId: number,
  ): Promise<ObjetivoComProgresso> {
    await this.obter(usuarioId, id);
    if (!(await this.objetivos.buscarAporte(aporteId, id))) {
      throw new AppError(404, 'Aporte não encontrado');
    }
    await this.objetivos.excluirAporte(aporteId);
    return this.reavaliar(usuarioId, id);
  }

  // 404 (e não 403): objetivo de outro usuário se comporta como inexistente.
  private async obter(usuarioId: number, id: number): Promise<ObjetivoRegistro> {
    const objetivo = await this.objetivos.buscar(id, usuarioId);
    if (!objetivo) {
      throw new AppError(404, 'Objetivo não encontrado');
    }
    return objetivo;
  }

  // Marca (ou desmarca) a conclusão conforme o acumulado e devolve o objetivo já calculado.
  private async reavaliar(usuarioId: number, id: number): Promise<ObjetivoComProgresso> {
    const objetivo = await this.obter(usuarioId, id);
    const acumulado = objetivo.aportes.reduce((soma, a) => soma + centavos(a.valor), 0);
    const atingiu = acumulado >= centavos(objetivo.valorAlvo);
    if (atingiu && objetivo.concluidoEm === null) {
      await this.objetivos.marcarConcluido(id, this.agora());
    } else if (!atingiu && objetivo.concluidoEm !== null) {
      await this.objetivos.marcarConcluido(id, null);
    } else {
      return this.comProgresso(objetivo, dataLocalIso(this.agora()));
    }
    return this.comProgresso(await this.obter(usuarioId, id), dataLocalIso(this.agora()));
  }

  private garantirPrazoNaoPassado(prazoAno: number, prazoMes: number): void {
    const hoje = dataLocalIso(this.agora());
    if (mesesEntre(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), prazoAno, prazoMes) < 0) {
      throw new AppError(400, 'O prazo não pode ser anterior ao mês atual');
    }
  }

  private comProgresso(objetivo: ObjetivoRegistro, hoje: string): ObjetivoComProgresso {
    const acumulado = objetivo.aportes.reduce((soma, a) => soma + centavos(a.valor), 0) / 100;
    const progresso = calcularProgresso({
      valorAlvo: objetivo.valorAlvo,
      prazoAno: objetivo.prazoAno,
      prazoMes: objetivo.prazoMes,
      criadoEm: objetivo.criadoEm,
      acumulado,
      hoje,
    });
    const guardadoNoMes =
      objetivo.aportes
        .filter((a) => a.data.startsWith(hoje.slice(0, 7)))
        .reduce((soma, a) => soma + centavos(a.valor), 0) / 100;
    return {
      ...objetivo,
      acumulado,
      ...progresso,
      guardarEsteMes: Math.max(
        0,
        Math.round((progresso.valorMensalNecessario - guardadoNoMes) * 100) / 100,
      ),
    };
  }
}
