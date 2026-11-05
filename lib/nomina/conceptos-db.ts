/**
 * Conceptos variables de la nómina — capa con BD (la aritmética vive en
 * `./conceptos`). Lee lo que le toca a cada empleado en una corrida, guarda lo
 * aplicado en cada línea y, al aprobar, baja el saldo de los préstamos.
 */

import { and, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  contabilidadCuentas, empleadoConceptos, empleadoPrestamos, nominaConceptos, nominaLineaConceptos,
} from '@/lib/db/schema';
import {
  aConceptoAplicable, aplicaEnCorrida, CODIGO_PRESTAMO, CONCEPTOS_SEMILLA, cuotaPrestamo,
  type ConceptoAplicable, type ConceptoAplicado,
} from '@/lib/nomina/conceptos';
import type { ConceptoAsiento } from '@/lib/contabilidad/nomina-asientos';
import { asegurarCuentaPorCobrarEmpleados, buscarCuentaPorCobrarEmpleados, vincularConceptosDePrestamo } from '@/lib/nomina/cuenta-por-cobrar-empleados';
import { toleraMigracionPendiente } from '@/lib/nomina/migracion-pendiente';

type Ejecutor = Pick<typeof db, 'select' | 'insert' | 'update'>;

/** El catálogo de la empresa; si está vacío, lo siembra con los conceptos de siempre. */
export async function catalogoConceptos(teamId: number, ejecutor: Ejecutor = db) {
  return toleraMigracionPendiente(() => catalogoConceptosSinTolerancia(teamId, ejecutor), []);
}

async function catalogoConceptosSinTolerancia(teamId: number, ejecutor: Ejecutor) {
  const leer = () => ejecutor.select().from(nominaConceptos).where(eq(nominaConceptos.teamId, teamId));
  let filas = await leer();
  if (filas.length === 0) {
    // Los avances y préstamos se saldan contra «cuentas por cobrar a empleados»: si la empresa ya tiene esa
    // cuenta (reconocida por su nombre, nunca por el código a secas), se enlaza sola. Si no, se crea cuando
    // hace falta (al registrar un préstamo o descontar una cuota).
    const porCobrar = { id: await buscarCuentaPorCobrarEmpleados(teamId, ejecutor as never) };
    await ejecutor
      .insert(nominaConceptos)
      .values(CONCEPTOS_SEMILLA.map((c) => ({
        teamId, ...c,
        cuentaId: porCobrar.id && (c.codigo === 'avance' || c.codigo === CODIGO_PRESTAMO) ? porCobrar.id : null,
      })))
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
  return toleraMigracionPendiente(() => conceptosParaCorridaSinTolerancia(teamId, empleadoIds, inicio, fin), new Map());
}

async function conceptosParaCorridaSinTolerancia(
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
      gravaIsr: concepto.gravaIsr,
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
  // Las empresas que ya existían no traen la 1108: se asegura (idempotente) antes de armar las cuotas, para que
  // se abonen a «cuentas por cobrar a empleados» y no caigan en «otras deducciones por pagar».
  let cuentaCuotas = conceptoPrestamo?.cuentaId ?? null;
  if (prestamos.length > 0 && cuentaCuotas === null) {
    const asegurada = await asegurarCuentaPorCobrarEmpleados(teamId, null);
    if (asegurada) {
      cuentaCuotas = asegurada.cuentaId;
      await vincularConceptosDePrestamo(teamId, asegurada.cuentaId);
    }
  }
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
      gravaIsr: false,
      cuentaId: cuentaCuotas,
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
    gravaIsr: c.gravaIsr,
    cuentaId: c.cuentaId ?? null,
    comentario: c.comentario?.slice(0, 300) ?? null,
  })));
  if (filas.length > 0) await tx.insert(nominaLineaConceptos).values(filas);
}

/** Los conceptos de una corrida, para mostrarlos (volante, detalle). */
export async function conceptosDeCorrida(teamId: number, corridaId: number) {
  return toleraMigracionPendiente(
    () => db
      .select()
      .from(nominaLineaConceptos)
      .where(and(eq(nominaLineaConceptos.teamId, teamId), eq(nominaLineaConceptos.corridaId, corridaId))),
    [],
  );
}

/**
 * Al aprobar la corrida, cada préstamo descontado baja su saldo por lo que de
 * verdad se descontó; en cero queda saldado. Se llama una sola vez: la corrida
 * solo se aprueba desde borrador.
 */
export async function descontarPrestamosDeCorrida(teamId: number, corridaId: number): Promise<number> {
  return toleraMigracionPendiente(() => descontarPrestamosSinTolerancia(teamId, corridaId), 0);
}

async function descontarPrestamosSinTolerancia(teamId: number, corridaId: number): Promise<number> {
  const filas = await db
    .select({ prestamoId: nominaLineaConceptos.prestamoId, montoCents: nominaLineaConceptos.montoCents })
    .from(nominaLineaConceptos)
    .where(and(
      eq(nominaLineaConceptos.teamId, teamId),
      eq(nominaLineaConceptos.corridaId, corridaId),
      isNotNull(nominaLineaConceptos.prestamoId),
    ));
  // Todo o nada: un fallo a medias no deja unos préstamos descontados y otros no. Con cada préstamo
  // bloqueado se comprueba que el saldo alcance: si otra corrida se llevó parte mientras tanto, se
  // aborta (la aprobación vuelve a borrador y, al reintentar, se reconcilia) en vez de cobrar de más.
  await db.transaction(async (tx) => {
    const porPrestamo = new Map<number, number>();
    for (const f of filas) {
      if (f.prestamoId !== null && f.montoCents > 0) porPrestamo.set(f.prestamoId, (porPrestamo.get(f.prestamoId) ?? 0) + f.montoCents);
    }
    for (const [prestamoId, monto] of porPrestamo) {
      const [p] = await tx.select({ saldo: empleadoPrestamos.saldoCents, estado: empleadoPrestamos.estado }).from(empleadoPrestamos)
        .where(and(eq(empleadoPrestamos.id, prestamoId), eq(empleadoPrestamos.teamId, teamId))).for('update');
      if (!p || p.estado !== 'activo' || p.saldo < monto) throw new PrestamoCambioError();
      await tx
        .update(empleadoPrestamos)
        .set({
          saldoCents: sql`${empleadoPrestamos.saldoCents} - ${monto}`,
          estado: sql`case when ${empleadoPrestamos.saldoCents} - ${monto} <= 0 then 'saldado' else ${empleadoPrestamos.estado} end`,
        })
        .where(and(eq(empleadoPrestamos.id, prestamoId), eq(empleadoPrestamos.teamId, teamId)));
    }
  });
  return filas.length;
}

/**
 * Lo aplicado en la corrida que tiene cuenta contable propia, sumado por cuenta
 * y tipo, para el asiento. Lo que no tiene cuenta sigue en sueldos / otras
 * deducciones.
 */
export async function conceptosParaAsiento(teamId: number, corridaId: number): Promise<ConceptoAsiento[]> {
  return toleraMigracionPendiente(() => conceptosParaAsientoSinTolerancia(teamId, corridaId), []);
}

async function conceptosParaAsientoSinTolerancia(teamId: number, corridaId: number): Promise<ConceptoAsiento[]> {
  const filas = await db
    .select({
      cuentaId: nominaLineaConceptos.cuentaId,
      reservaCuentaId: nominaLineaConceptos.reservaCuentaId,
      reservaClave: nominaLineaConceptos.reservaClave,
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
    .groupBy(nominaLineaConceptos.cuentaId, nominaLineaConceptos.reservaCuentaId, nominaLineaConceptos.reservaClave, nominaLineaConceptos.tipo);
  return filas
    .filter((f) => f.cuentaId !== null && Number(f.montoCents) > 0)
    .map((f) => ({
      cuentaId: f.cuentaId as number,
      tipo: f.tipo as 'ingreso' | 'descuento',
      nombre: f.nombre,
      reservaCuentaId: f.reservaCuentaId,
      reservaClave: (f.reservaClave as ConceptoAsiento['reservaClave']) ?? null,
      montoCents: Number(f.montoCents),
    }));
}

export interface AjustePrestamo {
  prestamoId: number;
  empleado: string;
  pedidoCents: number;
  aplicadoCents: number;
}

/**
 * Antes de aprobar: lo que el borrador descontaba por un préstamo puede haber
 * dejado de ser cierto —el préstamo se canceló, o otro borrador (de otro mes,
 * generado antes) ya se llevó parte del saldo—. Se baja cada descuento a lo que
 * el préstamo todavía admite y se devuelve la diferencia al neto del empleado,
 * en la línea y en los totales de la corrida. Así nunca se cobra de más ni
 * queda un saldo negativo. Debe correr ANTES del asiento.
 */
export async function reconciliarPrestamosDeCorrida(teamId: number, corridaId: number): Promise<AjustePrestamo[]> {
  return toleraMigracionPendiente(() => reconciliarSinTolerancia(teamId, corridaId), []);
}

async function reconciliarSinTolerancia(teamId: number, corridaId: number): Promise<AjustePrestamo[]> {
  // Con los préstamos bloqueados (FOR UPDATE): dos corridas que se aprueban a la vez se esperan una a otra.
  return db.transaction(async (tx) => {
  const filas = await tx
    .select({
      id: nominaLineaConceptos.id,
      lineaId: nominaLineaConceptos.lineaId,
      prestamoId: nominaLineaConceptos.prestamoId,
      montoCents: nominaLineaConceptos.montoCents,
      saldoCents: empleadoPrestamos.saldoCents,
      estado: empleadoPrestamos.estado,
      nombre: sql<string>`(select nombre from nomina_lineas where id = ${nominaLineaConceptos.lineaId})`,
    })
    .from(nominaLineaConceptos)
    .innerJoin(empleadoPrestamos, eq(empleadoPrestamos.id, nominaLineaConceptos.prestamoId))
    .where(and(
      eq(nominaLineaConceptos.teamId, teamId),
      eq(nominaLineaConceptos.corridaId, corridaId),
      isNotNull(nominaLineaConceptos.prestamoId),
    ))
    .orderBy(nominaLineaConceptos.id)
    .for('update', { of: empleadoPrestamos });

  const disponible = new Map<number, number>();
  const ajustes: AjustePrestamo[] = [];
  for (const f of filas) {
    const pid = f.prestamoId as number;
    if (!disponible.has(pid)) disponible.set(pid, f.estado === 'activo' ? f.saldoCents : 0);
    const queda = disponible.get(pid)!;
    const aplicado = Math.min(f.montoCents, queda);
    disponible.set(pid, queda - aplicado);
    const delta = f.montoCents - aplicado;
    if (delta <= 0) continue;

    await tx.update(nominaLineaConceptos).set({ montoCents: aplicado }).where(eq(nominaLineaConceptos.id, f.id));
    await tx.execute(sql`
      UPDATE nomina_lineas
         SET otras_deducciones_cents = otras_deducciones_cents - ${delta},
             total_deducciones_cents = total_deducciones_cents - ${delta},
             neto_cents = neto_cents + ${delta}
       WHERE id = ${f.lineaId} AND team_id = ${teamId}`);
    await tx.execute(sql`
      UPDATE nomina_corridas
         SET total_deducciones_cents = total_deducciones_cents - ${delta},
             total_neto_cents = total_neto_cents + ${delta}
       WHERE id = ${corridaId} AND team_id = ${teamId}`);
    ajustes.push({ prestamoId: pid, empleado: f.nombre, pedidoCents: f.montoCents, aplicadoCents: aplicado });
  }
  return ajustes;
  });
}

/**
 * Deshace `descontarPrestamosDeCorrida` cuando la aprobación falló después de descontar: devuelve a cada
 * préstamo lo que se le descontó y lo reabre si había quedado saldado. Solo se llama desde ese mismo intento.
 */
export async function restaurarPrestamosDeCorrida(teamId: number, corridaId: number): Promise<void> {
  await toleraMigracionPendiente(async () => {
    const filas = await db
      .select({ prestamoId: nominaLineaConceptos.prestamoId, montoCents: nominaLineaConceptos.montoCents })
      .from(nominaLineaConceptos)
      .where(and(
        eq(nominaLineaConceptos.teamId, teamId), eq(nominaLineaConceptos.corridaId, corridaId), isNotNull(nominaLineaConceptos.prestamoId),
      ));
    await db.transaction(async (tx) => {
      for (const f of filas) {
        if (f.prestamoId === null || f.montoCents <= 0) continue;
        await tx
          .update(empleadoPrestamos)
          .set({
            saldoCents: sql`${empleadoPrestamos.saldoCents} + ${f.montoCents}`,
            estado: sql`case when ${empleadoPrestamos.estado} = 'saldado' then 'activo' else ${empleadoPrestamos.estado} end`,
          })
          .where(and(eq(empleadoPrestamos.id, f.prestamoId), eq(empleadoPrestamos.teamId, teamId)));
      }
    });
  }, undefined);
}

/** Un préstamo cambió (otra corrida se llevó saldo, o se canceló) entre revisar y descontar. */
export class PrestamoCambioError extends Error {
  constructor() { super('Un préstamo cambió mientras se aprobaba la corrida: vuelve a intentarlo.'); }
}
