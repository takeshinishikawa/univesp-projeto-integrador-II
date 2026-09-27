import { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/auth.middleware';
import { TransacaoService } from '../services/transacao.service';
import {
  atualizarTransacaoSchema,
  criarTransacaoSchema,
  excluirTransacoesSchema,
  idParamSchema,
  recategorizarTransacoesSchema,
  transacoesQuerySchema,
} from '../types';
import { moverParaContaSchema } from '../types/novas-features';

export class TransacaoController {
  constructor(private readonly transacoes: TransacaoService) {}

  listar = async (req: Request, res: Response): Promise<void> => {
    const filtro = transacoesQuerySchema.parse(req.query);
    res.status(200).json(await this.transacoes.listar(usuarioAutenticado(req), filtro));
  };

  criar = async (req: Request, res: Response): Promise<void> => {
    const dto = criarTransacaoSchema.parse(req.body);
    res.status(201).json(await this.transacoes.criar(usuarioAutenticado(req), dto));
  };

  atualizar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    const dto = atualizarTransacaoSchema.parse(req.body);
    res.status(200).json(await this.transacoes.atualizar(usuarioAutenticado(req), id, dto));
  };

  recategorizar = async (req: Request, res: Response): Promise<void> => {
    const { ids, categoriaId } = recategorizarTransacoesSchema.parse(req.body);
    res
      .status(200)
      .json(await this.transacoes.recategorizar(usuarioAutenticado(req), ids, categoriaId));
  };

  moverParaConta = async (req: Request, res: Response): Promise<void> => {
    const { ids, contaId } = moverParaContaSchema.parse(req.body);
    res
      .status(200)
      .json(await this.transacoes.moverParaConta(usuarioAutenticado(req), ids, contaId));
  };

  deletarVarias = async (req: Request, res: Response): Promise<void> => {
    const { ids } = excluirTransacoesSchema.parse(req.body);
    res.status(200).json(await this.transacoes.deletarVarias(usuarioAutenticado(req), ids));
  };

  deletar = async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);
    await this.transacoes.deletar(usuarioAutenticado(req), id);
    res.status(204).send();
  };
}
