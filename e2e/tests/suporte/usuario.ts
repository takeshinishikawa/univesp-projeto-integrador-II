import { expect, Page } from '@playwright/test';

export interface UsuarioTeste {
  nome: string;
  email: string;
  senha: string;
}

/** Dados de um usuário novo e único, para não colidir entre execuções/retries/testes paralelos. */
export function usuarioNovo(prefixo = 'e2e'): UsuarioTeste {
  const unico = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return {
    nome: 'Usuária de Teste',
    email: `${prefixo}-${unico}@example.com`,
    senha: 'senha-de-teste-123',
  };
}

/** Cria a conta pela UI (/registro); a própria tela já autentica e redireciona pro /dashboard. */
export async function registrar(page: Page, usuario: UsuarioTeste): Promise<void> {
  await page.goto('/registro');
  await page.fill('#registro-nome', usuario.nome);
  await page.fill('#registro-email', usuario.email);
  await page.fill('#registro-senha', usuario.senha);
  await page.getByRole('button', { name: /criar conta/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
