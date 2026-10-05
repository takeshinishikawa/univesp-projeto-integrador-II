import path from 'node:path';
import { expect, test } from '@playwright/test';
import { registrar, usuarioNovo } from './suporte/usuario';

// Arquivo real de teste já usado pelos testes de integração do backend.
const ARQUIVO_OFX = path.resolve(
  __dirname,
  '../../backend/tests/fixtures/extratos/NU_123456789_01ABR2026_30ABR2026.ofx',
);

test.describe('Importação de extrato OFX', () => {
  test('importa um extrato real, revisa e confirma', async ({ page }) => {
    const usuario = usuarioNovo('importacao');
    await registrar(page, usuario);

    await page.goto('/importar');
    await page.setInputFiles('#arquivo-ofx', ARQUIVO_OFX);

    await expect(page.getByRole('status')).toContainText(/lançamentos encontrados/i);

    const botaoImportar = page.getByRole('button', { name: /^importar \d+ transaç/i });
    await expect(botaoImportar).toBeEnabled();
    await botaoImportar.click();

    await expect(page.getByRole('heading', { name: /importação concluída/i })).toBeVisible();
    await expect(page.locator('p.aviso-sucesso')).toContainText(/transaç(ão|ões) importada/i);
  });

  test('arquivo sem extensão .ofx é recusado antes de chamar a API', async ({ page }) => {
    const usuario = usuarioNovo('importacao-invalida');
    await registrar(page, usuario);

    await page.goto('/importar');
    // Qualquer arquivo local serve: o nome/extensão é o que o front valida antes de enviar.
    await page.setInputFiles('#arquivo-ofx', path.resolve(__dirname, '../playwright.config.ts'));

    await expect(page.getByRole('alert')).toContainText(/\.ofx/i);
  });
});
