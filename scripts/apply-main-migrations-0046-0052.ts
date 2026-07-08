/**
 * Aplica las 7 migraciones de `main` (0046-0052) que faltan en las DBs de
 * inventario y cafetería tras el merge. Estas migraciones entraron por drizzle
 * en main y NO tienen apply-script individual.
 *
 * Todas son idempotentes (IF NOT EXISTS / NOT EXISTS) → seguro re-correr.
 * Orden importa: 0051 crea team_roles, 0052 inserta permiso sobre esa tabla.
 *
 * Apunta a la DB del POSTGRES_URL de .env.local (la rama Neon activa).
 *   inventario:  git checkout feature/inventario-control-stock + (URL inventario)
 *   cafetería:   git checkout feature/pos-cafeteria            + (URL cafetería)
 *
 * Uso: pnpm tsx scripts/apply-main-migrations-0046-0052.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const url = process.env.POSTGRES_URL;
if (!url) { console.error('✗ POSTGRES_URL no definido'); process.exit(1); }

const MIGRACIONES = [
  '0046_notas_origen_auditoria',
  '0047_producto_es_mora',
  '0048_nc_credito_cliente',
  '0049_pago_nota_credito',
  '0050_nc_uso_parcial',
  '0051_team_roles',
  '0052_pagos_permiso',
];

const sql = postgres(url, { ssl: 'require', max: 1 });

(async () => {
  // Pista de a qué DB apunta (host), sin exponer credenciales.
  const host = (() => { try { return new URL(url).host; } catch { return '???'; } })();
  console.log(`▶ Aplicando ${MIGRACIONES.length} migraciones de main a: ${host}\n`);

  for (const nombre of MIGRACIONES) {
    const archivo = path.join(process.cwd(), 'lib/db/migrations', `${nombre}.sql`);
    process.stdout.write(`  • ${nombre} ... `);
    try {
      const texto = readFileSync(archivo, 'utf8');
      await sql.unsafe(texto);
      console.log('✓');
    } catch (e) {
      console.log('✗');
      console.error(`\n    Error en ${nombre}:`, e);
      await sql.end();
      process.exit(1);
    }
  }

  console.log('\n✓ Todas las migraciones de main aplicadas.');
  await sql.end();
})();
