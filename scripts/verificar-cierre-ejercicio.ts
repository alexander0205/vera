/**
 * Verificación sintética del cierre de ejercicio en el team 9.
 * Usa un año aislado (anterior a todo dato del team) para no tocar la demo:
 * siembra un ingreso y un gasto, cierra, comprueba el asiento y que el estado de
 * resultados sigue mostrando el resultado (excluye el cierre), prueba idempotencia
 * y reabrir, y limpia todo. Deja el team 9 exactamente como estaba.
 */
import 'dotenv/config';
import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { previsualizarCierre, cerrarEjercicio, reabrirEjercicio, listarCierres } from '@/lib/contabilidad/cierre';
import { estadoResultados } from '@/lib/contabilidad/estado-resultados';
import { balanceComprobacion } from '@/lib/contabilidad/reportes';
import { aniosConActividad } from '@/lib/contabilidad/cierre';

const TEAM = 9;
const OID_ING = 990001, OID_GTO = 990002;   // origen_id sintéticos, altos, únicos

async function cuenta(codigo: string): Promise<number> {
  const r = await db.execute(sql`SELECT id FROM contabilidad_cuentas WHERE team_id=${TEAM} AND codigo=${codigo} AND imputable AND activa LIMIT 1`);
  return (r as unknown as { id: number }[])[0].id;
}

async function insertarManual(oid: number, fecha: string, concepto: string, lineas: { cuentaId: number; debe: number; haber: number }[]) {
  const total = lineas.reduce((s, l) => s + l.debe, 0);
  const a = await db.execute(sql`
    INSERT INTO contabilidad_asientos (team_id, fecha, concepto, origen_tipo, origen_id, total_cents, created_by)
    VALUES (${TEAM}, ${fecha}, ${concepto}, 'manual', ${oid}, ${total}, 4)
    ON CONFLICT (team_id, origen_tipo, origen_id) DO NOTHING RETURNING id`);
  const id = (a as unknown as { id: number }[])[0]?.id;
  if (!id) return;
  let orden = 0;
  for (const l of lineas) {
    await db.execute(sql`INSERT INTO contabilidad_asiento_lineas (asiento_id, team_id, cuenta_id, debe_cents, haber_cents, descripcion, orden)
      VALUES (${id}, ${TEAM}, ${l.cuentaId}, ${l.debe}, ${l.haber}, 'test cierre', ${orden++})`);
  }
}

(async () => {
  const anios = await aniosConActividad(TEAM);
  const testYear = (anios.length ? Math.min(...anios) : new Date().getFullYear()) - 1;
  console.log(`Año de prueba aislado: ${testYear} (min con actividad: ${anios[anios.length - 1] ?? '—'})`);

  const c1101 = await cuenta('1101'), c4101 = await cuenta('4101'), c6101 = await cuenta('6101'), c3102 = await cuenta('3102');

  // Ingreso RD$100 (Debe 1101 / Haber 4101) y gasto RD$30 (Debe 6101 / Haber 1101).
  await insertarManual(OID_ING, `${testYear}-03-10`, 'Venta de prueba', [{ cuentaId: c1101, debe: 10000, haber: 0 }, { cuentaId: c4101, debe: 0, haber: 10000 }]);
  await insertarManual(OID_GTO, `${testYear}-06-15`, 'Gasto de prueba', [{ cuentaId: c6101, debe: 3000, haber: 0 }, { cuentaId: c1101, debe: 0, haber: 3000 }]);
  console.log('Sembrado: ingreso RD$100 + gasto RD$30 → utilidad esperada RD$70.');

  // 1. Preview.
  const prev = await previsualizarCierre(TEAM, testYear);
  console.log(`\nPreview ${testYear}: resultado RD$${(prev.resultadoCents / 100).toFixed(2)} · bloqueo: ${prev.bloqueo ?? 'ninguno'} · cuentas: ${prev.saldos.map(s => s.codigo).join(', ')}`);

  // 2. Cerrar.
  const cierre = await cerrarEjercicio(TEAM, testYear, 4);
  const lineas = (await db.execute(sql`SELECT c.codigo, l.debe_cents d, l.haber_cents h FROM contabilidad_asiento_lineas l JOIN contabilidad_cuentas c ON c.id=l.cuenta_id WHERE l.asiento_id=${cierre.asientoId} ORDER BY l.orden`)) as unknown as { codigo: string; d: number; h: number }[];
  console.log(`\nAsiento de cierre #${cierre.asientoId} (resultado RD$${(cierre.resultadoCents / 100).toFixed(2)}):`);
  for (const l of lineas) console.log(`  ${l.codigo}  debe ${Number(l.d)}  haber ${Number(l.h)}`);
  const cuadra = lineas.reduce((s, l) => s + Number(l.d), 0) === lineas.reduce((s, l) => s + Number(l.h), 0);
  console.log(`  cuadra: ${cuadra ? 'SI' : 'NO'}`);

  // 3. Estado de resultados del año (debe seguir mostrando la utilidad, NO cero).
  const er = await estadoResultados(TEAM, { desde: `${testYear}-01-01`, hasta: `${testYear}-12-31` });
  console.log(`\nEstado de resultados ${testYear} (excluye cierre): ingresos RD$${(er.ingresos.totalCents / 100).toFixed(2)} · gastos RD$${(er.gastos.totalCents / 100).toFixed(2)} · utilidad neta RD$${(er.utilidadNetaCents / 100).toFixed(2)}`);

  // 4. Saldo de 4101/6101 hasta 31-dic INCLUYENDO cierre → debe ser 0.
  const bal = await balanceComprobacion(TEAM, { hasta: `${testYear}-12-31` });
  const pl = bal.filas.filter(f => ['4101', '6101'].includes(f.codigo)).map(f => `${f.codigo}=${f.debeCents - f.haberCents}`);
  console.log(`Saldo de resultado tras cerrar (con cierre): ${pl.join(', ')} (esperado 0)`);

  // 5. Idempotencia.
  let idemp = 'creó de más (MAL)';
  try { await cerrarEjercicio(TEAM, testYear, 4); } catch (e) { idemp = `bloqueado: ${(e as Error).message}`; }
  console.log(`\nSegundo cierre: ${idemp}`);
  console.log(`Cierres registrados: ${(await listarCierres(TEAM)).map(c => c.ejercicio).join(', ')}`);

  // 6. Reabrir.
  await reabrirEjercicio(TEAM, testYear);
  const balPost = await balanceComprobacion(TEAM, { hasta: `${testYear}-12-31` });
  const plPost = balPost.filas.filter(f => ['4101', '6101'].includes(f.codigo)).map(f => `${f.codigo}=${f.debeCents - f.haberCents}`);
  console.log(`\nTras reabrir, saldo de resultado vuelve a abierto: ${plPost.join(', ')} (esperado 4101=-10000, 6101=3000)`);
  console.log(`Cierres tras reabrir: ${(await listarCierres(TEAM)).length}`);

  // 7. Limpieza de lo sintético.
  for (const oid of [OID_ING, OID_GTO]) {
    const a = (await db.execute(sql`SELECT id FROM contabilidad_asientos WHERE team_id=${TEAM} AND origen_tipo='manual' AND origen_id=${oid}`)) as unknown as { id: number }[];
    if (a[0]) { await db.execute(sql`DELETE FROM contabilidad_asiento_lineas WHERE asiento_id=${a[0].id}`); await db.execute(sql`DELETE FROM contabilidad_asientos WHERE id=${a[0].id}`); }
  }
  const [{ n }] = (await db.execute(sql`SELECT count(*)::int n FROM contabilidad_asientos WHERE team_id=${TEAM}`)) as unknown as { n: number }[];
  console.log(`\nLimpieza hecha. Team 9 queda con ${n} asientos.`);

  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
