import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // tests/unit/** no son Playwright: vitest + node:test (`npm run test:unit`)
  testIgnore: ['**/unit/**'],
  timeout: 30000,
  retries: 0,
  workers: 1, // Secuencial para no interferir entre tests
  reporter: 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // El servidor ya está corriendo (pnpm dev)
  // webServer: no lo necesitamos porque lo levantamos manualmente
});
