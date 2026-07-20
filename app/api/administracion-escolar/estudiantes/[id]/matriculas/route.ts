import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  adminEscolarCursos,
} from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, and, desc } from 'drizzle-orm';

/** Historial de matrículas de un estudiante (más reciente primero). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
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
      facturaRecurrenteId: adminEscolarMatriculas.facturaRecurrenteId,
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
