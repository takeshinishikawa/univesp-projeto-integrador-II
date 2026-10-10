import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter no mínimo 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  // Quantos proxies ficam na frente da API (Nginx = 1; no Railway, borda + Nginx = 2).
  // Sem isso, o limite de tentativas por IP veria todo mundo com o IP do proxy.
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
});

export type Env = z.infer<typeof envSchema>;

let cache: Env | undefined;

export function getEnv(): Env {
  if (!cache) {
    const resultado = envSchema.safeParse(process.env);
    if (!resultado.success) {
      const problemas = resultado.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Variáveis de ambiente inválidas: ${problemas}`);
    }
    cache = resultado.data;
  }
  return cache;
}

export function resetEnvCache(): void {
  cache = undefined;
}
