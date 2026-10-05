import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { registrar, usuarioNovo } from './suporte/usuario';

/**
 * Varredura de acessibilidade (axe-core) nas páginas principais, já autenticado e com layout real
 * de navegador — complementa os testes de componente em jsdom do frontend (ver
 * frontend/src/app/testing/a11y.ts), que não enxergam contraste computado nem viewport real.
 * Falha só em violações de impacto "serious" ou "critical"; "moderate"/"minor" ficam registradas
 * no relatório do Playwright para inspeção manual, sem quebrar o build.
 */
const PAGINAS = [
  { rota: '/dashboard', nome: 'Resumo' },
  { rota: '/transacoes', nome: 'Transações' },
  { rota: '/importar', nome: 'Importação' },
  { rota: '/metas', nome: 'Metas' },
  { rota: '/objetivos', nome: 'Objetivos' },
  { rota: '/contas', nome: 'Contas' },
  { rota: '/categorias', nome: 'Categorias' },
  { rota: '/recorrentes', nome: 'Recorrentes' },
];

test.describe('Acessibilidade (axe-core) das páginas autenticadas', () => {
  test.beforeEach(async ({ page }) => {
    await registrar(page, usuarioNovo('a11y'));
  });

  for (const { rota, nome } of PAGINAS) {
    test(`${nome} (${rota}) sem violações sérias/críticas`, async ({ page }) => {
      await page.goto(rota);
      await page.waitForLoadState('networkidle');

      const resultado = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      const graves = resultado.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      const relatorio = graves
        .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} elemento(s))`)
        .join('\n');

      expect(relatorio, `Violações graves em ${nome}:\n${relatorio}`).toBe('');
    });
  }

  test('Login (visitante, sem autenticar) sem violações sérias/críticas', async ({ page }) => {
    await page.goto('/login');
    const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const graves = resultado.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(graves).toEqual([]);
  });
});
