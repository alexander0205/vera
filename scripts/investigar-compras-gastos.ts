/**
 * scripts/investigar-compras-gastos.ts — SOLO LECTURA. Dimensiona las dos
 * fuentes de asientos del nivel 3.2 (compras y gastos de caja) para llevarle
 * números a Alex antes de decidir los 3 huecos.
 *
 *   npx tsx scripts/investigar-compras-gastos.ts
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

async function main() {
  // 1. Compras locales por team (+ cuántas traen referencia a e-NCF → el ITBIS
  //    existiría en el e-CF recibido externo, hoy no se guarda).
  const compras = (await db.execute(sql`
    SELECT team_id, COUNT(*) AS compras,
           SUM(monto_total) AS cents,
           COUNT(*) FILTER (WHERE referencia_encf IS NOT NULL AND referencia_encf <> '') AS con_encf
    FROM compras_locales
    GROUP BY team_id ORDER BY compras DESC
  `)) as unknown as Array<{ team_id: number; compras: string; cents: string; con_encf: string }>;

  console.log('\n=== Compras locales (entradas de inventario) por team ===');
  if (compras.length === 0) console.log('  (ninguna)');
  for (const c of compras) {
    console.log(`  team ${String(c.team_id).padStart(3)} · ${String(c.compras).padStart(4)} compras · RD$${(Number(c.cents) / 100).toFixed(2)} · con e-NCF: ${c.con_encf}`);
  }

  // 2. Movimientos de caja tipo GASTO por team (hueco 3: sin categoría).
  const gastos = (await db.execute(sql`
    SELECT team_id, COUNT(*) AS gastos, SUM(monto_centavos) AS cents,
           COUNT(DISTINCT metodo) AS metodos
    FROM caja_movimientos
    WHERE tipo = 'GASTO'
    GROUP BY team_id ORDER BY gastos DESC
  `)) as unknown as Array<{ team_id: number; gastos: string; cents: string; metodos: string }>;

  console.log('\n=== Movimientos de caja tipo GASTO por team ===');
  if (gastos.length === 0) console.log('  (ninguno)');
  for (const g of gastos) {
    console.log(`  team ${String(g.team_id).padStart(3)} · ${String(g.gastos).padStart(4)} gastos · RD$${(Number(g.cents) / 100).toFixed(2)} · métodos distintos: ${g.metodos}`);
  }

  // 3. Muestra de descripciones de gasto (para ver si hay señal de categoría).
  const muestra = (await db.execute(sql`
    SELECT descripcion, COUNT(*) AS veces
    FROM caja_movimientos WHERE tipo = 'GASTO' AND descripcion IS NOT NULL
    GROUP BY descripcion ORDER BY veces DESC LIMIT 15
  `)) as unknown as Array<{ descripcion: string; veces: string }>;

  console.log('\n=== Descripciones de gasto más comunes (¿hay categoría implícita?) ===');
  if (muestra.length === 0) console.log('  (ninguna)');
  for (const m of muestra) {
    console.log(`  ${String(m.veces).padStart(3)}× · ${m.descripcion?.slice(0, 60)}`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
