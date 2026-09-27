import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { resetEnvCache } from '../config/env';
import { AppError } from '../utils/app-error';
import { assinarToken } from '../utils/jwt';
import { authMiddleware } from './auth.middleware';

const SEGREDO = 'segredo-de-teste-com-mais-de-16-chars';

function executar(authorization?: string) {
  const req = { headers: { authorization } } as Request;
  const next = jest.fn();
  authMiddleware(req, {} as Response, next);
  return { req, next };
}

function erroPassado(next: jest.Mock): AppError {
  const erro = next.mock.calls[0][0];
  expect(erro).toBeInstanceOf(AppError);
  return erro;
}

describe('authMiddleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SEGREDO;
    process.env.JWT_EXPIRES_IN = '1h';
    resetEnvCache();
  });

  it('retorna 401 quando o header Authorization está ausente', () => {
    const { next } = executar(undefined);
    expect(erroPassado(next).statusCode).toBe(401);
  });

  it('retorna 401 quando o esquema não é Bearer', () => {
    const { next } = executar('Basic abc');
    expect(erroPassado(next).statusCode).toBe(401);
  });

  it('retorna 401 para token malformado', () => {
    const { next } = executar('Bearer nao-e-um-jwt');
    expect(erroPassado(next).statusCode).toBe(401);
  });

  it('retorna 401 para token assinado com outro segredo', () => {
    const token = jwt.sign({}, 'outro-segredo-qualquer-123', { subject: '5', expiresIn: '1h' });
    const { next } = executar(`Bearer ${token}`);
    expect(erroPassado(next).statusCode).toBe(401);
  });

  it('retorna 401 para token expirado', () => {
    const token = jwt.sign({}, SEGREDO, { subject: '5', expiresIn: -10 });
    const { next } = executar(`Bearer ${token}`);
    expect(erroPassado(next).statusCode).toBe(401);
  });

  it('retorna 401 para token sem subject', () => {
    const token = jwt.sign({}, SEGREDO, { expiresIn: '1h' });
    const { next } = executar(`Bearer ${token}`);
    expect(erroPassado(next).statusCode).toBe(401);
  });

  it('injeta req.usuarioId e segue adiante com token válido', () => {
    const { req, next } = executar(`Bearer ${assinarToken(42)}`);
    expect(req.usuarioId).toBe(42);
    expect(next).toHaveBeenCalledWith();
  });
});
