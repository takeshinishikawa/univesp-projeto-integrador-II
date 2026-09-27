import jwt, { SignOptions } from 'jsonwebtoken';
import { getEnv } from '../config/env';

export function assinarToken(usuarioId: number): string {
  const env = getEnv();
  return jwt.sign({}, env.JWT_SECRET, {
    subject: String(usuarioId),
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

// Lança erro do jsonwebtoken se o token for inválido ou expirado.
export function verificarToken(token: string): number {
  const payload = jwt.verify(token, getEnv().JWT_SECRET);
  const usuarioId = typeof payload === 'string' ? NaN : Number(payload.sub);
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    throw new Error('Token sem subject válido');
  }
  return usuarioId;
}
