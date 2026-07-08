import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async () => {
  const t = readFileSync(join(process.cwd(), 'lib/db/migrations/0063_producto_codigo_barras.sql'), 'utf-8');
  await sql.unsafe(t);
  console.log('✓ Migración 0063 aplicada.');
  await sql.end();
})();
