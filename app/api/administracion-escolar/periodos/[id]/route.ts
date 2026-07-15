import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { rangoPeriodoEsValido } from '@/lib/administracion-escolar/periodo-utils';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:configurar');
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
  try {
    const [row] = await db.update(adminEscolarPeriodos)
      .set({
        ...(nombre !== undefined ? { nombre: nombre.trim() } : {}),
        ...(fechaInicio !== undefined ? { fechaInicio: fechaInicio || null } : {}),
        ...(fechaFin !== undefined ? { fechaFin: fechaFin || null } : {}),
        ...(activo !== undefined ? { activo } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId)))
      .returning();
    return NextResponse.json({ periodo: row });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'Ya existe un período con ese nombre.' }, { status: 409 });
    }
    throw err;
  }
}
