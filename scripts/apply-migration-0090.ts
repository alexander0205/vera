/** Aplica Nivel 4.3 (ITBIS de compras por régimen) a la DB de .env.local. */
import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env.local' });
dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });

(async () => {
  const migration = readFileSync(
    join(process.cwd(), 'lib/db/migrations/0090_contabilidad_itbis_compras.sql'),
    'utf-8',
  );
  await sql.unsafe(migration);
  console.log('✓ Migración 0090 aplicada (contabilidad: ITBIS de compras por régimen).');
  await sql.end();
})().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
