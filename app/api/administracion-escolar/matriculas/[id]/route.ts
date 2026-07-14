import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  adminEscolarCursos,
} from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

const ESTADOS = ['activa', 'finalizada', 'retirada', 'anulada'];

/**
 * Edita una matrícula existente (período, curso, fecha de inscripción, estado,
 * código, notas). NO toca el código del estudiante: éste queda ligado al año de
 * la PRIMERA inscripción y es inmutable — cambiar aquí el período de una
 * matrícula ya creada no lo regenera.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { periodoId, cursoId, fechaInscripcion, estado, codigoMatricula, notas } = await req.json();

  // Validar período/curso (si vienen) contra el team.
  if (periodoId !== undefined) {
    const [per] = await db.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.id, Number(periodoId)), eq(adminEscolarPeriodos.teamId, teamId))).limit(1);
    if (!per) return NextResponse.json({ error: 'Período no encontrado' }, { status: 404 });
  }
  if (cursoId !== undefined) {
    const [cur] = await db.select({ id: adminEscolarCursos.id }).from(adminEscolarCursos)
      .where(and(eq(adminEscolarCursos.id, Number(cursoId)), eq(adminEscolarCursos.teamId, teamId))).limit(1);
    if (!cur) return NextResponse.json({ error: 'Curso no encontrado' }, { status: 404 });
  }

  try {
    const [row] = await db.update(adminEscolarMatriculas)
      .set({
        ...(periodoId !== undefined ? { periodoId: Number(periodoId) } : {}),
        ...(cursoId !== undefined ? { cursoId: Number(cursoId) } : {}),
        ...(fechaInscripcion !== undefined ? { fechaInscripcion: fechaInscripcion || null } : {}),
        ...(estado !== undefined && ESTADOS.includes(estado) ? { estado } : {}),
        ...(codigoMatricula !== undefined ? { codigoMatricula: codigoMatricula?.trim() || null } : {}),
        ...(notas !== undefined ? { notas: notas?.trim() || null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(adminEscolarMatriculas.id, parseInt(id)), eq(adminEscolarMatriculas.teamId, teamId)))
      .returning();
    if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
    return NextResponse.json({ matricula: row });
  } catch (err: unknown) {
    // Choque con el índice parcial: ya hay otra matrícula activa en ese período.
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json(
        { error: 'El estudiante ya tiene otra matrícula activa en este período.' },
        { status: 409 },
      );
    }
    throw err;
  }
}
