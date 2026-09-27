import bcrypt from 'bcrypt';

const CUSTO_BCRYPT = 10;

export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export function compararSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}
