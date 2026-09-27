import { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/auth.middleware';
import { CategoriaService } from '../services/categoria.service';
import { atualizarCategoriaSchema, criarCategoriaSchema, idParamSchema } from '../types';

export class CategoriaController {
  constructor(private readonly categorias: CategoriaService) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.categorias.listar(usuarioAutenticado(req)));
  };

  criar = async (req: Request, res: Response): Promise<void> => {
    const dto = criarCategoriaSchema.parse(req.body);
    res.status(201).json(await this.categorias.criar(usuarioAutenticado(req), dto));
  };

  renomear = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    const dto = atualizarCategoriaSchema.parse(req.body);
    res.status(200).json(await this.categorias.renomear(usuarioAutenticado(req), id, dto));
  };

  excluir = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    await this.categorias.excluir(usuarioAutenticado(req), id);
    res.status(204).send();
  };
}
