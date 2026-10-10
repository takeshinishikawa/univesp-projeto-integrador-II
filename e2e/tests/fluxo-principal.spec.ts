import { expect, test } from '@playwright/test';
import { registrar, usuarioNovo } from './suporte/usuario';

test.describe('Fluxo principal: cadastro, login, lançamento e Resumo', () => {
  test('cadastra, lança uma transação e vê o saldo refletido no Resumo', async ({ page }) => {
    const usuario = usuarioNovo('fluxo');
    await registrar(page, usuario);

    // A conta "principal" é criada automaticamente na primeira transação sem conta escolhida.
    await page.goto('/transacoes');
    await page.getByRole('button', { name: /nova transação/i }).click();

    await page.selectOption('#transacao-tipo', 'RECEITA');
    await page.selectOption('#transacao-categoria', { label: 'Salário' });
    await page.fill('#transacao-descricao', 'Salário de teste E2E');
    await page.fill('#transacao-valor', '5000');
    await page.getByRole('dialog').getByRole('button', { name: /^salvar$/i }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(
      page.getByRole('cell', { name: 'Salário de teste E2E', exact: true }),
    ).toBeVisible();

    await page.goto('/dashboard');
    const cardReceitas = page.locator('article', { hasText: 'Total de receitas' });
    await expect(cardReceitas).toBeVisible();
    await expect(cardReceitas.locator('.valor')).toHaveText(/R\$\s?5\.000,00/);
  });

  test('login com credenciais erradas mostra mensagem, sem redirecionar', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-email', 'alguem-que-nao-existe@example.com');
    await page.fill('#login-senha', 'qualquer-coisa');
    await page.getByRole('button', { name: /^entrar$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/credenciais inválidas/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('visitante é mandado para o login ao tentar abrir uma rota autenticada', async ({ page }) => {
    await page.goto('/transacoes');
    await expect(page).toHaveURL(/\/login/);
  });
});
