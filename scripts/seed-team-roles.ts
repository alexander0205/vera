/**
 * Siembra los roles de sistema (owner/admin/user/lector) + permisos default
 * para TODOS los teams existentes. Idempotente — se puede correr varias veces.
 *
 * Uso (con POSTGRES_URL del branch deseado en el entorno):
 *   npx tsx scripts/seed-team-roles.ts
 */

import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { seedSystemRoles } from '@/lib/auth/permissions';

async function main() {
  const rows = await db.select({ id: teams.id, name: teams.name }).from(teams);
  console.log(`Sembrando roles para ${rows.length} teams...`);
  for (const t of rows) {
    await seedSystemRoles(t.id);
    console.log(`  ✓ team ${t.id} — ${t.name ?? '(sin nombre)'}`);
  }
  console.log('Listo.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
