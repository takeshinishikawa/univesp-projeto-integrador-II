import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { getEnv } from '../config/env';
import { AppError } from '../utils/app-error';

interface CorpoErro {
  status: number;
  mensagem: string;
  detalhes?: unknown;
}

function ehViolacaoUnique(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null && (erro as { code?: string }).code === 'P2002';
}

function ehCorpoGrande(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    (erro as { type?: string }).type === 'entity.too.large'
  );
}

export function errorHandler(
  erro: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let corpo: CorpoErro;

  if (erro instanceof AppError) {
    corpo = { status: erro.statusCode, mensagem: erro.message, detalhes: erro.details };
  } else if (erro instanceof ZodError) {
    corpo = {
      status: 400,
      mensagem: 'Dados inválidos',
      detalhes: erro.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
    };
  } else if (erro instanceof MulterError) {
    corpo =
      erro.code === 'LIMIT_FILE_SIZE'
        ? { status: 413, mensagem: 'Arquivo muito grande (máximo de 2 MB)' }
        : {
            status: 400,
            mensagem: 'Envio de arquivo inválido: use um único arquivo no campo "arquivo"',
          };
  } else if (ehCorpoGrande(erro)) {
    corpo = { status: 413, mensagem: 'Corpo da requisição grande demais' };
  } else if (ehViolacaoUnique(erro)) {
    corpo = { status: 409, mensagem: 'Registro já existe' };
  } else if (erro instanceof SyntaxError && 'body' in erro) {
    corpo = { status: 400, mensagem: 'JSON malformado' };
  } else {
    console.error(erro);
    corpo = { status: 500, mensagem: 'Erro interno do servidor' };
    if (getEnv().NODE_ENV !== 'production' && erro instanceof Error) {
      corpo.detalhes = erro.stack;
    }
  }

  res.status(corpo.status).json({ erro: corpo.mensagem, detalhes: corpo.detalhes });
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'Rota não encontrada'));
}
