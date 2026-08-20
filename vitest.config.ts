import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests (vitest) viven en tests/unit/**. Los E2E de tests/*.test.ts son
// Playwright y se corren aparte (npm run test:e2e) — vitest no los toca.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` lanza nada más importarse fuera de un Server Component:
      // sin este stub no se puede probar ningún módulo que lo marque.
      'server-only': path.resolve(__dirname, 'tests/helpers/server-only-vacio.ts'),
    },
  },
});
