import { expect, Page, test } from '@playwright/test';
import { registrar, usuarioNovo } from './suporte/usuario';

/** Lança uma despesa pelo modal "Nova transação" e espera ela aparecer na tabela. */
async function lancarDespesa(page: Page, descricao: string, valor: string, categoria = 'Outros') {
  await page.getByRole('button', { name: /nova transação/i }).click();
  await page.click('label:has(#transacao-tipo-despesa)');
  await page.selectOption('#transacao-categoria', { label: categoria });
  await page.fill('#transacao-descricao', descricao);
  await page.fill('#transacao-valor', valor);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^salvar$/i })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('cell', { name: descricao, exact: true })).toBeVisible();
}

function linha(page: Page, descricao: string) {
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: descricao, exact: true }) });
}

test.describe('Transações: corrigir, editar e excluir', () => {
  test.beforeEach(async ({ page }) => {
    await registrar(page, usuarioNovo('transacoes'));
    await page.goto('/transacoes');
  });

  test('corrige a categoria e o valor de uma despesa, e o Resumo acompanha', async ({ page }) => {
    await lancarDespesa(page, 'Padaria E2E', '30');

    await page.getByRole('button', { name: 'Editar Padaria E2E' }).click();
    await page.selectOption('#transacao-categoria', { label: 'Alimentação' });
    await page.fill('#transacao-valor', '45.50');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^salvar$/i })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await expect(linha(page, 'Padaria E2E')).toContainText('Alimentação');
    await expect(linha(page, 'Padaria E2E')).toContainText(/R\$\s?45,50/);

    await page.goto('/dashboard');
    const cardDespesas = page.locator('article', { hasText: 'Total de despesas' });
    await expect(cardDespesas.locator('.valor')).toHaveText(/R\$\s?45,50/);
  });

  test('recategoriza várias despesas de uma vez pela seleção', async ({ page }) => {
    await lancarDespesa(page, 'Ônibus E2E', '5');
    await lancarDespesa(page, 'Metrô E2E', '6');

    await page.getByRole('checkbox', { name: 'Selecionar Ônibus E2E' }).check();
    await page.getByRole('checkbox', { name: 'Selecionar Metrô E2E' }).check();
    await expect(page.getByRole('heading', { name: /2 selecionadas/i })).toBeVisible();

    await page.selectOption('#massa-categoria', { label: 'Transporte' });
    await page.getByRole('button', { name: /^mover$/i }).click();

    await expect(linha(page, 'Ônibus E2E')).toContainText('Transporte');
    await expect(linha(page, 'Metrô E2E')).toContainText('Transporte');
  });

  test('exclui uma transação depois de confirmar', async ({ page }) => {
    await lancarDespesa(page, 'Lanche E2E', '12');
    await lancarDespesa(page, 'Cinema E2E', '40');

    await page.getByRole('button', { name: 'Excluir Lanche E2E' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText('Lanche E2E');
    await modal.getByRole('button', { name: /^excluir$/i }).click();

    await expect(modal).toBeHidden();
    await expect(page.getByRole('cell', { name: 'Lanche E2E', exact: true })).toHaveCount(0);
    await expect(page.getByRole('cell', { name: 'Cinema E2E', exact: true })).toBeVisible();
  });
});
