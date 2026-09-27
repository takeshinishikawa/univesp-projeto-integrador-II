import { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/auth.middleware';
import { ImportacaoService } from '../services/importacao.service';
import { confirmarImportacaoSchema } from '../types';
import { z } from 'zod';
import { AppError } from '../utils/app-error';

export class ImportacaoController {
  constructor(private readonly importacao: ImportacaoService) {}

  preview = async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw new AppError(400, 'Envie o arquivo OFX no campo "arquivo"');
    }
    // Campo de texto do multipart: a conta escolhida na tela (opcional).
    const { contaId } = z
      .object({ contaId: z.coerce.number().int().positive().optional() })
      .parse(req.body ?? {});
    res
      .status(200)
      .json(await this.importacao.gerarPreview(usuarioAutenticado(req), req.file.buffer, contaId));
  };

  confirmar = async (req: Request, res: Response): Promise<void> => {
    const dto = confirmarImportacaoSchema.parse(req.body);
    res.status(200).json(await this.importacao.confirmar(usuarioAutenticado(req), dto));
  };
}
