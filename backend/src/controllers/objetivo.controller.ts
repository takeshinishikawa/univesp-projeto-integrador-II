import { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/auth.middleware';
import { ObjetivoService } from '../services/objetivo.service';
import { idParamSchema } from '../types';
import {
  aporteParamSchema,
  atualizarObjetivoSchema,
  criarAporteSchema,
  criarObjetivoSchema,
} from '../types/novas-features';

export class ObjetivoController {
  constructor(private readonly objetivos: ObjetivoService) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.objetivos.listar(usuarioAutenticado(req)));
  };

  resumo = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.objetivos.resumo(usuarioAutenticado(req)));
  };

  criar = async (req: Request, res: Response): Promise<void> => {
    const dto = criarObjetivoSchema.parse(req.body);
    res.status(201).json(await this.objetivos.criar(usuarioAutenticado(req), dto));
  };

  atualizar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    const dto = atualizarObjetivoSchema.parse(req.body);
    res.status(200).json(await this.objetivos.atualizar(usuarioAutenticado(req), id, dto));
  };

  excluir = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    await this.objetivos.excluir(usuarioAutenticado(req), id);
    res.status(204).send();
  };

  guardar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    const dto = criarAporteSchema.parse(req.body);
    res.status(201).json(await this.objetivos.guardar(usuarioAutenticado(req), id, dto));
  };

  desfazerAporte = async (req: Request, res: Response): Promise<void> => {
    const { id, aporteId } = aporteParamSchema.parse(req.params);
    res
      .status(200)
      .json(await this.objetivos.desfazerAporte(usuarioAutenticado(req), id, aporteId));
  };
}
