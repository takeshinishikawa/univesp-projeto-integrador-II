import { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/auth.middleware';
import { MetaService } from '../services/meta.service';
import { definirMetaSchema, metasQuerySchema } from '../types';

export class MetaController {
  constructor(private readonly metas: MetaService) {}

  obterAno = async (req: Request, res: Response): Promise<void> => {
    const { ano } = metasQuerySchema.parse(req.query);
    res.status(200).json(await this.metas.obterAno(usuarioAutenticado(req), ano));
  };

  definir = async (req: Request, res: Response): Promise<void> => {
    const dto = definirMetaSchema.parse(req.body);
    res.status(200).json(await this.metas.definir(usuarioAutenticado(req), dto));
  };
}
