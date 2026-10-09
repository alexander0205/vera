/**
 * scripts/verificar-compras-gastos-asientos.ts — Verifica los asientos del nivel
 * 3.2 con datos SINTÉTICOS (creados y borrados), porque la DB launch casi no
 * tiene compras ni gastos de caja reales.
 *
 * Requiere la migración 0088 aplicada (columnas nuevas en contabilidad_config).
 *
 *   npx tsx scripts/verificar-compras-gastos-asientos.ts [teamId]   (default 9)
 *
 * Crea una compra local y un gasto de caja, los asienta, verifica el cuadre y
 * las cuentas, y borra todo en orden inverso.
 */

import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { generarAsientoCompra, generarAsientoGastoCaja } from '@/lib/contabilidad/asientos';

const teamId = Number(process.argv[2] ?? 9);

async function lineas(asientoId: number) {
  return (await db.execute(sql`
    SELECT c.codigo, c.nombre, l.debe_cents AS debe, l.haber_cents AS haber
    FROM contabilidad_asiento_lineas l
    JOIN contabilidad_cuentas c ON c.id = l.cuenta_id
    WHERE l.asiento_id = ${asientoId}
    ORDER BY l.debe_cents DESC
  `)) as unknown as Array<{ codigo: string; nombre: string; debe: number; haber: number }>;
}

function imprimir(titulo: string, ls: Array<{ codigo: string; nombre: string; debe: number; haber: number }>) {
  const debe = ls.reduce((s, l) => s + Number(l.debe), 0);
  const haber = ls.reduce((s, l) => s + Number(l.haber), 0);
  console.log(`\n${titulo}`);
  for (const l of ls) {
    console.log(`  ${l.codigo} ${l.nombre.padEnd(24)} Debe ${(Number(l.debe) / 100).toFixed(2).padStart(10)}  Haber ${(Number(l.haber) / 100).toFixed(2).padStart(10)}`);
  }
  console.log(`  → debe=${(debe / 100).toFixed(2)} haber=${(haber / 100).toFixed(2)} ${debe === haber ? '✓ CUADRA' : '✗ DESCUADRE'}`);
}

async function main() {
  const [u] = (await db.execute(sql`
    SELECT user_id AS id FROM team_members WHERE team_id = ${teamId} ORDER BY user_id LIMIT 1
  `)) as unknown as Array<{ id: number }>;
  if (!u) { console.log(`Team ${teamId} sin miembros`); process.exit(1); }

  const ids: { compra?: number; turno?: number; gasto?: number; asCompra?: number; asGasto?: number } = {};

  try {
    // ── Compra local sintética: RD$1,180 ──────────────────────────────────
    const [compra] = (await db.execute(sql`
      INSERT INTO compras_locales (team_id, proveedor_nombre, fecha, monto_total, created_by)
      VALUES (${teamId}, 'PROVEEDOR DEMO 3.2', current_date, 118000, ${u.id})
      RETURNING id
    `)) as unknown as Array<{ id: number }>;
    ids.compra = compra.id;

    const rc = await generarAsientoCompra(teamId, compra.id);
    console.log(`\nCompra #${compra.id}: ${rc.creado ? `asiento #${rc.asientoId}` : `SALTADA (${rc.motivo})`}`);
    if (rc.creado && rc.asientoId) { ids.asCompra = rc.asientoId; imprimir('Asiento de compra:', await lineas(rc.asientoId)); }

    // ── Gasto de caja sintético: RD$500 ───────────────────────────────────
    const [turno] = (await db.execute(sql`
      INSERT INTO caja_turnos (team_id, usuario_id, estado, monto_apertura_centavos, apertura_por)
      VALUES (${teamId}, ${u.id}, 'CERRADO', 0, ${u.id})
      RETURNING id
    `)) as unknown as Array<{ id: number }>;
    ids.turno = turno.id;

    const [gasto] = (await db.execute(sql`
      INSERT INTO caja_movimientos (team_id, turno_id, tipo, monto_centavos, metodo, descripcion, created_by)
      VALUES (${teamId}, ${turno.id}, 'GASTO', 50000, 'efectivo', 'Compra de agua (demo 3.2)', ${u.id})
      RETURNING id
    `)) as unknown as Array<{ id: number }>;
    ids.gasto = gasto.id;

    const rg = await generarAsientoGastoCaja(teamId, gasto.id);
    console.log(`\nGasto de caja #${gasto.id}: ${rg.creado ? `asiento #${rg.asientoId}` : `SALTADO (${rg.motivo})`}`);
    if (rg.creado && rg.asientoId) { ids.asGasto = rg.asientoId; imprimir('Asiento de gasto de caja:', await lineas(rg.asientoId)); }

    // ── Idempotencia: segundo intento no duplica ──────────────────────────
    const rc2 = await generarAsientoCompra(teamId, compra.id);
    const rg2 = await generarAsientoGastoCaja(teamId, gasto.id);
    console.log(`\nIdempotencia: compra→${rc2.motivo ?? 'creó?!'} · gasto→${rg2.motivo ?? 'creó?!'} (esperado: ya-tiene-asiento ambos)`);
  } finally {
    // Limpieza en orden inverso (respetando FKs). Las líneas no cascadean.
    for (const aid of [ids.asCompra, ids.asGasto]) {
      if (!aid) continue;
      await db.execute(sql`DELETE FROM contabilidad_asiento_lineas WHERE asiento_id = ${aid}`);
      await db.execute(sql`DELETE FROM contabilidad_asientos WHERE id = ${aid}`);
    }
    if (ids.gasto)    await db.execute(sql`DELETE FROM caja_movimientos WHERE id = ${ids.gasto}`);
    if (ids.turno)    await db.execute(sql`DELETE FROM caja_turnos WHERE id = ${ids.turno}`);
    if (ids.compra)   await db.execute(sql`DELETE FROM compras_locales WHERE id = ${ids.compra}`);
    console.log('\nLimpieza: datos sintéticos borrados.');
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
