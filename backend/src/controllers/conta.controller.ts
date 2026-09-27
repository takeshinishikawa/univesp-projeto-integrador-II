import { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/auth.middleware';
import { ContaService } from '../services/conta.service';
import { TransferenciaService } from '../services/transferencia.service';
import { idParamSchema } from '../types';
import {
  atualizarContaSchema,
  criarContaSchema,
  criarTransferenciaSchema,
  marcarTransferenciaSchema,
  transferenciaIdParamSchema,
} from '../types/novas-features';

export class ContaController {
  constructor(
    private readonly contas: ContaService,
    private readonly transferencias: TransferenciaService,
  ) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.contas.listar(usuarioAutenticado(req)));
  };

  criar = async (req: Request, res: Response): Promise<void> => {
    const dto = criarContaSchema.parse(req.body);
    res.status(201).json(await this.contas.criar(usuarioAutenticado(req), dto));
  };

  atualizar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    const dto = atualizarContaSchema.parse(req.body);
    res.status(200).json(await this.contas.atualizar(usuarioAutenticado(req), id, dto));
  };

  excluir = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    await this.contas.excluir(usuarioAutenticado(req), id);
    res.status(204).send();
  };

  criarTransferencia = async (req: Request, res: Response): Promise<void> => {
    const dto = criarTransferenciaSchema.parse(req.body);
    res.status(201).json(await this.transferencias.criar(usuarioAutenticado(req), dto));
  };

  excluirTransferencia = async (req: Request, res: Response): Promise<void> => {
    const { transferenciaId } = transferenciaIdParamSchema.parse(req.params);
    await this.transferencias.excluir(usuarioAutenticado(req), transferenciaId);
    res.status(204).send();
  };

  marcarComoTransferencia = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    const { contaDestinoId } = marcarTransferenciaSchema.parse(req.body);
    res
      .status(200)
      .json(await this.transferencias.marcar(usuarioAutenticado(req), id, contaDestinoId));
  };
}
