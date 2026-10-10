import { expect, test } from '@playwright/test';
import { registrar, usuarioNovo } from './suporte/usuario';

test.describe('Minha conta e navegação por teclado', () => {
  test('o link "Pular para o conteúdo" é o primeiro foco e leva ao conteúdo', async ({ page }) => {
    await registrar(page, usuarioNovo('teclado'));
    // Recarrega para começar do topo da página, como quem acabou de abrir o endereço.
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#conteudo')).toBeFocused();
  });

  test('excluir a conta apaga tudo e impede novo login (LGPD)', async ({ page }) => {
    const usuario = usuarioNovo('exclusao');
    await registrar(page, usuario);

    await page.getByRole('link', { name: /minha conta/i }).click();
    await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible();
    await page.getByLabel('Entendo que meus dados serão apagados para sempre.').check();
    await page.fill('#excluir-senha', usuario.senha);
    await page.getByRole('button', { name: 'Excluir minha conta' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('status')).toContainText(/foram excluídos/);

    await page.fill('#login-email', usuario.email);
    await page.fill('#login-senha', usuario.senha);
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await expect(page.getByRole('alert')).toContainText(/credenciais inválidas/i);
  });
});
