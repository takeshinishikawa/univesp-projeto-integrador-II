import { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/auth.middleware';
import { InsightService } from '../services/insight.service';
import { RecorrenciaService } from '../services/recorrencia.service';
import {
  chaveRecorrenciaParamSchema,
  ignorarRecorrenciaSchema,
  insightsQuerySchema,
  recorrentesQuerySchema,
} from '../types/novas-features';

export class RecorrenciaController {
  constructor(
    private readonly recorrencias: RecorrenciaService,
    private readonly insights: InsightService,
  ) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    const { ignoradas } = recorrentesQuerySchema.parse(req.query);
    res.status(200).json(await this.recorrencias.obter(usuarioAutenticado(req), ignoradas));
  };

  ignorar = async (req: Request, res: Response): Promise<void> => {
    const { chave } = ignorarRecorrenciaSchema.parse(req.body);
    await this.recorrencias.ignorar(usuarioAutenticado(req), chave);
    res.status(200).json({ chave });
  };

  desfazer = async (req: Request, res: Response): Promise<void> => {
    const { chave } = chaveRecorrenciaParamSchema.parse(req.params);
    await this.recorrencias.desfazer(usuarioAutenticado(req), chave);
    res.status(204).send();
  };

  insightsDoMes = async (req: Request, res: Response): Promise<void> => {
    const { ano, mes } = insightsQuerySchema.parse(req.query);
    res.status(200).json(await this.insights.obter(usuarioAutenticado(req), ano, mes));
  };
}
