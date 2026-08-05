import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async () => {
  const host = new URL(process.env.POSTGRES_URL!).host;
  console.log(`→ Base: ${host}`);

  const t = readFileSync(join(process.cwd(), 'lib/db/migrations/0078_mora_monto_y_periodica.sql'), 'utf-8');
  await sql.unsafe(t);
  console.log('✓ Migración 0078 ejecutada.');

  // Verificación real contra information_schema (el workflow Neon miente).
  const cols = await sql`
    SELECT table_name, column_name, data_type
      FROM information_schema.columns
     WHERE (table_name = 'teams' AND column_name LIKE 'recargo_mora_%')
        OR (table_name = 'ecf_documents' AND column_name IN ('mora_modo','mora_monto_cents','mora_periodo'))
        OR (table_name = 'facturas_recurrentes' AND column_name IN ('mora_modo','mora_monto_cents'))
     ORDER BY table_name, column_name`;
  console.table(cols);

  const idx = await sql`
    SELECT indexname FROM pg_indexes
     WHERE tablename = 'ecf_documents'
       AND indexname IN ('ecf_documents_mora_periodo_unico_idx','ecf_documents_mora_activa_unica_idx')`;
  console.log('Índices de mora:', idx.map((r: any) => r.indexname));

  await sql.end();
})();
