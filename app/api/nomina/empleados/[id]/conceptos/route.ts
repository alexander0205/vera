import { NextResponse } from 'next/server';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleadoConceptos, empleadoPrestamos, empleados, nominaConceptos } from '@/lib/db/schema';
import {
  CUOTAS_MAX, MAX_ACTIVOS_POR_EMPLEADO, cuotasDePrestamo, fechaRazonable, limpiarTexto, parseMontoPesos,
} from '@/lib/nomina/conceptos';

export const dynamic = 'force-dynamic';

async function empleadoDelTeam(teamId: number, idRaw: string) {
  if (!/^\d{1,9}$/.test(idRaw)) return null;
  const [fila] = await db
    .select({ id: empleados.id })
    .from(empleados)
    .where(and(eq(empleados.id, Number(idRaw)), eq(empleados.teamId, teamId)))
    .limit(1);
  return fila ?? null;
}

const error = (mensaje: string, status = 400) => NextResponse.json({ error: mensaje }, { status });

/** ¿La base rechazó el insert por el índice único de lo idéntico? */
const esDuplicado = (e: unknown) =>
  typeof e === 'object' && e !== null && ((e as { code?: string }).code === '23505' || /unique|duplicate/i.test(String((e as { message?: string }).message)));

/** GET /api/nomina/empleados/[id]/conceptos — lo asignado y sus préstamos. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;
  const empleado = await empleadoDelTeam(auth.teamId, (await params).id);
  if (!empleado) return error('Empleado no encontrado', 404);

  const asignaciones = await db
    .select({
      id: empleadoConceptos.id,
      conceptoId: empleadoConceptos.conceptoId,
      nombre: nominaConceptos.nombre,
      tipo: nominaConceptos.tipo,
      montoCents: empleadoConceptos.montoCents,
      fijo: empleadoConceptos.fijo,
      desde: empleadoConceptos.desde,
      hasta: empleadoConceptos.hasta,
      comentario: empleadoConceptos.comentario,
    })
    .from(empleadoConceptos)
    .innerJoin(nominaConceptos, eq(nominaConceptos.id, empleadoConceptos.conceptoId))
    .where(and(
      eq(empleadoConceptos.empleadoId, empleado.id),
      eq(empleadoConceptos.teamId, auth.teamId),
      eq(empleadoConceptos.activo, true),
    ))
    .orderBy(asc(empleadoConceptos.desde), asc(empleadoConceptos.id));

  const prestamos = await db
    .select()
    .from(empleadoPrestamos)
    .where(and(eq(empleadoPrestamos.empleadoId, empleado.id), eq(empleadoPrestamos.teamId, auth.teamId)))
    .orderBy(asc(empleadoPrestamos.desde), asc(empleadoPrestamos.id));

  return NextResponse.json({ asignaciones, prestamos });
}

/** Cuántos conceptos y préstamos activos tiene ya: pasarse de la raya es casi seguro un error. */
async function activosDe(teamId: number, empleadoId: number): Promise<number> {
  const [[a], [p]] = await Promise.all([
    db.select({ n: count() }).from(empleadoConceptos)
      .where(and(eq(empleadoConceptos.teamId, teamId), eq(empleadoConceptos.empleadoId, empleadoId), eq(empleadoConceptos.activo, true))),
    db.select({ n: count() }).from(empleadoPrestamos)
      .where(and(eq(empleadoPrestamos.teamId, teamId), eq(empleadoPrestamos.empleadoId, empleadoId), eq(empleadoPrestamos.estado, 'activo'))),
  ]);
  return Number(a.n) + Number(p.n);
}

/**
 * POST /api/nomina/empleados/[id]/conceptos — asigna un concepto o registra un
 * préstamo. Los montos llegan en pesos.
 *   { kind: 'concepto', conceptoId, monto, fijo, desde, hasta?, comentario? }
 *   { kind: 'prestamo', monto, cuota, desde, comentario? }
 *
 * Un doble clic o un reenvío no debe duplicar un incentivo (se pagaría dos
 * veces): lo idéntico a algo ya activo se rechaza.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;
  const empleado = await empleadoDelTeam(auth.teamId, (await params).id);
  if (!empleado) return error('Empleado no encontrado', 404);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Cuerpo inválido');
  if (body.kind !== 'concepto' && body.kind !== 'prestamo') return error('kind debe ser concepto o prestamo');

  if (!fechaRazonable(body.desde)) return error('La fecha de inicio no es válida (entre 2000 y 2100)');
  const desde = body.desde;
  const comentario = limpiarTexto(body.comentario, 300);

  if ((await activosDe(auth.teamId, empleado.id)) >= MAX_ACTIVOS_POR_EMPLEADO) {
    return error(`Este empleado ya tiene ${MAX_ACTIVOS_POR_EMPLEADO} conceptos y préstamos activos. Quita los que ya no apliquen.`, 409);
  }

  if (body.kind === 'prestamo') {
    const monto = parseMontoPesos(body.monto, 'El monto del préstamo');
    if (!monto.ok) return error(monto.error);
    const cuota = parseMontoPesos(body.cuota, 'La cuota');
    if (!cuota.ok) return error(cuota.error);
    if (cuota.cents > monto.cents) return error('La cuota no puede ser mayor que el préstamo');
    if (cuotasDePrestamo(monto.cents, cuota.cents) > CUOTAS_MAX) {
      return error(`Con esa cuota el préstamo tardaría más de ${CUOTAS_MAX} corridas. Sube la cuota.`);
    }
    const [repetido] = await db
      .select({ id: empleadoPrestamos.id })
      .from(empleadoPrestamos)
      .where(and(
        eq(empleadoPrestamos.teamId, auth.teamId), eq(empleadoPrestamos.empleadoId, empleado.id),
        eq(empleadoPrestamos.estado, 'activo'), eq(empleadoPrestamos.saldoCents, monto.cents),
        eq(empleadoPrestamos.montoCents, monto.cents), eq(empleadoPrestamos.cuotaCents, cuota.cents),
        eq(empleadoPrestamos.desde, desde),
      ))
      .limit(1);
    if (repetido) return error('Ya existe un préstamo idéntico activo para este empleado. ¿Fue un doble clic?', 409);

    try {
      const [fila] = await db
        .insert(empleadoPrestamos)
        .values({
          teamId: auth.teamId, empleadoId: empleado.id, montoCents: monto.cents, cuotaCents: cuota.cents,
          saldoCents: monto.cents, desde, comentario, createdBy: auth.user.id,
        })
        .returning();
      return NextResponse.json({ prestamo: fila }, { status: 201 });
    } catch (e) {
      if (esDuplicado(e)) return error('Ya existe un préstamo idéntico activo para este empleado. ¿Fue un doble clic?', 409);
      throw e;
    }
  }

  const conceptoId = typeof body.conceptoId === 'number' ? body.conceptoId : NaN;
  if (!Number.isSafeInteger(conceptoId) || conceptoId <= 0) return error('Elige un concepto');
  const monto = parseMontoPesos(body.monto);
  if (!monto.ok) return error(monto.error);
  const fijo = body.fijo === true;
  let hasta: string | null = null;
  if (fijo && body.hasta) {
    if (!fechaRazonable(body.hasta) || body.hasta < desde) return error('La fecha final no es válida: debe ser posterior a la de inicio');
    hasta = body.hasta;
  }
  const [concepto] = await db
    .select({ id: nominaConceptos.id, activo: nominaConceptos.activo, codigo: nominaConceptos.codigo })
    .from(nominaConceptos)
    .where(and(eq(nominaConceptos.id, conceptoId), eq(nominaConceptos.teamId, auth.teamId)))
    .limit(1);
  if (!concepto || !concepto.activo) return error('Concepto no encontrado', 404);
  // Los préstamos tienen su propio formulario: un descuento suelto con ese concepto no baja ningún saldo.
  if (concepto.codigo === 'prestamo') return error('Los préstamos se registran con «Registrar préstamo o avance»');

  const [repetido] = await db
    .select({ id: empleadoConceptos.id })
    .from(empleadoConceptos)
    .where(and(
      eq(empleadoConceptos.teamId, auth.teamId), eq(empleadoConceptos.empleadoId, empleado.id),
      eq(empleadoConceptos.activo, true), eq(empleadoConceptos.conceptoId, conceptoId),
      eq(empleadoConceptos.montoCents, monto.cents), eq(empleadoConceptos.fijo, fijo),
      eq(empleadoConceptos.desde, desde),
      hasta === null ? isNull(empleadoConceptos.hasta) : eq(empleadoConceptos.hasta, hasta),
    ))
    .limit(1);
  if (repetido) return error('Ya existe un concepto idéntico activo para este empleado. ¿Fue un doble clic?', 409);

  try {
    const [fila] = await db
      .insert(empleadoConceptos)
      .values({
        teamId: auth.teamId, empleadoId: empleado.id, conceptoId, montoCents: monto.cents, fijo,
        desde, hasta, comentario, createdBy: auth.user.id,
      })
      .returning();
    return NextResponse.json({ asignacion: fila }, { status: 201 });
  } catch (e) {
    if (esDuplicado(e)) return error('Ya existe un concepto idéntico activo para este empleado. ¿Fue un doble clic?', 409);
    throw e;
  }
}

/**
 * DELETE /api/nomina/empleados/[id]/conceptos?asignacion=ID | ?prestamo=ID —
 * quita una asignación (no toca corridas ya hechas) o cancela un préstamo (deja
 * de descontarse; lo ya descontado queda en las corridas). Un borrador que ya
 * lo incluía se corrige solo al aprobar.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;
  const empleado = await empleadoDelTeam(auth.teamId, (await params).id);
  if (!empleado) return error('Empleado no encontrado', 404);

  const url = new URL(req.url);
  const asignacion = url.searchParams.get('asignacion');
  const prestamo = url.searchParams.get('prestamo');

  if (asignacion !== null) {
    if (!/^\d{1,9}$/.test(asignacion)) return error('ID inválido');
    const quitadas = await db
      .update(empleadoConceptos)
      .set({ activo: false })
      .where(and(
        eq(empleadoConceptos.id, Number(asignacion)),
        eq(empleadoConceptos.empleadoId, empleado.id),
        eq(empleadoConceptos.teamId, auth.teamId),
        eq(empleadoConceptos.activo, true),
      ))
      .returning({ id: empleadoConceptos.id });
    return quitadas.length > 0 ? NextResponse.json({ ok: true }) : error('Concepto no encontrado', 404);
  }
  if (prestamo !== null) {
    if (!/^\d{1,9}$/.test(prestamo)) return error('ID inválido');
    const canceladas = await db
      .update(empleadoPrestamos)
      .set({ estado: 'cancelado' })
      .where(and(
        eq(empleadoPrestamos.id, Number(prestamo)),
        eq(empleadoPrestamos.empleadoId, empleado.id),
        eq(empleadoPrestamos.teamId, auth.teamId),
        eq(empleadoPrestamos.estado, 'activo'),
      ))
      .returning({ id: empleadoPrestamos.id });
    return canceladas.length > 0 ? NextResponse.json({ ok: true }) : error('Préstamo no encontrado o ya no está activo', 404);
  }
  return error('Indica asignacion o prestamo');
}
