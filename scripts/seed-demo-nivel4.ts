/**
 * Siembra datos de demo del Nivel 4 (activos fijos, compras/CxP) en el team 9.
 * Todo queda marcado para poder limpiarlo con scripts/limpiar-demo-nivel4.ts.
 * Idempotente: si ya hay demo sembrada, no duplica.
 *
 *   npx tsx scripts/seed-demo-nivel4.ts
 */
import 'dotenv/config';
import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { registrarActivoFijo, generarDepreciacionesPendientes, listarActivosFijos } from '@/lib/contabilidad/depreciacion';
import { generarAsientosPendientes } from '@/lib/contabilidad/libro-diario';
import { registrarPagoProveedor, listarCuentasPorPagar } from '@/lib/contabilidad/cuentas-por-pagar';

const TEAM = 9;
const USER = 4;             // ferrerasalexander@gmail.com
const MARCA = 'DEMO-N4';

const activos = [
  { nombre: 'Edificio principal',  costoCents: 500_000_000, valorResidualCents: 0,          vidaUtilMeses: 240, fechaAdquisicion: '2024-01-15' },
  { nombre: 'Autobús escolar',     costoCents: 350_000_000, valorResidualCents: 50_000_000, vidaUtilMeses: 120, fechaAdquisicion: '2025-06-10' },
  { nombre: 'Mobiliario de aulas', costoCents: 80_000_000,  valorResidualCents: 0,          vidaUtilMeses: 60,  fechaAdquisicion: '2026-01-20' },
];

// forma_pago, monto (cents), fecha, vencimiento, estado — antigüedades variadas.
const compras = [
  { proveedor: 'Librería Escolar Nacional',        rnc: '130111111', monto: 4_500_000,  forma: 'credito', metodo: 'efectivo',      fecha: '2026-07-15', vence: '2026-08-20' }, // por vencer
  { proveedor: 'Distribuidora de Alimentos del Este', rnc: '130222222', monto: 7_850_000, forma: 'credito', metodo: 'transferencia', fecha: '2026-06-25', vence: '2026-07-10' }, // 1-30
  { proveedor: 'Servicios de Mantenimiento RD',    rnc: '130333333', monto: 12_000_000, forma: 'credito', metodo: 'efectivo',      fecha: '2026-05-20', vence: '2026-06-05' }, // 31-60, con pago parcial
  { proveedor: 'Uniformes y Textiles SRL',         rnc: '130444444', monto: 26_000_000, forma: 'credito', metodo: 'transferencia', fecha: '2026-03-28', vence: '2026-04-12' }, // 90+
  { proveedor: 'Papelería Central',                rnc: '130555555', monto: 1_800_000,  forma: 'contado', metodo: 'efectivo',      fecha: '2026-07-22', vence: null },         // contado (no entra a CxP)
];

(async () => {
  const [{ n: ya }] = (await db.execute(sql`
    SELECT count(*)::int n FROM compras_locales WHERE team_id = ${TEAM} AND notas = ${MARCA}
  `)) as unknown as { n: number }[];
  const [{ n: yaAct }] = (await db.execute(sql`
    SELECT count(*)::int n FROM contabilidad_activos_fijos WHERE team_id = ${TEAM} AND nombre = ${activos[0].nombre}
  `)) as unknown as { n: number }[];
  if (ya > 0 || yaAct > 0) {
    console.log('La demo del Nivel 4 ya está sembrada. Corre limpiar-demo-nivel4.ts para reiniciarla.');
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
    process.exit(0);
  }

  // 1. Activos fijos + depreciación.
  for (const a of activos) await registrarActivoFijo(TEAM, a, USER);
  const dep = await generarDepreciacionesPendientes(TEAM, USER);
  console.log(`Activos: ${activos.length} · cuotas de depreciación generadas: ${dep.creados}`);

  // 2. Compras (encabezados). El asiento lo genera el barrido más abajo.
  const idsCredito: Record<string, number> = {};
  for (const c of compras) {
    const rows = await db.execute(sql`
      INSERT INTO compras_locales
        (team_id, proveedor_nombre, proveedor_rnc, fecha, itbis_cents, monto_total,
         forma_pago, metodo_pago, fecha_vencimiento, estado_pago, notas, created_by)
      VALUES (${TEAM}, ${c.proveedor}, ${c.rnc}, ${c.fecha}, 0, ${c.monto},
              ${c.forma}, ${c.metodo}, ${c.vence}, ${c.forma === 'contado' ? 'PAGADA' : 'PENDIENTE'},
              ${MARCA}, ${USER})
      RETURNING id
    `);
    const id = (rows as unknown as { id: number }[])[0].id;
    if (c.forma === 'credito') idsCredito[c.proveedor] = id;
  }
  console.log(`Compras: ${compras.length} (${Object.keys(idsCredito).length} a crédito, 1 al contado)`);

  // 3. Generar los asientos de compra (y todo lo pendiente del team).
  const barrido = await generarAsientosPendientes(TEAM, USER);
  console.log(`Asientos generados por el barrido: ${barrido.creados}`);

  // 4. Un pago parcial sobre "Servicios de Mantenimiento RD" → estado PARCIAL.
  const compraPago = idsCredito['Servicios de Mantenimiento RD'];
  await registrarPagoProveedor({
    teamId: TEAM, compraId: compraPago, montoCents: 4_000_000, metodo: 'efectivo',
    fechaPago: '2026-06-10', referencia: 'Abono demo', notas: MARCA, userId: USER,
  });
  console.log(`Pago parcial de RD$40,000 sobre compra #${compraPago} (queda PARCIAL).`);

  // 5. Resumen para revisar.
  const lista = await listarActivosFijos(TEAM);
  console.log('\n— Activos fijos —');
  for (const a of lista.filter((x) => activos.some((s) => s.nombre === x.nombre))) {
    console.log(`  ${a.nombre}: acum RD$${(a.acumuladaCents / 100).toLocaleString('es-DO')} · libros RD$${(a.valorLibrosCents / 100).toLocaleString('es-DO')} · ${a.cuotasHechas}/${a.vidaUtilMeses}`);
  }
  const cxp = await listarCuentasPorPagar(TEAM);
  console.log('\n— Cuentas por pagar —');
  console.log(`  pendiente RD$${(cxp.totales.pendiente / 100).toLocaleString('es-DO')} · vencido RD$${(cxp.totales.vencido / 100).toLocaleString('es-DO')} · cuentas ${cxp.totales.count} (${cxp.totales.countVencidas} vencidas)`);
  const porOrigen = (await db.execute(sql`
    SELECT origen_tipo, count(*)::int n FROM contabilidad_asientos WHERE team_id = ${TEAM}
    AND origen_tipo IN ('compra','pago_proveedor','depreciacion') GROUP BY origen_tipo ORDER BY origen_tipo
  `)) as unknown as Array<{ origen_tipo: string; n: number }>;
  console.log('\n— Asientos nuevos por origen —');
  for (const o of porOrigen) console.log(`  ${o.origen_tipo}: ${o.n}`);

  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
