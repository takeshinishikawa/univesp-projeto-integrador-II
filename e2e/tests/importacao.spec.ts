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

  test('vários arquivos com períodos sobrepostos não duplicam lançamentos', async ({ page }) => {
    const usuario = usuarioNovo('importacao-lote');
    await registrar(page, usuario);
    const pasta = path.dirname(ARQUIVO_OFX);

    await page.goto('/importar');
    // Abril sozinho e depois o extrato de janeiro a setembro, que contém abril de novo.
    await page.setInputFiles('#arquivo-ofx', [
      ARQUIVO_OFX,
      path.join(pasta, 'NU_123456789_01JAN2026_25SET2026.ofx'),
    ]);

    await expect(page.getByRole('status')).toContainText(/arquivo 1 de 2 lido/i);
    await page.getByRole('button', { name: /^importar \d+ transaç/i }).click();

    // O segundo só é lido depois do primeiro gravado: as linhas de abril já vêm como importadas.
    await expect(page.getByRole('status')).toContainText(/arquivo 2 de 2 lido/i);
    await expect(page.locator('tbody tr.linha-desabilitada').first()).toBeVisible();
    await expect(page.getByText('já importada').first()).toBeVisible();
    await page.getByRole('button', { name: /^importar \d+ transaç/i }).click();

    await expect(page.getByRole('heading', { name: /importação concluída/i })).toBeVisible();
    await expect(page.locator('p.aviso-sucesso')).toContainText(/de 2 arquivos/i);
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
