import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de ponta a ponta contra a stack completa (frontend + backend + MySQL).
 * Pressupõe que a stack já está no ar via Docker Compose:
 *   docker compose --env-file .env.local up --build -d --wait
 * (ver README.md desta pasta para detalhes).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
