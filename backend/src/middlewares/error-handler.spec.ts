import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { z } from 'zod';
import { resetEnvCache } from '../config/env';
import { AppError } from '../utils/app-error';
import { errorHandler } from './error-handler';

function executar(erro: unknown) {
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) } as unknown as Response;
  errorHandler(erro, {} as Request, res, jest.fn() as NextFunction);
  return { status: (res.status as jest.Mock).mock.calls[0][0], corpo: json.mock.calls[0][0] };
}

describe('errorHandler', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-16-chars';
    resetEnvCache();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('mapeia AppError para seu statusCode', () => {
    const { status, corpo } = executar(new AppError(409, 'E-mail já cadastrado'));
    expect(status).toBe(409);
    expect(corpo.erro).toBe('E-mail já cadastrado');
  });

  it('mapeia ZodError para 400 com detalhes por campo', () => {
    const resultado = z.object({ email: z.string() }).safeParse({});
    const { status, corpo } = executar(resultado.error);
    expect(status).toBe(400);
    expect(corpo.detalhes[0].campo).toBe('email');
  });

  it('mapeia arquivo acima do limite do multer para 413', () => {
    const { status, corpo } = executar(new MulterError('LIMIT_FILE_SIZE'));
    expect(status).toBe(413);
    expect(corpo.erro).toMatch(/2 MB/);
  });

  it('mapeia outros erros do multer para 400', () => {
    expect(executar(new MulterError('LIMIT_UNEXPECTED_FILE')).status).toBe(400);
  });

  it('mapeia corpo JSON grande demais para 413', () => {
    expect(executar({ type: 'entity.too.large' }).status).toBe(413);
  });

  it('mapeia violação de unique do Prisma (P2002) para 409', () => {
    expect(executar({ code: 'P2002' }).status).toBe(409);
  });

  it('mapeia erros inesperados para 500 genérico', () => {
    const { status, corpo } = executar(new Error('boom'));
    expect(status).toBe(500);
    expect(corpo.erro).toBe('Erro interno do servidor');
  });

  it('não vaza stack trace em produção', () => {
    process.env.NODE_ENV = 'production';
    resetEnvCache();
    const { corpo } = executar(new Error('boom'));
    expect(corpo.detalhes).toBeUndefined();
    process.env.NODE_ENV = 'test';
  });
});
