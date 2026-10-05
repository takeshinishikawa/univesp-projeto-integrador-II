import { expect, test } from '@playwright/test';
import { registrar, usuarioNovo } from './suporte/usuario';

test.describe('Metas por categoria e Objetivos', () => {
  test('define uma meta por categoria e ela aparece salva', async ({ page }) => {
    const usuario = usuarioNovo('metas');
    await registrar(page, usuario);

    await page.goto('/metas');
    const campo = page.getByLabel('Meta de Alimentação', { exact: true });
    await campo.fill('800');
    await page.getByRole('button', { name: 'Salvar meta de Alimentação', exact: true }).click();

    await expect(campo).toHaveValue(/800/);
  });

  test('cria um objetivo e registra um aporte', async ({ page }) => {
    const usuario = usuarioNovo('objetivo');
    await registrar(page, usuario);

    const hoje = new Date();
    const proximoAno = hoje.getFullYear() + 1;

    await page.goto('/objetivos');
    await page.fill('#objetivo-nome', 'Viagem de teste E2E');
    await page.fill('#objetivo-valor', '3000');
    await page.selectOption('#objetivo-ano', String(proximoAno));
    await page.getByRole('button', { name: /^criar objetivo$/i }).click();

    const cartao = page.locator('li.objetivo', { hasText: 'Viagem de teste E2E' });
    await expect(cartao).toBeVisible();

    await cartao.getByRole('button', { name: /^guardar em viagem de teste e2e$/i }).click();
    await page.fill('#aporte-valor', '500');
    await page.getByRole('dialog').getByRole('button', { name: /^guardar$/i }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(cartao).toContainText(/R\$\s?500,00 de R\$\s?3\.000,00/);
  });
});
