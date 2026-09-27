import { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/auth.middleware';
import { MetaCategoriaService } from '../services/meta-categoria.service';
import { copiarMetasSchema, definirMetaCategoriaSchema, metasCategoriaQuerySchema } from '../types';

export class MetaCategoriaController {
  constructor(private readonly metas: MetaCategoriaService) {}

  obterDoMes = async (req: Request, res: Response): Promise<void> => {
    const { ano, mes } = metasCategoriaQuerySchema.parse(req.query);
    res.status(200).json(await this.metas.obterDoMes(usuarioAutenticado(req), ano, mes));
  };

  definir = async (req: Request, res: Response): Promise<void> => {
    const dto = definirMetaCategoriaSchema.parse(req.body);
    res.status(200).json(await this.metas.definir(usuarioAutenticado(req), dto));
  };

  copiar = async (req: Request, res: Response): Promise<void> => {
    const dto = copiarMetasSchema.parse(req.body);
    res.status(200).json(await this.metas.copiar(usuarioAutenticado(req), dto));
  };
}
