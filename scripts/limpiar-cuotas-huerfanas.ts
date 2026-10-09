/**
 * Borra las cuotas que quedaron colgando en conceptos marcados "una sola vez".
 *
 * Son residuos de cuando el interruptor de recurrencia no limpiaba el
 * calendario al apagarse (arreglado en conceptos/[id]/route.ts). El motor de
 * cobro las seguía leyendo, así que un concepto sin recurrencia se cobraba en
 * la fecha del calendario viejo en vez del día de la matrícula.
 *
 * No toca las ya facturadas: esa cuota es la deuda que un padre ya tiene.
 *
 *   npx tsx --env-file=.env --env-file=.env.local scripts/limpiar-cuotas-huerfanas.ts [--borrar]
 */
import { db } from '../lib/db/drizzle';
import { sql } from 'drizzle-orm';

async function main() {
  const borrar = process.argv[2] === '--borrar';

  const r = await db.execute(sql`
    SELECT q.id, c.nombre, q.numero, q.fecha_emision,
           EXISTS (SELECT 1 FROM admin_escolar_cargos g WHERE g.cuota_id = q.id) AS facturada
    FROM admin_escolar_concepto_cuotas q
    JOIN admin_escolar_conceptos_pago c ON c.id = q.concepto_id
    WHERE c.frecuencia = 'unico'
    ORDER BY c.nombre`);
  const filas = r as unknown as Array<Record<string, unknown>>;

  console.log(borrar ? 'BORRANDO\n' : 'HUÉRFANAS ENCONTRADAS\n');
  for (const f of filas) {
    console.log(`  ${String(f.nombre).padEnd(20)} cuota ${f.numero} · emite ${f.fecha_emision}` +
                `${f.facturada ? '  ← YA FACTURADA, se conserva' : ''}`);
  }
  if (filas.length === 0) { console.log('  (ninguna)'); return; }

  if (!borrar) { console.log('\n(simulación — nada borrado)'); return; }

  const res = await db.execute(sql`
    DELETE FROM admin_escolar_concepto_cuotas q
    USING admin_escolar_conceptos_pago c
    WHERE c.id = q.concepto_id AND c.frecuencia = 'unico'
      AND NOT EXISTS (SELECT 1 FROM admin_escolar_cargos g WHERE g.cuota_id = q.id)`);
  console.log(`\n✓ borradas: ${(res as { rowCount?: number }).rowCount ?? '?'}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
