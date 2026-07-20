import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // tests/unit/ son unitarios de node:test (sin browser ni server) — se
  // corren con `npm run test:unit`, no con Playwright.
  testIgnore: '**/unit/**',
  timeout: 30000,
  retries: 0,
  workers: 1, // Secuencial para no interferir entre tests
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3000',
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
