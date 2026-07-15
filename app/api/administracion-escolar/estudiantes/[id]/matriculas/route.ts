import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  adminEscolarCursos,
} from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';

/** Historial de matrículas de un estudiante (más reciente primero). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;
  const rows = await db
    .select({
      id: adminEscolarMatriculas.id,
      periodoId: adminEscolarMatriculas.periodoId,
      periodo: adminEscolarPeriodos.nombre,
      periodoFechaInicio: adminEscolarPeriodos.fechaInicio,
      periodoFechaFin: adminEscolarPeriodos.fechaFin,
      cursoId: adminEscolarMatriculas.cursoId,
      curso: adminEscolarCursos.nombre,
      codigoMatricula: adminEscolarMatriculas.codigoMatricula,
      fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
      estado: adminEscolarMatriculas.estado,
      notas: adminEscolarMatriculas.notas,
    })
    .from(adminEscolarMatriculas)
    .leftJoin(adminEscolarPeriodos, eq(adminEscolarMatriculas.periodoId, adminEscolarPeriodos.id))
    .leftJoin(adminEscolarCursos, eq(adminEscolarMatriculas.cursoId, adminEscolarCursos.id))
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.estudianteId, parseInt(id)),
    ))
    .orderBy(desc(adminEscolarMatriculas.fechaInscripcion), desc(adminEscolarMatriculas.id));
  return NextResponse.json({ matriculas: rows });
}
