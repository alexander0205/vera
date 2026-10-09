import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  console.log(`→ Base: ${host}`);

  const t = readFileSync(join(process.cwd(), 'lib/db/migrations/0128_product_variant_almacen_stock.sql'), 'utf-8');
  await sql.unsafe(t);
  console.log('✓ Migración 0128 ejecutada.');

  const cols = await sql`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_name = 'product_variant_almacen_stock'
     ORDER BY column_name`;
  console.table(cols);

  const idx = await sql`
    SELECT indexname FROM pg_indexes
     WHERE tablename = 'product_variant_almacen_stock'`;
  console.log('Índices:', idx.map((r: any) => r.indexname));

  await sql.end();
})();
