import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  console.log(`→ Base: ${host}`);

  const t = readFileSync(join(process.cwd(), 'lib/db/migrations/0127_product_variants.sql'), 'utf-8');
  await sql.unsafe(t);
  console.log('✓ Migración 0127 ejecutada.');

  // Verificación real contra information_schema.
  const cols = await sql`
    SELECT table_name, column_name, data_type
      FROM information_schema.columns
     WHERE (table_name = 'products'            AND column_name = 'variant_atributos')
        OR (table_name = 'inventory_movements' AND column_name = 'variant_id')
        OR (table_name = 'product_variants')
     ORDER BY table_name, column_name`;
  console.table(cols);

  const idx = await sql`
    SELECT indexname FROM pg_indexes
     WHERE tablename = 'product_variants'`;
  console.log('Índices product_variants:', idx.map((r: any) => r.indexname));

  await sql.end();
})();
