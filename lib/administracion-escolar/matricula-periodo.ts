import { db } from '@/lib/db/drizzle';
import { adminEscolarMatriculas, adminEscolarPeriodos } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';

function normalizarNombre(nombre: string) {
  return nombre.trim().toLocaleLowerCase('es-DO');
}

function seSolapan(inicioA: string | null, finA: string | null, inicioB: string | null, finB: string | null) {
  if (!inicioA || !finA || !inicioB || !finB) return false;
  return inicioA <= finB && inicioB <= finA;
}

/**
 * Un estudiante solo puede tener una matrícula activa por año escolar. Además
 * del ID de período, compara nombre normalizado y rango de fechas: protege
 * contra dos registros de catálogo distintos que representan 2026-2027.
 */
export async function conflictoMatriculaActivaPorPeriodo({
  teamId, estudianteId, periodoId, excluirMatriculaId,
}: {
  teamId: number;
  estudianteId: number;
  periodoId: number;
  excluirMatriculaId?: number;
}): Promise<string | null> {
  const [periodoNuevo] = await db.select({
    id: adminEscolarPeriodos.id,
    nombre: adminEscolarPeriodos.nombre,
    fechaInicio: adminEscolarPeriodos.fechaInicio,
    fechaFin: adminEscolarPeriodos.fechaFin,
  }).from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId)))
    .limit(1);
  if (!periodoNuevo) return 'Período no encontrado';

  const condiciones = [
    eq(adminEscolarMatriculas.teamId, teamId),
    eq(adminEscolarMatriculas.estudianteId, estudianteId),
    eq(adminEscolarMatriculas.estado, 'activa'),
  ];
  if (excluirMatriculaId) condiciones.push(ne(adminEscolarMatriculas.id, excluirMatriculaId));
  const existentes = await db.select({
    periodoId: adminEscolarMatriculas.periodoId,
    periodo: adminEscolarPeriodos.nombre,
    fechaInicio: adminEscolarPeriodos.fechaInicio,
    fechaFin: adminEscolarPeriodos.fechaFin,
  }).from(adminEscolarMatriculas)
    .innerJoin(adminEscolarPeriodos, and(
      eq(adminEscolarMatriculas.periodoId, adminEscolarPeriodos.id),
      eq(adminEscolarPeriodos.teamId, teamId),
    ))
    .where(and(...condiciones));

  const conflicto = existentes.find((m) => (
    m.periodoId === periodoNuevo.id
    || normalizarNombre(m.periodo) === normalizarNombre(periodoNuevo.nombre)
    || seSolapan(m.fechaInicio, m.fechaFin, periodoNuevo.fechaInicio, periodoNuevo.fechaFin)
  ));
  return conflicto ? `El estudiante ya tiene una matrícula activa en el período ${conflicto.periodo}.` : null;
}
