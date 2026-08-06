import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  adminEscolarCursos,
  adminEscolarCargos,
  adminEscolarPagos,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { conflictoMatriculaActivaPorPeriodo } from '@/lib/administracion-escolar/matricula-periodo';
import { eq, and, count } from 'drizzle-orm';

const ESTADOS = ['activa', 'finalizada', 'retirada', 'anulada'];

/**
 * Edita una matrícula existente (período, curso, fecha de inscripción, estado,
 * código, notas). NO toca el código del estudiante: éste queda ligado al año de
 * la PRIMERA inscripción y es inmutable — cambiar aquí el período de una
 * matrícula ya creada no lo regenera.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { periodoId, cursoId, fechaInscripcion, estado, codigoMatricula, notas } = await req.json();
  const matriculaId = parseInt(id, 10);
  const [actual] = await db.select({ estudianteId: adminEscolarMatriculas.estudianteId, periodoId: adminEscolarMatriculas.periodoId, estado: adminEscolarMatriculas.estado })
    .from(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (!actual) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

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
  const periodoFinal = periodoId === undefined ? actual.periodoId : Number(periodoId);
  const estadoFinal = estado !== undefined && ESTADOS.includes(estado) ? estado : actual.estado;
  if (estadoFinal === 'activa') {
    const conflicto = await conflictoMatriculaActivaPorPeriodo({
      teamId, estudianteId: actual.estudianteId, periodoId: periodoFinal, excluirMatriculaId: matriculaId,
    });
    if (conflicto) return NextResponse.json({ error: conflicto }, { status: 409 });
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
      .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)))
      .returning();
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

/**
 * Borra una matrícula, solo si nunca movió dinero.
 *
 * Existe para deshacer el error de dedo —matriculaste al alumno en la sección
 * equivocada y quieres que no quede rastro—, no para dar de baja a nadie. Para
 * eso está el estado: `retirada` si el alumno se fue, `anulada` si la matrícula
 * no debió existir. Ambas conservan el historial, que es lo que un colegio
 * necesita cuando alguien pide una certificación tres años después.
 *
 * Por eso se niega en cuanto hay cargos, pagos o un plan de mensualidad
 * colgando: borrar ahí dejaría deuda y cobros apuntando a una matrícula que ya
 * no existe, y el plan seguiría generando cargos huérfanos cada mes.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const matriculaId = parseInt(id, 10);
  if (!Number.isFinite(matriculaId)) {
    return NextResponse.json({ error: 'Matrícula no válida' }, { status: 400 });
  }

  const [actual] = await db
    .select({ id: adminEscolarMatriculas.id, facturaRecurrenteId: adminEscolarMatriculas.facturaRecurrenteId })
    .from(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (!actual) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  const [[cargos], [pagos]] = await Promise.all([
    db.select({ total: count() }).from(adminEscolarCargos)
      .where(and(eq(adminEscolarCargos.matriculaId, matriculaId), eq(adminEscolarCargos.teamId, teamId))),
    db.select({ total: count() }).from(adminEscolarPagos)
      .where(and(eq(adminEscolarPagos.matriculaId, matriculaId), eq(adminEscolarPagos.teamId, teamId))),
  ]);

  if (pagos.total > 0) {
    return NextResponse.json({
      error: `No se puede borrar: tiene ${pagos.total} pago(s) registrado(s). Cámbiale el estado a "anulada" o "retirada".`,
    }, { status: 409 });
  }
  if (cargos.total > 0) {
    return NextResponse.json({
      error: `No se puede borrar: tiene ${cargos.total} cargo(s) generado(s). Anula los cargos primero, o cámbiale el estado a "anulada".`,
    }, { status: 409 });
  }
  if (actual.facturaRecurrenteId) {
    return NextResponse.json({
      error: 'No se puede borrar: tiene un plan de mensualidad activo. Quítale el plan primero.',
    }, { status: 409 });
  }

  await db.delete(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)));
  return NextResponse.json({ ok: true });
}
