import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env.local' });
dotenv.config();

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });

(async () => {
  const migration = readFileSync(join(process.cwd(), 'lib/db/migrations/0076_administracion_escolar_periodos_unicos.sql'), 'utf-8');
  await sql.unsafe(migration);
  console.log('✓ Migración 0076 aplicada (períodos escolares únicos por team).');
  await sql.end();
})();
