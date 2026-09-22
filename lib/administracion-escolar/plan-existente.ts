/**
 * Detección y validación de planes recurrentes YA existentes que pueden
 * vincularse a una matrícula.
 *
 * El flujo "Configurar mensualidad" CREA un plan nuevo. Pero un colegio que ya
 * facturaba con planes recurrentes (creados en Facturación, antes de gobernanza)
 * los tiene sueltos: gobernanza no los conoce, así que devenga la deuda por su
 * lado mientras el plan emite la factura por el suyo = doble. Aquí se detectan
 * esos planes para poder ENLAZAR el que ya existe en vez de crear otro.
 *
 * Igual que el guard de vincular factura, se acepta el plan de CUALQUIER tutor
 * del alumno (no solo el responsable de pago): es normal que el plan lo haya
 * abierto el otro padre.
 */

import { db } from '@/lib/db/drizzle';
import {
  adminEscolarMatriculas, adminEscolarEstudiantes, adminEscolarEstudianteTutores,
  adminEscolarTutores, facturasRecurrentes,
} from '@/lib/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';

export interface PlanVinculable {
  id: number;
  nombre: string;
  clientId: number | null;
  frecuencia: string;
  proximaEmision: string;
  totalEstimadoCentavos: number;
  /** Por qué se sugiere: el plan menciona al alumno, o su cliente es tutor. */
  motivo: 'dependiente' | 'tutor';
}

/** Contexto del alumno de una matrícula: su dependiente y sus clientes-tutor. */
async function contextoAlumno(teamId: number, matriculaId: number) {
  const [m] = await db
    .select({
      matriculaId: adminEscolarMatriculas.id,
      estado: adminEscolarMatriculas.estado,
      yaVinculada: adminEscolarMatriculas.facturaRecurrenteId,
      estudianteId: adminEscolarMatriculas.estudianteId,
      dependienteId: adminEscolarEstudiantes.dependienteId,
      responsable: adminEscolarEstudiantes.facturarAClientId,
    })
    .from(adminEscolarMatriculas)
    .innerJoin(adminEscolarEstudiantes, eq(adminEscolarMatriculas.estudianteId, adminEscolarEstudiantes.id))
    .where(and(eq(adminEscolarMatriculas.id, matriculaId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (!m) return null;

  const tutores = await db
    .select({ clientId: adminEscolarTutores.clientId })
    .from(adminEscolarEstudianteTutores)
    .innerJoin(adminEscolarTutores, eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id))
    .where(and(
      eq(adminEscolarEstudianteTutores.teamId, teamId),
      eq(adminEscolarEstudianteTutores.estudianteId, m.estudianteId),
    ));

  const clientesValidos = new Set<number>();
  if (m.responsable != null) clientesValidos.add(m.responsable);
  for (const t of tutores) if (t.clientId != null) clientesValidos.add(t.clientId);

  return { ...m, clientesValidos };
}

/** ¿Los items del plan mencionan a este dependiente? (items es JSON texto). */
function itemsMencionanDependiente(items: string, dependienteId: number | null): boolean {
  if (dependienteId == null) return false;
  try {
    const arr = JSON.parse(items);
    return Array.isArray(arr) && arr.some((l) => Number(l?.dependienteId) === dependienteId);
  } catch {
    return false;
  }
}

/**
 * Planes recurrentes existentes vinculables a la matrícula: activos, aún NO
 * ligados a ninguna matrícula, y que o mencionan al alumno o pertenecen a un
 * tutor suyo. Vacío si la matrícula ya está vinculada o no aplica.
 */
export async function planesVinculablesParaMatricula(
  teamId: number,
  matriculaId: number,
): Promise<PlanVinculable[]> {
  const ctx = await contextoAlumno(teamId, matriculaId);
  if (!ctx || ctx.estado !== 'activa' || ctx.yaVinculada) return [];

  // Planes del team ya ligados a alguna matrícula: no se sugieren.
  const ligados = new Set(
    (await db
      .select({ id: adminEscolarMatriculas.facturaRecurrenteId })
      .from(adminEscolarMatriculas)
      .where(and(eq(adminEscolarMatriculas.teamId, teamId), isNotNull(adminEscolarMatriculas.facturaRecurrenteId))))
      .map((r) => r.id!)
      .filter((id): id is number => id != null),
  );

  const planes = await db
    .select({
      id: facturasRecurrentes.id,
      nombre: facturasRecurrentes.nombre,
      clientId: facturasRecurrentes.clientId,
      frecuencia: facturasRecurrentes.frecuencia,
      proximaEmision: facturasRecurrentes.proximaEmision,
      totalEstimado: facturasRecurrentes.totalEstimado,
      items: facturasRecurrentes.items,
    })
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.teamId, teamId), eq(facturasRecurrentes.estado, 'activa')));

  const out: PlanVinculable[] = [];
  for (const p of planes) {
    if (ligados.has(p.id)) continue;
    const porDependiente = itemsMencionanDependiente(p.items, ctx.dependienteId);
    const porTutor = p.clientId != null && ctx.clientesValidos.has(p.clientId);
    if (!porDependiente && !porTutor) continue;
    out.push({
      id: p.id,
      nombre: p.nombre,
      clientId: p.clientId,
      frecuencia: p.frecuencia,
      proximaEmision: p.proximaEmision,
      totalEstimadoCentavos: p.totalEstimado,
      motivo: porDependiente ? 'dependiente' : 'tutor',
    });
  }
  return out;
}

/** ¿Este plan concreto es vinculable a esta matrícula? Para validar el POST. */
export async function planEsVinculable(
  teamId: number,
  matriculaId: number,
  planId: number,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const ctx = await contextoAlumno(teamId, matriculaId);
  if (!ctx) return { ok: false, error: 'Matrícula no encontrada', status: 404 };
  if (ctx.estado !== 'activa') return { ok: false, error: 'La matrícula no está activa', status: 409 };
  if (ctx.yaVinculada) return { ok: false, error: 'La matrícula ya tiene un plan de mensualidad vinculado', status: 409 };

  const [plan] = await db
    .select({ id: facturasRecurrentes.id, clientId: facturasRecurrentes.clientId, items: facturasRecurrentes.items, estado: facturasRecurrentes.estado })
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, planId), eq(facturasRecurrentes.teamId, teamId)))
    .limit(1);
  if (!plan) return { ok: false, error: 'Plan recurrente no encontrado', status: 404 };
  if (plan.estado !== 'activa') return { ok: false, error: 'El plan recurrente no está activo', status: 409 };

  const porDependiente = itemsMencionanDependiente(plan.items, ctx.dependienteId);
  const porTutor = plan.clientId != null && ctx.clientesValidos.has(plan.clientId);
  if (!porDependiente && !porTutor) {
    return { ok: false, error: 'El plan no pertenece a un tutor de este alumno ni lo menciona', status: 422 };
  }
  return { ok: true };
}
