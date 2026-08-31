import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  console.log(`→ Base: ${host}`);

  const t = readFileSync(join(process.cwd(), 'lib/db/migrations/0171_catalogo_compras.sql'), 'utf-8');
  await sql.unsafe(t);
  console.log('✓ Migración 0171 ejecutada.');

  const cols = await sql`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_name = 'catalogo_compras'
     ORDER BY column_name`;
  console.table(cols);

  const idx = await sql`
    SELECT indexname FROM pg_indexes
     WHERE tablename = 'catalogo_compras'`;
  console.log('Índices:', idx.map((r: any) => r.indexname));

  await sql.end();
})();
