import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleadoConceptos, empleadoPrestamos, empleados, nominaConceptos } from '@/lib/db/schema';
import { esFechaYMD } from '@/lib/nomina/periodos';

export const dynamic = 'force-dynamic';

async function empleadoDelTeam(teamId: number, idRaw: string) {
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return null;
  const [fila] = await db
    .select({ id: empleados.id })
    .from(empleados)
    .where(and(eq(empleados.id, id), eq(empleados.teamId, teamId)))
    .limit(1);
  return fila ?? null;
}

/** Pesos (con decimales) a centavos enteros; null si no es un monto positivo. */
function centavos(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** GET /api/nomina/empleados/[id]/conceptos — lo asignado y sus préstamos. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;
  const empleado = await empleadoDelTeam(auth.teamId, (await params).id);
  if (!empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

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

/**
 * POST /api/nomina/empleados/[id]/conceptos — asigna un concepto o registra un
 * préstamo. Los montos llegan en pesos.
 *   { kind: 'concepto', conceptoId, monto, fijo, desde, hasta?, comentario? }
 *   { kind: 'prestamo', monto, cuota, desde, comentario? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;
  const empleado = await empleadoDelTeam(auth.teamId, (await params).id);
  if (!empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const desde = body.desde;
  if (!esFechaYMD(desde)) return NextResponse.json({ error: 'La fecha de inicio no es válida' }, { status: 400 });
  const comentario = typeof body.comentario === 'string' && body.comentario.trim() ? body.comentario.trim().slice(0, 300) : null;

  if (body.kind === 'prestamo') {
    const monto = centavos(body.monto);
    const cuota = centavos(body.cuota);
    if (monto === null) return NextResponse.json({ error: 'El monto del préstamo debe ser mayor que cero' }, { status: 400 });
    if (cuota === null) return NextResponse.json({ error: 'La cuota debe ser mayor que cero' }, { status: 400 });
    if (cuota > monto) return NextResponse.json({ error: 'La cuota no puede ser mayor que el préstamo' }, { status: 400 });
    const [fila] = await db
      .insert(empleadoPrestamos)
      .values({
        teamId: auth.teamId, empleadoId: empleado.id, montoCents: monto, cuotaCents: cuota,
        saldoCents: monto, desde, comentario, createdBy: auth.user.id,
      })
      .returning();
    return NextResponse.json({ prestamo: fila }, { status: 201 });
  }

  if (body.kind === 'concepto') {
    const conceptoId = Number(body.conceptoId);
    const monto = centavos(body.monto);
    if (!Number.isInteger(conceptoId)) return NextResponse.json({ error: 'Elige un concepto' }, { status: 400 });
    if (monto === null) return NextResponse.json({ error: 'El monto debe ser mayor que cero' }, { status: 400 });
    const fijo = body.fijo === true;
    const hasta = fijo && body.hasta ? body.hasta : null;
    if (hasta !== null && (!esFechaYMD(hasta) || hasta < desde)) {
      return NextResponse.json({ error: 'La fecha final no es válida' }, { status: 400 });
    }
    const [concepto] = await db
      .select({ id: nominaConceptos.id, activo: nominaConceptos.activo })
      .from(nominaConceptos)
      .where(and(eq(nominaConceptos.id, conceptoId), eq(nominaConceptos.teamId, auth.teamId)))
      .limit(1);
    if (!concepto || !concepto.activo) return NextResponse.json({ error: 'Concepto no encontrado' }, { status: 404 });

    const [fila] = await db
      .insert(empleadoConceptos)
      .values({
        teamId: auth.teamId, empleadoId: empleado.id, conceptoId, montoCents: monto, fijo,
        desde, hasta, comentario, createdBy: auth.user.id,
      })
      .returning();
    return NextResponse.json({ asignacion: fila }, { status: 201 });
  }

  return NextResponse.json({ error: 'kind debe ser concepto o prestamo' }, { status: 400 });
}

/**
 * DELETE /api/nomina/empleados/[id]/conceptos?asignacion=ID | ?prestamo=ID —
 * quita una asignación (no toca corridas ya hechas) o cancela un préstamo (deja
 * de descontarse; lo ya descontado queda en las corridas).
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;
  const empleado = await empleadoDelTeam(auth.teamId, (await params).id);
  if (!empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });

  const url = new URL(req.url);
  const asignacion = Number(url.searchParams.get('asignacion'));
  const prestamo = Number(url.searchParams.get('prestamo'));

  if (Number.isInteger(asignacion) && url.searchParams.has('asignacion')) {
    await db
      .update(empleadoConceptos)
      .set({ activo: false })
      .where(and(
        eq(empleadoConceptos.id, asignacion),
        eq(empleadoConceptos.empleadoId, empleado.id),
        eq(empleadoConceptos.teamId, auth.teamId),
      ));
    return NextResponse.json({ ok: true });
  }
  if (Number.isInteger(prestamo) && url.searchParams.has('prestamo')) {
    await db
      .update(empleadoPrestamos)
      .set({ estado: 'cancelado' })
      .where(and(
        eq(empleadoPrestamos.id, prestamo),
        eq(empleadoPrestamos.empleadoId, empleado.id),
        eq(empleadoPrestamos.teamId, auth.teamId),
        eq(empleadoPrestamos.estado, 'activo'),
      ));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Indica asignacion o prestamo' }, { status: 400 });
}
