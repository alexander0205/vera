import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarMatriculas,
  adminEscolarEstudiantes,
  adminEscolarPeriodos,
  adminEscolarCursos,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { conflictoMatriculaActivaPorPeriodo } from '@/lib/administracion-escolar/matricula-periodo';
import { validarPertenencia } from '@/lib/administracion-escolar/pertenencia';
import { eq, and, desc } from 'drizzle-orm';

const ESTADOS = ['activa', 'finalizada', 'retirada', 'anulada'];

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const periodoId = req.nextUrl.searchParams.get('periodoId');

  const where = [eq(adminEscolarMatriculas.teamId, teamId)];
  if (periodoId) where.push(eq(adminEscolarMatriculas.periodoId, parseInt(periodoId)));

  const rows = await db
    .select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      estudiante: adminEscolarEstudiantes.nombres,
      estudianteApellidos: adminEscolarEstudiantes.apellidos,
      periodoId: adminEscolarMatriculas.periodoId,
      periodo: adminEscolarPeriodos.nombre,
      cursoId: adminEscolarMatriculas.cursoId,
      curso: adminEscolarCursos.nombre,
      codigoMatricula: adminEscolarMatriculas.codigoMatricula,
      fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
      estado: adminEscolarMatriculas.estado,
      notas: adminEscolarMatriculas.notas,
    })
    .from(adminEscolarMatriculas)
    .leftJoin(adminEscolarEstudiantes, and(
      eq(adminEscolarMatriculas.estudianteId, adminEscolarEstudiantes.id),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .leftJoin(adminEscolarPeriodos, and(
      eq(adminEscolarMatriculas.periodoId, adminEscolarPeriodos.id),
      eq(adminEscolarPeriodos.teamId, teamId),
    ))
    .leftJoin(adminEscolarCursos, and(
      eq(adminEscolarMatriculas.cursoId, adminEscolarCursos.id),
      eq(adminEscolarCursos.teamId, teamId),
    ))
    .where(and(...where))
    .orderBy(desc(adminEscolarMatriculas.fechaInscripcion), desc(adminEscolarMatriculas.id));
  return NextResponse.json({ matriculas: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { estudianteId, periodoId, cursoId, codigoMatricula, fechaInscripcion, estado, notas } = await req.json();
  if (!estudianteId || !periodoId || !cursoId) {
    return NextResponse.json({ error: 'estudianteId, periodoId y cursoId son requeridos' }, { status: 400 });
  }
  // Los tres ids vienen del cliente: hay que confirmar que son de este colegio
  // antes de crear la matrícula.
  const ajeno = await validarPertenencia(teamId, {
    estudiante: estudianteId,
    periodo:    periodoId,
    curso:      cursoId,
  });
  if (ajeno) return NextResponse.json({ error: ajeno }, { status: 404 });

  const estadoNorm = ESTADOS.includes(estado) ? estado : 'activa';
  if (estadoNorm === 'activa') {
    const conflicto = await conflictoMatriculaActivaPorPeriodo({ teamId, estudianteId, periodoId });
    if (conflicto) return NextResponse.json({ error: conflicto }, { status: 409 });
  }

  try {
    const [row] = await db.insert(adminEscolarMatriculas).values({
      teamId,
      estudianteId,
      periodoId,
      cursoId,
      codigoMatricula: codigoMatricula?.trim() || null,
      fechaInscripcion: fechaInscripcion || null,
      estado: estadoNorm,
      notas: notas?.trim() || null,
    }).returning();
    return NextResponse.json({ matricula: row });
  } catch (err: unknown) {
    // Choque con el índice parcial: ya hay una matrícula activa en ese período.
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json(
        { error: 'El estudiante ya tiene una matrícula activa en este período.' },
        { status: 409 },
      );
    }
    throw err;
  }
}
