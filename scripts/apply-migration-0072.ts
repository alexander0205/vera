import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async () => {
  const t = readFileSync(join(process.cwd(), 'lib/db/migrations/0072_administracion_escolar_integracion_facturas.sql'), 'utf-8');
  await sql.unsafe(t);
  console.log('✓ Migración 0072 aplicada (integración escolar ↔ facturas: product_id + ecf_document_id).');
  await sql.end();
})();
