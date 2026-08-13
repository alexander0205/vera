/**
 * El plan de cobro de UNA matrícula ya existente.
 *
 * Vive aquí y no dentro de la ruta porque lo piden dos sitios: el endpoint
 * `/matriculas/[id]/plan` (GET y POST) y la ficha del estudiante, que trae los
 * planes de todas sus matrículas de una vez para no encadenar peticiones.
 *
 * Es la MISMA fuente que usa el devengo. Esa es la gracia: la ficha del alumno
 * puede enseñar los meses que aún no son deuda sabiendo que, cuando lleguen,
 * van a salir con estos importes y estas fechas.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarMatriculas } from '@/lib/db/schema';
import { contextoDeSeccion } from '@/lib/administracion-escolar/tarifas';
import { armarPlanDeCobro, type LineaPlan } from '@/lib/administracion-escolar/plan-cobro';

export interface PlanCargado {
  estudianteId: number;
  periodoId: number;
  lineas: LineaPlan[];
  /** Solo las matrículas activas devengan. */
  devenga: boolean;
}

export async function cargarPlan(teamId: number, matriculaId: number): Promise<PlanCargado | null> {
  const [matricula] = await db
    .select({
      estudianteId: adminEscolarMatriculas.estudianteId,
      periodoId: adminEscolarMatriculas.periodoId,
      cursoId: adminEscolarMatriculas.cursoId,
      fechaInscripcion: adminEscolarMatriculas.fechaInscripcion,
      becaTipo: adminEscolarMatriculas.becaTipo,
      becaValor: adminEscolarMatriculas.becaValor,
      conceptosIds: adminEscolarMatriculas.conceptosIds,
      estado: adminEscolarMatriculas.estado,
    })
    .from(adminEscolarMatriculas)
    .where(and(
      eq(adminEscolarMatriculas.id, matriculaId),
      eq(adminEscolarMatriculas.teamId, teamId),
    ))
    .limit(1);

  if (!matricula) return null;

  const base = {
    estudianteId: matricula.estudianteId,
    periodoId: matricula.periodoId,
    devenga: matricula.estado === 'activa',
  };

  const ctx = await contextoDeSeccion(teamId, matricula.periodoId, matricula.cursoId, {
    tipo: matricula.becaTipo,
    valor: matricula.becaValor,
  });
  if (!ctx) return { ...base, lineas: [], devenga: false };

  const desde = String(matricula.fechaInscripcion ?? new Date().toISOString().slice(0, 10));
  const plan = await armarPlanDeCobro(teamId, ctx, desde);

  // Los conceptos que se desmarcaron al matricular no se van a devengar nunca,
  // así que tampoco se anuncian. La lista vacía es el caso de las matrículas
  // anteriores a la migración 0114: ahí no hay nada que filtrar y se devuelve
  // todo, igual que hace el devengo.
  const elegidos = new Set(matricula.conceptosIds ?? []);
  return {
    ...base,
    lineas: elegidos.size > 0 ? plan.filter((l) => elegidos.has(l.conceptoId)) : plan,
  };
}
