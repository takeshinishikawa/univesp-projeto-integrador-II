import { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { getEnv } from '../config/env';
import { AppError } from '../utils/app-error';

const QUINZE_MINUTOS = 15 * 60 * 1000;
const UMA_HORA = 60 * 60 * 1000;

interface OpcoesLimite {
  janelaMs: number;
  maximo: number;
  mensagem: string;
  /** Conta só as respostas de erro (ex.: senha errada), para não travar quem acerta. */
  soFalhas?: boolean;
}

/** Limita requisições por IP; acima do limite responde 429 no formato de erro da API. */
export function criarLimite({
  janelaMs,
  maximo,
  mensagem,
  soFalhas = false,
}: OpcoesLimite): RequestHandler {
  return rateLimit({
    windowMs: janelaMs,
    limit: maximo,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: soFalhas,
    handler: (_req, _res, next) => next(new AppError(429, mensagem)),
  });
}

// Os testes de integração fazem muitos cadastros e logins seguidos: lá o limite fica desligado.
function foraDosTestes(limite: RequestHandler): RequestHandler {
  return (req, res, next) => (getEnv().NODE_ENV === 'test' ? next() : limite(req, res, next));
}

// Conta só tentativas que falharam: várias pessoas na mesma rede (ex.: sessão de teste) não se bloqueiam.
export const limiteLogin = foraDosTestes(
  criarLimite({
    janelaMs: QUINZE_MINUTOS,
    maximo: 20,
    soFalhas: true,
    mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.',
  }),
);

export const limiteCadastro = foraDosTestes(
  criarLimite({
    janelaMs: UMA_HORA,
    // Folga para a suíte E2E do CI, que cria um usuário por teste a partir do mesmo IP.
    maximo: 60,
    mensagem: 'Muitos cadastros a partir desta rede. Tente de novo mais tarde.',
  }),
);
