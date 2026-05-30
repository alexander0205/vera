/**
 * Aplica lib/db/migrations/0029_row_audit_log.sql a una o varias URLs.
 *
 * Uso:
 *   pnpm tsx scripts/apply-audit-migration.ts            # solo POSTGRES_URL
 *   pnpm tsx scripts/apply-audit-migration.ts --prod     # POSTGRES_URL + POSTGRES_URL_PROD
 *   pnpm tsx scripts/apply-audit-migration.ts --url=...  # URL específica
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);
const includeProd = args.includes('--prod');
const customUrl = args.find((a) => a.startsWith('--url='))?.slice('--url='.length);

const sqlPath = path.join(process.cwd(), 'lib/db/migrations/0029_row_audit_log.sql');
const sqlText = readFileSync(sqlPath, 'utf8');

const targets: { name: string; url: string }[] = [];

if (customUrl) {
  targets.push({ name: 'custom', url: customUrl });
} else {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL no está definido');
    process.exit(1);
  }
  targets.push({ name: 'POSTGRES_URL', url: process.env.POSTGRES_URL });

  if (includeProd) {
    if (!process.env.POSTGRES_URL_PROD) {
      console.error('--prod fue pasado pero POSTGRES_URL_PROD no está definido');
      process.exit(1);
    }
    targets.push({ name: 'POSTGRES_URL_PROD', url: process.env.POSTGRES_URL_PROD });
  }
}

async function applyTo(target: { name: string; url: string }) {
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(target.url);
  const sql = postgres(target.url, {
    max: 1,
    ssl: isLocal ? false : 'require',
  });

  console.log(`\n→ Aplicando a ${target.name}…`);
  try {
    await sql.unsafe(sqlText);
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
        FROM information_schema.triggers
       WHERE trigger_name = 'audit_trg'
    `;
    console.log(`  ✓ Migration aplicada. Triggers activos: ${count}`);
  } catch (err) {
    console.error(`  ✗ Error en ${target.name}:`, err);
    throw err;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

(async () => {
  for (const t of targets) {
    await applyTo(t);
  }
  console.log('\n✓ Listo.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
