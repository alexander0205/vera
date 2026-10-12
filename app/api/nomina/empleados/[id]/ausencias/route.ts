import { NextResponse } from 'next/server';
import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaAusencias } from '@/lib/db/schema';
import {
  AUSENCIAS_MAX_POR_EMPLEADO, AUSENCIA_DIAS_MAX, LABEL_AUSENCIA, diasEntre, esTipoAusencia,
} from '@/lib/nomina/ausencias';
import { fechaRazonable, limpiarTexto } from '@/lib/nomina/conceptos';

export const dynamic = 'force-dynamic';

const error = (mensaje: string, status = 400) => NextResponse.json({ error: mensaje }, { status });

async function empleadoDelTeam(teamId: number, idRaw: string) {
  if (!/^\d{1,9}$/.test(idRaw)) return null;
  const [fila] = await db
    .select({ id: empleados.id })
    .from(empleados)
    .where(and(eq(empleados.id, Number(idRaw)), eq(empleados.teamId, teamId)))
    .limit(1);
  return fila ?? null;
}

/** GET /api/nomina/empleados/[id]/ausencias — faltas y licencias, las recientes primero. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;
  const empleado = await empleadoDelTeam(auth.teamId, (await params).id);
  if (!empleado) return error('Empleado no encontrado', 404);

  const ausencias = await db
    .select({
      id: nominaAusencias.id, tipo: nominaAusencias.tipo, desde: nominaAusencias.desde,
      hasta: nominaAusencias.hasta, comentario: nominaAusencias.comentario,
    })
    .from(nominaAusencias)
    .where(and(eq(nominaAusencias.teamId, auth.teamId), eq(nominaAusencias.empleadoId, empleado.id), eq(nominaAusencias.activo, true)))
    .orderBy(desc(nominaAusencias.desde), asc(nominaAusencias.id))
    .limit(AUSENCIAS_MAX_POR_EMPLEADO);
  return NextResponse.json({ ausencias: ausencias.map((a) => ({ ...a, dias: diasEntre(a.desde, a.hasta) })) });
}

/**
 * POST /api/nomina/empleados/[id]/ausencias
 *   { tipo: 'falta' | 'licencia_sin_pago' | 'licencia_con_pago', desde, hasta?, comentario? }
 * Sin `hasta` es un solo día. No se aceptan rangos que se pisen con otra ausencia
 * del mismo empleado: un día no puede ser falta y licencia a la vez.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;
  const empleado = await empleadoDelTeam(auth.teamId, (await params).id);
  if (!empleado) return error('Empleado no encontrado', 404);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Cuerpo inválido');
  if (!esTipoAusencia(body.tipo)) return error('Elige el tipo: falta, licencia sin pago o licencia con pago');
  const tipo = body.tipo;
  if (!fechaRazonable(body.desde)) return error('La fecha de inicio no es válida (entre 2000 y 2100)');
  const desde = body.desde;
  let hasta = desde;
  if (body.hasta !== undefined && body.hasta !== null && body.hasta !== '') {
    if (!fechaRazonable(body.hasta)) return error('La fecha final no es válida');
    if (body.hasta < desde) return error('La fecha final no puede ser anterior a la de inicio');
    hasta = body.hasta;
  }
  if (diasEntre(desde, hasta) > AUSENCIA_DIAS_MAX) return error(`Una ausencia no puede pasar de ${AUSENCIA_DIAS_MAX} días`);
  const comentario = limpiarTexto(body.comentario, 300);

  const resultado = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ausencia:${auth.teamId}:${empleado.id}`}))`);
    const [{ n }] = await tx.select({ n: count() }).from(nominaAusencias)
      .where(and(eq(nominaAusencias.teamId, auth.teamId), eq(nominaAusencias.empleadoId, empleado.id), eq(nominaAusencias.activo, true)));
    if (Number(n) >= AUSENCIAS_MAX_POR_EMPLEADO) return { error: `Este empleado ya tiene ${AUSENCIAS_MAX_POR_EMPLEADO} ausencias registradas`, status: 409 };

    const [choque] = await tx
      .select({ tipo: nominaAusencias.tipo, desde: nominaAusencias.desde, hasta: nominaAusencias.hasta })
      .from(nominaAusencias)
      .where(and(
        eq(nominaAusencias.teamId, auth.teamId), eq(nominaAusencias.empleadoId, empleado.id), eq(nominaAusencias.activo, true),
        lte(nominaAusencias.desde, hasta), gte(nominaAusencias.hasta, desde),
      ))
      .limit(1);
    if (choque) {
      const nombre = esTipoAusencia(choque.tipo) ? LABEL_AUSENCIA[choque.tipo].toLowerCase() : 'ausencia';
      return { error: `Se cruza con una ${nombre} del ${choque.desde} al ${choque.hasta}. Quita esa primero o ajusta las fechas.`, status: 409 };
    }
    const [fila] = await tx.insert(nominaAusencias)
      .values({ teamId: auth.teamId, empleadoId: empleado.id, tipo, desde, hasta, comentario, createdBy: auth.user.id })
      .returning();
    return { fila };
  });
  if ('error' in resultado) return error(resultado.error ?? 'Error', resultado.status);
  return NextResponse.json({ ausencia: { ...resultado.fila, dias: diasEntre(desde, hasta) } }, { status: 201 });
}

/** DELETE /api/nomina/empleados/[id]/ausencias?ausencia=ID — la quita. No toca corridas ya aprobadas. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:gestionar');
  if (!auth.ok) return auth.response;
  const empleado = await empleadoDelTeam(auth.teamId, (await params).id);
  if (!empleado) return error('Empleado no encontrado', 404);
  const id = new URL(req.url).searchParams.get('ausencia');
  if (id === null || !/^\d{1,9}$/.test(id)) return error('ID inválido');
  const quitadas = await db.update(nominaAusencias).set({ activo: false })
    .where(and(eq(nominaAusencias.id, Number(id)), eq(nominaAusencias.empleadoId, empleado.id), eq(nominaAusencias.teamId, auth.teamId), eq(nominaAusencias.activo, true)))
    .returning({ id: nominaAusencias.id });
  return quitadas.length > 0 ? NextResponse.json({ ok: true }) : error('Ausencia no encontrada', 404);
}
