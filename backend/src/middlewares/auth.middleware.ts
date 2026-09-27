import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/app-error';
import { verificarToken } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuarioId?: number;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const [esquema, token] = (req.headers.authorization ?? '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    return next(new AppError(401, 'Token de autenticação ausente'));
  }

  try {
    req.usuarioId = verificarToken(token);
    next();
  } catch {
    next(new AppError(401, 'Token inválido ou expirado'));
  }
}

export function usuarioAutenticado(req: Request): number {
  if (req.usuarioId === undefined) {
    throw new AppError(401, 'Não autenticado');
  }
  return req.usuarioId;
}
