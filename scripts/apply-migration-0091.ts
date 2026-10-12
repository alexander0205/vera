import postgres from 'postgres';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
dotenv.config({ path: '.env.local' }); dotenv.config();
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require', max: 1 });
(async()=>{await sql.unsafe(readFileSync(join(process.cwd(),'lib/db/migrations/0091_contabilidad_cuentas_por_pagar.sql'),'utf8'));console.log('✓ Migración 0091 aplicada (contabilidad: cuentas por pagar).');await sql.end();})().catch(async e=>{console.error(e);await sql.end();process.exit(1);});
