import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { AppError } from '../utils/app-error';
import { criarLimite } from './rate-limit';

// App mínimo: a rota responde 401 quando a "senha" é errada, como o login.
function montar(soFalhas: boolean) {
  const app = express();
  app.use(express.json());
  app.post(
    '/login',
    criarLimite({ janelaMs: 60_000, maximo: 2, mensagem: 'Calma aí', soFalhas }),
    (req: Request, res: Response, next: NextFunction) =>
      req.body.senha === 'certa' ? res.status(200).end() : next(new AppError(401, 'Erro')),
  );
  app.use((erro: AppError, _req: Request, res: Response, _next: NextFunction) => {
    res.status(erro.statusCode).json({ erro: erro.message });
  });
  return app;
}

describe('criarLimite', () => {
  it('bloqueia com 429 depois do máximo de requisições', async () => {
    const app = montar(false);
    await request(app).post('/login').send({ senha: 'certa' }).expect(200);
    await request(app).post('/login').send({ senha: 'certa' }).expect(200);
    const resposta = await request(app).post('/login').send({ senha: 'certa' }).expect(429);
    expect(resposta.body.erro).toBe('Calma aí');
  });

  it('com soFalhas, só as tentativas com erro contam', async () => {
    const app = montar(true);
    for (let i = 0; i < 5; i++) {
      await request(app).post('/login').send({ senha: 'certa' }).expect(200);
    }
    await request(app).post('/login').send({ senha: 'errada' }).expect(401);
    await request(app).post('/login').send({ senha: 'errada' }).expect(401);
    await request(app).post('/login').send({ senha: 'errada' }).expect(429);
  });
});
