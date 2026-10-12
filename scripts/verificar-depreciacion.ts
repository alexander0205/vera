/**
 * Verificación sintética del Nivel 4.2 (activos fijos + depreciación).
 * Crea un activo de prueba en el team 9, genera sus depreciaciones, comprueba
 * que cada asiento cuadra, e imprime acumulada/valor en libros. Limpia todo al
 * final (orden inverso, respetando las FK). No deja rastro salvo las cuentas
 * base 12/1201/1202/6103, que SÍ deben quedar sembradas en el team demo.
 */
import 'dotenv/config';
import { db } from '@/lib/db/drizzle';
import { sql } from 'drizzle-orm';
import { sembrarCuentasBaseFaltantes } from '@/lib/contabilidad/catalogo-base';
import {
  registrarActivoFijo, generarDepreciacionesPendientes, listarActivosFijos,
} from '@/lib/contabilidad/depreciacion';

const TEAM = 9;

(async () => {
  // 0. Estado del team.
  const cfg = (await db.execute(sql`
    SELECT activa, cuenta_activo_fijo_id AS a, cuenta_deprec_acum_id AS d, cuenta_gasto_deprec_id AS g
    FROM contabilidad_config WHERE team_id = ${TEAM}
  `)) as unknown as Array<{ activa: boolean; a: number | null; d: number | null; g: number | null }>;
  console.log('config team 9:', cfg[0] ?? '(sin config)');

  // 1. Sembrar cuentas base faltantes (12/1201/1202/6103).
  const sembradas = await sembrarCuentasBaseFaltantes(TEAM);
  console.log(`cuentas base faltantes sembradas: ${sembradas}`);
  const cuentasNuevas = (await db.execute(sql`
    SELECT codigo, nombre, tipo, naturaleza, imputable FROM contabilidad_cuentas
    WHERE team_id = ${TEAM} AND codigo IN ('12','1201','1202','6103') ORDER BY codigo
  `)) as unknown as Array<Record<string, unknown>>;
  console.log('cuentas 4.2:', cuentasNuevas);

  // 2. Activo de prueba: RD$1,200,000, 48 meses, adquirido 2026-01-15.
  const activoId = await registrarActivoFijo(TEAM, {
    nombre: 'ZZZ-TEST depreciación (borrar)',
    costoCents: 120_000_000,
    valorResidualCents: 0,
    vidaUtilMeses: 48,
    fechaAdquisicion: '2026-01-15',
  }, null);
  console.log(`\nactivo de prueba id=${activoId}`);

  // 3. Generar depreciaciones pendientes.
  const resumen = await generarDepreciacionesPendientes(TEAM, null);
  console.log('resumen generación:', resumen);

  // 4. Comprobar cuadre de cada asiento generado.
  const asientos = (await db.execute(sql`
    SELECT a.id, a.concepto, to_char(a.fecha,'YYYY-MM-DD') AS fecha, a.total_cents AS total,
           (SELECT sum(debe_cents) FROM contabilidad_asiento_lineas WHERE asiento_id = a.id) AS debe,
           (SELECT sum(haber_cents) FROM contabilidad_asiento_lineas WHERE asiento_id = a.id) AS haber
    FROM contabilidad_asientos a
    JOIN contabilidad_depreciaciones d ON d.asiento_id = a.id AND d.activo_id = ${activoId}
    WHERE a.team_id = ${TEAM} AND a.origen_tipo = 'depreciacion'
    ORDER BY a.fecha
  `)) as unknown as Array<{ id: number; concepto: string; fecha: string; total: number; debe: number; haber: number }>;
  console.log(`\nasientos de depreciación (${asientos.length}):`);
  let todosCuadran = true;
  for (const a of asientos) {
    const cuadra = Number(a.debe) === Number(a.haber) && Number(a.debe) === Number(a.total);
    if (!cuadra) todosCuadran = false;
    console.log(`  ${a.fecha}  total=${a.total}  debe=${a.debe}  haber=${a.haber}  ${cuadra ? 'OK' : '✗ DESCUADRE'}  «${a.concepto}»`);
  }
  console.log(`todos cuadran: ${todosCuadran ? 'SÍ' : 'NO'}`);

  // 5. Idempotencia: segunda corrida no debe crear nada.
  const segunda = await generarDepreciacionesPendientes(TEAM, null);
  console.log(`\nsegunda corrida (idempotencia): creados=${segunda.creados} (esperado 0)`);

  // 6. Listado: acumulada y valor en libros del activo de prueba.
  const enLista = (await listarActivosFijos(TEAM)).find((x) => x.id === activoId);
  console.log('\nlistado del activo:', {
    costo: enLista?.costoCents, acumulada: enLista?.acumuladaCents,
    valorLibros: enLista?.valorLibrosCents, cuotas: enLista?.cuotasHechas,
  });

  // 7. Limpieza en orden inverso (FK: lineas → asientos → depreciaciones → activo).
  const idsAsiento = asientos.map((a) => a.id);
  if (idsAsiento.length) {
    const idList = sql.join(idsAsiento.map((id) => sql`${id}`), sql`, `);
    await db.execute(sql`DELETE FROM contabilidad_asiento_lineas WHERE asiento_id IN (${idList})`);
    await db.execute(sql`UPDATE contabilidad_depreciaciones SET asiento_id = NULL WHERE activo_id = ${activoId}`);
    await db.execute(sql`DELETE FROM contabilidad_asientos WHERE id IN (${idList})`);
  }
  await db.execute(sql`DELETE FROM contabilidad_depreciaciones WHERE activo_id = ${activoId}`);
  await db.execute(sql`DELETE FROM contabilidad_activos_fijos WHERE id = ${activoId}`);
  const quedan = (await db.execute(sql`
    SELECT count(*)::int AS n FROM contabilidad_activos_fijos WHERE id = ${activoId}
  `)) as unknown as Array<{ n: number }>;
  console.log(`\nlimpieza: activo de prueba restante = ${quedan[0].n} (esperado 0)`);

  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
