/**
 * Aplica lib/db/migrations/0053_metodos_obliga_dgii.sql
 * Uso: pnpm tsx scripts/apply-migration-0053.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const url = process.env.POSTGRES_URL;
if (!url) { console.error('POSTGRES_URL no definido'); process.exit(1); }

const sqlPath = path.join(process.cwd(), 'lib/db/migrations/0053_metodos_obliga_dgii.sql');
const sqlText = readFileSync(sqlPath, 'utf8');

const sql = postgres(url, { ssl: 'require', max: 1 });

(async () => {
  console.log('Aplicando 0053_metodos_obliga_dgii.sql ...');
  try {
    await sql.unsafe(sqlText);
    console.log('✓ Migración aplicada exitosamente.');
  } catch (e) {
    console.error('✗ Error:', e);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
