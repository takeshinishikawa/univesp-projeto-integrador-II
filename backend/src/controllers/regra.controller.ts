import { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/auth.middleware';
import { RegraService } from '../services/regra.service';
import {
  aplicarRegraSchema,
  atualizarRegraSchema,
  criarRegraSchema,
  idParamSchema,
} from '../types';

export class RegraController {
  constructor(private readonly regras: RegraService) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.regras.listar(usuarioAutenticado(req)));
  };

  criar = async (req: Request, res: Response): Promise<void> => {
    const dto = criarRegraSchema.parse(req.body);
    res.status(201).json(await this.regras.criar(usuarioAutenticado(req), dto));
  };

  atualizar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    const dto = atualizarRegraSchema.parse(req.body);
    res.status(200).json(await this.regras.atualizar(usuarioAutenticado(req), id, dto));
  };

  excluir = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    await this.regras.excluir(usuarioAutenticado(req), id);
    res.status(204).send();
  };

  aplicar = async (req: Request, res: Response): Promise<void> => {
    const { regraId } = aplicarRegraSchema.parse(req.body);
    res.status(200).json(await this.regras.aplicar(usuarioAutenticado(req), regraId));
  };
}
