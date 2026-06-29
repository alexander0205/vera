import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' });
dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async () => {
  const sqlText = readFileSync(join(process.cwd(), 'lib/db/migrations/0053_pos_monedero_escolar.sql'), 'utf-8');
  await sql.unsafe(sqlText);
  console.log('✓ Migración 0053 aplicada.');
  await sql.end();
})();
