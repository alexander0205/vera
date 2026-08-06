import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos, adminEscolarMatriculas } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { rangoPeriodoEsValido } from '@/lib/administracion-escolar/periodo-utils';
import { eq, and, ne } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { nombre, fechaInicio, fechaFin, activo } = await req.json();
  const periodoId = parseInt(id, 10);
  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }
  const [existente] = await db.select({ fechaInicio: adminEscolarPeriodos.fechaInicio, fechaFin: adminEscolarPeriodos.fechaFin })
    .from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId)))
    .limit(1);
  if (!existente) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const inicioFinal = fechaInicio === undefined ? existente.fechaInicio : fechaInicio || null;
  const finFinal = fechaFin === undefined ? existente.fechaFin : fechaFin || null;
  if ((inicioFinal || finFinal) && !rangoPeriodoEsValido(inicioFinal, finFinal)) {
    return NextResponse.json({ error: 'Fecha de inicio y fin requeridas; el fin no puede ser anterior al inicio' }, { status: 400 });
  }
  // Apagar el único activo dejaría al colegio sin año en curso: no hay contra
  // qué matricular ni qué tarifa resolver. Para cambiar de año se activa el
  // otro, y este se apaga solo.
  if (activo === false) {
    return NextResponse.json(
      { error: 'Siempre tiene que haber un año escolar activo. Activa otro y este se desactiva solo.' },
      { status: 409 },
    );
  }

  try {
    const row = await db.transaction(async (tx) => {
      // Primero se apagan los demás: el índice único no admite ni un instante
      // con dos activos, así que el orden importa.
      if (activo === true) {
        await tx.update(adminEscolarPeriodos)
          .set({ activo: false, updatedAt: new Date() })
          .where(and(
            eq(adminEscolarPeriodos.teamId, teamId),
            eq(adminEscolarPeriodos.activo, true),
            ne(adminEscolarPeriodos.id, periodoId),
          ));
      }
      const [actualizado] = await tx.update(adminEscolarPeriodos)
        .set({
          ...(nombre !== undefined ? { nombre: nombre.trim() } : {}),
          ...(fechaInicio !== undefined ? { fechaInicio: fechaInicio || null } : {}),
          ...(fechaFin !== undefined ? { fechaFin: fechaFin || null } : {}),
          ...(activo !== undefined ? { activo } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId)))
        .returning();
      return actualizado;
    });
    return NextResponse.json({ periodo: row });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      const detalle = String((err as { constraint?: string }).constraint ?? '');
      return NextResponse.json({
        error: detalle.includes('un_activo')
          ? 'Ya hay otro año escolar activo.'
          : 'Ya existe un período con ese nombre.',
      }, { status: 409 });
    }
    throw err;
  }
}

/** Elimina un período. Bloquea si tiene matrículas. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const periodoId = parseInt(id, 10);
  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const [mat] = await db.select({ id: adminEscolarMatriculas.id }).from(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.periodoId, periodoId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (mat) {
    return NextResponse.json({ error: 'Este período tiene matrículas. No se puede eliminar.' }, { status: 409 });
  }

  const [row] = await db.delete(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId)))
    .returning({ id: adminEscolarPeriodos.id });
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
