/**
 * Borra la demo del Nivel 4 del team 9 (la que siembra seed-demo-nivel4.ts) y
 * todo lo que colgó de ella: asientos + líneas de compras/pagos/depreciación,
 * pagos a proveedor, compras marcadas DEMO-N4 y los tres activos de demo.
 * Deja el team 9 en su baseline (743 asientos). Orden FK-seguro.
 *
 *   npx tsx scripts/limpiar-demo-nivel4.ts
 */
import 'dotenv/config';
import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';

const TEAM = 9;
const MARCA = 'DEMO-N4';
const NOMBRES_ACTIVOS = ['Edificio principal', 'Autobús escolar', 'Mobiliario de aulas'];

async function borrarAsientos(where: ReturnType<typeof sql>) {
  const ids = (await db.execute(sql`SELECT id FROM contabilidad_asientos WHERE team_id = ${TEAM} AND ${where}`)) as unknown as { id: number }[];
  if (!ids.length) return 0;
  const idList = sql.join(ids.map((r) => sql`${r.id}`), sql`, `);
  await db.execute(sql`UPDATE contabilidad_depreciaciones SET asiento_id = NULL WHERE asiento_id IN (${idList})`);
  await db.execute(sql`DELETE FROM contabilidad_asiento_lineas WHERE asiento_id IN (${idList})`);
  await db.execute(sql`DELETE FROM contabilidad_asientos WHERE id IN (${idList})`);
  return ids.length;
}

(async () => {
  // Compras demo (por marca) y sus pagos.
  const compras = (await db.execute(sql`SELECT id FROM compras_locales WHERE team_id = ${TEAM} AND notas = ${MARCA}`)) as unknown as { id: number }[];
  const compraIds = compras.map((c) => c.id);

  let asientos = 0;
  if (compraIds.length) {
    const idList = sql.join(compraIds.map((id) => sql`${id}`), sql`, `);
    // asientos de compra y de pago_proveedor de esas compras
    const pagos = (await db.execute(sql`SELECT id FROM pagos_proveedores WHERE team_id = ${TEAM} AND compra_id IN (${idList})`)) as unknown as { id: number }[];
    if (pagos.length) {
      const pagoList = sql.join(pagos.map((p) => sql`${p.id}`), sql`, `);
      asientos += await borrarAsientos(sql`origen_tipo = 'pago_proveedor' AND origen_id IN (${pagoList})`);
      await db.execute(sql`DELETE FROM pagos_proveedores WHERE team_id = ${TEAM} AND compra_id IN (${idList})`);
    }
    asientos += await borrarAsientos(sql`origen_tipo = 'compra' AND origen_id IN (${idList})`);
    await db.execute(sql`DELETE FROM compras_locales_items WHERE compra_id IN (${idList})`);
    await db.execute(sql`DELETE FROM compras_locales WHERE id IN (${idList})`);
  }

  // Activos demo, sus depreciaciones y asientos.
  const activos = (await db.execute(sql`SELECT id FROM contabilidad_activos_fijos WHERE team_id = ${TEAM} AND nombre = ANY(${NOMBRES_ACTIVOS})`)) as unknown as { id: number }[];
  for (const a of activos) {
    const deps = (await db.execute(sql`SELECT asiento_id FROM contabilidad_depreciaciones WHERE activo_id = ${a.id} AND asiento_id IS NOT NULL`)) as unknown as { asiento_id: number }[];
    if (deps.length) {
      const dList = sql.join(deps.map((d) => sql`${d.asiento_id}`), sql`, `);
      asientos += await borrarAsientos(sql`id IN (${dList})`);
    }
    await db.execute(sql`DELETE FROM contabilidad_depreciaciones WHERE activo_id = ${a.id}`);
    await db.execute(sql`DELETE FROM contabilidad_activos_fijos WHERE id = ${a.id}`);
  }

  const [{ n }] = (await db.execute(sql`SELECT count(*)::int n FROM contabilidad_asientos WHERE team_id = ${TEAM}`)) as unknown as { n: number }[];
  console.log(`Demo borrada: ${compraIds.length} compras, ${activos.length} activos, ${asientos} asientos. Team 9 queda con ${n} asientos.`);

  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
