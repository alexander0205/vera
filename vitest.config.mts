import { defineConfig } from 'vitest/config';

// Solo pruebas unitarias de lógica pura (sin DB ni red). Next no interviene:
// los módulos bajo prueba no importan nada del framework.
// Extensión .mts para que se cargue como ESM sin marcar todo el paquete.
export default defineConfig({
  resolve: {
    // Resuelve el alias '@/…' del tsconfig sin plugins extra.
    tsconfigPaths: true,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Corre antes que cualquier prueba: impide que `.env` (producción) se cuele
    // por el `dotenv.config()` de drizzle. Ver el archivo para la historia.
    setupFiles: ['./tests/setup-sin-produccion.ts'],
  },
});
