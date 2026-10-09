/**
 * sync-test-db-columns.ts — SOLO PARA LA DB LOCAL DE TESTS.
 *
 * Las migraciones numeradas están incompletas respecto a lib/db/schema.ts
 * (columnas añadidas al schema sin migración, p.ej. ecf_documents.tipo_ingreso).
 * Este script compara cada pgTable del schema contra information_schema y
 * agrega las columnas faltantes con ADD COLUMN IF NOT EXISTS (+ default
 * primitivo cuando existe). No borra ni altera nada existente.
 *
 * Uso: POSTGRES_URL=postgres://... npx tsx scripts/sync-test-db-columns.ts
 */

import postgres from 'postgres';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@/lib/db/schema';

const sql = postgres(process.env.POSTGRES_URL!);

function isPgTable(v: unknown): v is PgTable {
  return !!v && typeof v === 'object' && Symbol.for('drizzle:IsDrizzleTable') in (v as object);
}

async function main() {
  let added = 0;
  for (const [, table] of Object.entries(schema)) {
    if (!isPgTable(table)) continue;
    const cfg = getTableConfig(table);
    const existing = new Set(
      (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${cfg.name}`)
        .map(r => r.column_name as string),
    );
    if (existing.size === 0) { console.log(`⚠ tabla ${cfg.name} no existe — omitida`); continue; }

    for (const col of cfg.columns) {
      if (existing.has(col.name)) continue;
      const type = col.getSQLType();
      let ddl = `ALTER TABLE "${cfg.name}" ADD COLUMN IF NOT EXISTS "${col.name}" ${type}`;
      const def = (col as { default?: unknown }).default;
      if (def !== undefined && (typeof def === 'string' || typeof def === 'number' || typeof def === 'boolean' || typeof def === 'bigint')) {
        ddl += typeof def === 'string' ? ` DEFAULT '${def.replace(/'/g, "''")}'` : ` DEFAULT ${def}`;
      } else if (def !== undefined && Array.isArray(def)) {
        ddl += ` DEFAULT '${JSON.stringify(def)}'::jsonb`;
      }
      // NOT NULL solo si hay default (no romper filas existentes)
      if (col.notNull && ddl.includes('DEFAULT')) ddl += ' NOT NULL';
      await sql.unsafe(ddl);
      console.log(`+ ${cfg.name}.${col.name} (${type})`);
      added++;
    }
  }
  console.log(`\n✅ ${added} columnas agregadas`);
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
