import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/**
 * Regressão visual: compara prints de 4 telas com as imagens de referência em visual/referencias/.
 * Fica fora da suíte principal e roda sempre na imagem oficial do Playwright (no CI e na máquina
 * de quem desenvolve), porque fontes e renderização mudam de um sistema para outro:
 *
 *   docker run --rm --network host -v "${PWD}:/e2e" -w /e2e mcr.microsoft.com/playwright:v1.63.0-noble \
 *     npx playwright test -c playwright.visual.config.ts            (comparar)
 *   ... o mesmo comando com --update-snapshots                     (aceitar a mudança de layout)
 */
export default defineConfig({
  ...base,
  testDir: './visual',
  retries: 0,
  snapshotPathTemplate: '{testDir}/referencias/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        // O app desliga a animação dos gráficos com movimento reduzido: o print sai com eles prontos.
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
  ],
});
