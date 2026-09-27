import { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/auth.middleware';
import { DashboardService } from '../services/dashboard.service';
import { categoriasQuerySchema, evolucaoQuerySchema, periodoQuerySchema } from '../types';

export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  resumo = async (req: Request, res: Response): Promise<void> => {
    const filtro = periodoQuerySchema.parse(req.query);
    res.status(200).json(await this.dashboard.obterResumo(usuarioAutenticado(req), filtro));
  };

  evolucao = async (req: Request, res: Response): Promise<void> => {
    const { ano, contaId } = evolucaoQuerySchema.parse(req.query);
    res.status(200).json(await this.dashboard.obterEvolucao(usuarioAutenticado(req), ano, contaId));
  };

  categorias = async (req: Request, res: Response): Promise<void> => {
    const { mes, ano, tipo, contaId } = categoriasQuerySchema.parse(req.query);
    res
      .status(200)
      .json(
        await this.dashboard.obterPorCategoria(
          usuarioAutenticado(req),
          { mes, ano, contaId },
          tipo,
        ),
      );
  };
}
