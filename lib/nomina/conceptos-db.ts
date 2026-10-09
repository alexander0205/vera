/**
 * Conceptos variables de la nómina — capa con BD (la aritmética vive en
 * `./conceptos`). Lee lo que le toca a cada empleado en una corrida, guarda lo
 * aplicado en cada línea y, al aprobar, baja el saldo de los préstamos.
 */

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  empleadoConceptos, empleadoPrestamos, nominaConceptos, nominaLineaConceptos,
} from '@/lib/db/schema';
import {
  aConceptoAplicable, aplicaEnCorrida, CODIGO_PRESTAMO, CONCEPTOS_SEMILLA, cuotaPrestamo,
  type ConceptoAplicable, type ConceptoAplicado,
} from '@/lib/nomina/conceptos';
import type { ConceptoAsiento } from '@/lib/contabilidad/nomina-asientos';

type Ejecutor = Pick<typeof db, 'select' | 'insert' | 'update'>;

/** El catálogo de la empresa; si está vacío, lo siembra con los conceptos de siempre. */
export async function catalogoConceptos(teamId: number, ejecutor: Ejecutor = db) {
  const leer = () => ejecutor.select().from(nominaConceptos).where(eq(nominaConceptos.teamId, teamId));
  let filas = await leer();
  if (filas.length === 0) {
    await ejecutor
      .insert(nominaConceptos)
      .values(CONCEPTOS_SEMILLA.map((c) => ({ teamId, ...c })))
      .onConflictDoNothing();
    filas = await leer();
  }
  return filas;
}

/**
 * Lo que le toca a cada empleado en la corrida que paga `inicio`–`fin`: sus
 * conceptos asignados que aplican y la cuota de cada préstamo activo.
 */
export async function conceptosParaCorrida(
  teamId: number,
  empleadoIds: number[],
  inicio: string,
  fin: string,
): Promise<Map<number, ConceptoAplicable[]>> {
  const porEmpleado = new Map<number, ConceptoAplicable[]>();
  if (empleadoIds.length === 0) return porEmpleado;
  const agregar = (id: number, c: ConceptoAplicable) => porEmpleado.set(id, [...(porEmpleado.get(id) ?? []), c]);

  const catalogo = await catalogoConceptos(teamId);
  const porId = new Map(catalogo.map((c) => [c.id, c]));

  const asignados = await db
    .select()
    .from(empleadoConceptos)
    .where(and(
      eq(empleadoConceptos.teamId, teamId),
      eq(empleadoConceptos.activo, true),
      inArray(empleadoConceptos.empleadoId, empleadoIds),
    ));
  for (const a of asignados) {
    const concepto = porId.get(a.conceptoId);
    if (!concepto || !concepto.activo) continue;
    const asignacion = {
      conceptoId: concepto.id,
      tipo: concepto.tipo as 'ingreso' | 'descuento',
      nombre: concepto.nombre,
      cotizaTss: concepto.cotizaTss,
      cuentaId: concepto.cuentaId,
      montoCents: a.montoCents,
      fijo: a.fijo,
      desde: a.desde,
      hasta: a.hasta,
      comentario: a.comentario,
    };
    if (aplicaEnCorrida(asignacion, inicio, fin)) agregar(a.empleadoId, aConceptoAplicable(asignacion));
  }

  // Los préstamos van al final de la lista de cada empleado: es lo último que se
  // descuenta si el neto no alcanza.
  const prestamos = await db
    .select()
    .from(empleadoPrestamos)
    .where(and(
      eq(empleadoPrestamos.teamId, teamId),
      eq(empleadoPrestamos.estado, 'activo'),
      inArray(empleadoPrestamos.empleadoId, empleadoIds),
    ));
  const conceptoPrestamo = catalogo.find((c) => c.codigo === CODIGO_PRESTAMO);
  for (const p of prestamos) {
    if (p.desde > fin) continue;
    const cuota = cuotaPrestamo({ id: p.id, saldoCents: p.saldoCents, cuotaCents: p.cuotaCents });
    if (cuota <= 0) continue;
    agregar(p.empleadoId, {
      conceptoId: conceptoPrestamo?.id ?? null,
      prestamoId: p.id,
      tipo: 'descuento',
      nombre: p.comentario ? `Préstamo · ${p.comentario}` : 'Préstamo',
      montoCents: cuota,
      cotizaTss: false,
      cuentaId: conceptoPrestamo?.cuentaId ?? null,
      comentario: p.comentario,
    });
  }
  return porEmpleado;
}

/** Guarda los conceptos aplicados de cada línea recién insertada. */
export async function guardarConceptosDeLineas(
  tx: Ejecutor,
  teamId: number,
  corridaId: number,
  lineas: { lineaId: number; empleadoId: number; conceptos: ConceptoAplicado[] }[],
): Promise<void> {
  const filas = lineas.flatMap((l) => l.conceptos.map((c) => ({
    lineaId: l.lineaId,
    corridaId,
    teamId,
    empleadoId: l.empleadoId,
    conceptoId: c.conceptoId,
    prestamoId: c.prestamoId ?? null,
    tipo: c.tipo,
    nombre: c.nombre.slice(0, 120),
    montoCents: c.montoCents,
    pedidoCents: c.pedidoCents,
    cotizaTss: c.cotizaTss,
    cuentaId: c.cuentaId ?? null,
    comentario: c.comentario?.slice(0, 300) ?? null,
  })));
  if (filas.length > 0) await tx.insert(nominaLineaConceptos).values(filas);
}

/** Los conceptos de una corrida, para mostrarlos (volante, detalle). */
export async function conceptosDeCorrida(teamId: number, corridaId: number) {
  return db
    .select()
    .from(nominaLineaConceptos)
    .where(and(eq(nominaLineaConceptos.teamId, teamId), eq(nominaLineaConceptos.corridaId, corridaId)));
}

/**
 * Al aprobar la corrida, cada préstamo descontado baja su saldo por lo que de
 * verdad se descontó; en cero queda saldado. Se llama una sola vez: la corrida
 * solo se aprueba desde borrador.
 */
export async function descontarPrestamosDeCorrida(teamId: number, corridaId: number): Promise<number> {
  const filas = await db
    .select({ prestamoId: nominaLineaConceptos.prestamoId, montoCents: nominaLineaConceptos.montoCents })
    .from(nominaLineaConceptos)
    .where(and(
      eq(nominaLineaConceptos.teamId, teamId),
      eq(nominaLineaConceptos.corridaId, corridaId),
      isNotNull(nominaLineaConceptos.prestamoId),
    ));
  for (const f of filas) {
    if (f.prestamoId === null || f.montoCents <= 0) continue;
    await db
      .update(empleadoPrestamos)
      .set({
        saldoCents: sql`greatest(${empleadoPrestamos.saldoCents} - ${f.montoCents}, 0)`,
        estado: sql`case when ${empleadoPrestamos.saldoCents} - ${f.montoCents} <= 0 then 'saldado' else ${empleadoPrestamos.estado} end`,
      })
      .where(and(eq(empleadoPrestamos.id, f.prestamoId), eq(empleadoPrestamos.teamId, teamId)));
  }
  return filas.length;
}

/**
 * Lo aplicado en la corrida que tiene cuenta contable propia, sumado por cuenta
 * y tipo, para el asiento. Lo que no tiene cuenta sigue en sueldos / otras
 * deducciones.
 */
export async function conceptosParaAsiento(teamId: number, corridaId: number): Promise<ConceptoAsiento[]> {
  const filas = await db
    .select({
      cuentaId: nominaLineaConceptos.cuentaId,
      tipo: nominaLineaConceptos.tipo,
      nombre: sql<string>`min(${nominaLineaConceptos.nombre})`,
      montoCents: sql<number>`sum(${nominaLineaConceptos.montoCents})::bigint`,
    })
    .from(nominaLineaConceptos)
    .where(and(
      eq(nominaLineaConceptos.teamId, teamId),
      eq(nominaLineaConceptos.corridaId, corridaId),
      isNotNull(nominaLineaConceptos.cuentaId),
    ))
    .groupBy(nominaLineaConceptos.cuentaId, nominaLineaConceptos.tipo);
  return filas
    .filter((f) => f.cuentaId !== null && Number(f.montoCents) > 0)
    .map((f) => ({
      cuentaId: f.cuentaId as number,
      tipo: f.tipo as 'ingreso' | 'descuento',
      nombre: f.nombre,
      montoCents: Number(f.montoCents),
    }));
}
