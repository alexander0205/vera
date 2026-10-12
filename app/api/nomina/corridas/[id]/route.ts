import { NextResponse } from 'next/server';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { empleados, nominaCorridas, nominaHoras, nominaLineas, nominaObligaciones } from '@/lib/db/schema';
import { frecuenciaDeTipo, normalizarTipoCorrida } from '@/lib/nomina/corrida';

export const dynamic = 'force-dynamic';

/** GET /api/nomina/corridas/[id] — una corrida con sus líneas y obligaciones. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'empleados:ver');
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [corrida] = await db
    .select()
    .from(nominaCorridas)
    .where(and(eq(nominaCorridas.id, id), eq(nominaCorridas.teamId, auth.teamId)))
    .limit(1);

  if (!corrida) return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });

  const lineas = await db
    .select()
    .from(nominaLineas)
    .where(eq(nominaLineas.corridaId, id))
    .orderBy(asc(nominaLineas.nombre));

  const obligaciones = await db
    .select()
    .from(nominaObligaciones)
    .where(eq(nominaObligaciones.corridaId, id))
    .orderBy(asc(nominaObligaciones.destino));

  // Horas de quien cobra por hora que siguen pendientes en estas fechas: la
  // corrida solo paga las aprobadas, así que se avisa antes de aprobarla.
  const tipo = normalizarTipoCorrida(corrida.tipo);
  const [{ pendientes }] = tipo
    ? await db
        .select({ pendientes: sql<number>`count(*)::int` })
        .from(nominaHoras)
        .innerJoin(empleados, eq(empleados.id, nominaHoras.empleadoId))
        .where(and(
          eq(nominaHoras.teamId, auth.teamId),
          eq(nominaHoras.estado, 'pendiente'),
          eq(empleados.frecuenciaPago, frecuenciaDeTipo(tipo)),
          gte(nominaHoras.fecha, corrida.fechaInicio),
          lte(nominaHoras.fecha, corrida.fechaFin),
        ))
    : [{ pendientes: 0 }];

  return NextResponse.json({ corrida, lineas, obligaciones, horasPendientes: pendientes });
}

/**
 * DELETE /api/nomina/corridas/[id] — borra una corrida SOLO si es borrador.
 * Aprobada o pagada ya tiene efectos contables: no se borra, se maneja aparte.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:correr');
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [corrida] = await db
    .select()
    .from(nominaCorridas)
    .where(and(eq(nominaCorridas.id, id), eq(nominaCorridas.teamId, auth.teamId)))
    .limit(1);

  if (!corrida) return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });
  if (corrida.estado !== 'borrador') {
    return NextResponse.json({ error: 'Solo se puede eliminar una corrida en borrador' }, { status: 409 });
  }

  // Las líneas caen por ON DELETE CASCADE.
  await db.delete(nominaCorridas).where(eq(nominaCorridas.id, id));
  return NextResponse.json({ ok: true });
}
