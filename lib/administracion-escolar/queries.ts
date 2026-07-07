/**
 * Consultas y helpers del módulo Administración Escolar.
 *
 * Enriquecimiento del estudiante (deuda total, matrícula activa, tutor
 * responsable, último pago) para el listado y la ficha lateral. Toda la lógica
 * de agregación vive aquí para no repetirla entre rutas.
 */
import 'server-only';
import { and, eq, desc, sql, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarEstudiantes,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
  adminEscolarCursos,
  adminEscolarTutores,
  adminEscolarEstudianteTutores,
  adminEscolarCargos,
  adminEscolarPagos,
} from '@/lib/db/schema';

/** Estados de cargo que cuentan como deuda viva. */
export const ESTADOS_DEUDA = ['pendiente', 'parcial', 'vencido'] as const;

export interface EstudianteEnriquecido {
  id: number;
  codigo: string | null;
  nombres: string;
  apellidos: string;
  estado: string;
  fechaNacimiento: string | null;
  // Derivados
  matriculaActivaId: number | null;
  periodoActivo: string | null;
  cursoActual: string | null;
  tutorResponsable: string | null;
  tutorTelefono: string | null;
  tutorEmail: string | null;
  deudaCentavos: number;
  cargosPendientes: number;
  ultimoPagoFecha: string | null;
  ultimoPagoCentavos: number | null;
}

/**
 * Listado de estudiantes del team con datos derivados. Un solo viaje por tabla
 * agregada (matrícula activa, tutor responsable, deuda, último pago) y merge en
 * memoria — evita N+1.
 */
export async function listarEstudiantesEnriquecidos(
  teamId: number,
): Promise<EstudianteEnriquecido[]> {
  const estudiantes = await db
    .select()
    .from(adminEscolarEstudiantes)
    .where(eq(adminEscolarEstudiantes.teamId, teamId))
    .orderBy(adminEscolarEstudiantes.apellidos, adminEscolarEstudiantes.nombres);

  if (estudiantes.length === 0) return [];
  const ids = estudiantes.map((e) => e.id);

  // Matrícula activa + período + curso por estudiante.
  const matriculas = await db
    .select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      periodo: adminEscolarPeriodos.nombre,
      curso: adminEscolarCursos.nombre,
    })
    .from(adminEscolarMatriculas)
    .leftJoin(adminEscolarPeriodos, eq(adminEscolarMatriculas.periodoId, adminEscolarPeriodos.id))
    .leftJoin(adminEscolarCursos, eq(adminEscolarMatriculas.cursoId, adminEscolarCursos.id))
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.estado, 'activa'),
      inArray(adminEscolarMatriculas.estudianteId, ids),
    ));
  const matriculaPorEst = new Map(matriculas.map((m) => [m.estudianteId, m]));

  // Tutor responsable de pago por estudiante.
  const tutores = await db
    .select({
      estudianteId: adminEscolarEstudianteTutores.estudianteId,
      nombre: adminEscolarTutores.nombre,
      telefono: adminEscolarTutores.telefono,
      email: adminEscolarTutores.email,
    })
    .from(adminEscolarEstudianteTutores)
    .innerJoin(adminEscolarTutores, eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id))
    .where(and(
      eq(adminEscolarEstudianteTutores.teamId, teamId),
      eq(adminEscolarEstudianteTutores.responsablePago, true),
      inArray(adminEscolarEstudianteTutores.estudianteId, ids),
    ));
  const tutorPorEst = new Map(tutores.map((t) => [t.estudianteId, t]));

  // Deuda viva (suma de saldo) + conteo de cargos pendientes por estudiante.
  const deudas = await db
    .select({
      estudianteId: adminEscolarCargos.estudianteId,
      deuda: sql<number>`COALESCE(SUM(${adminEscolarCargos.saldoCentavos}), 0)::int`,
      cargos: sql<number>`COUNT(*)::int`,
    })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      inArray(adminEscolarCargos.estado, [...ESTADOS_DEUDA]),
      inArray(adminEscolarCargos.estudianteId, ids),
    ))
    .groupBy(adminEscolarCargos.estudianteId);
  const deudaPorEst = new Map(deudas.map((d) => [d.estudianteId, d]));

  // Último pago por estudiante.
  const pagos = await db
    .select({
      estudianteId: adminEscolarPagos.estudianteId,
      fecha: adminEscolarPagos.fechaPago,
      monto: adminEscolarPagos.montoCentavos,
      createdAt: adminEscolarPagos.createdAt,
    })
    .from(adminEscolarPagos)
    .where(and(
      eq(adminEscolarPagos.teamId, teamId),
      inArray(adminEscolarPagos.estudianteId, ids),
    ))
    .orderBy(desc(adminEscolarPagos.fechaPago), desc(adminEscolarPagos.createdAt));
  const ultimoPagoPorEst = new Map<number, { fecha: string; monto: number }>();
  for (const p of pagos) {
    if (!ultimoPagoPorEst.has(p.estudianteId)) {
      ultimoPagoPorEst.set(p.estudianteId, { fecha: p.fecha, monto: p.monto });
    }
  }

  return estudiantes.map((e) => {
    const m = matriculaPorEst.get(e.id);
    const t = tutorPorEst.get(e.id);
    const d = deudaPorEst.get(e.id);
    const up = ultimoPagoPorEst.get(e.id);
    return {
      id: e.id,
      codigo: e.codigo,
      nombres: e.nombres,
      apellidos: e.apellidos,
      estado: e.estado,
      fechaNacimiento: e.fechaNacimiento,
      matriculaActivaId: m?.id ?? null,
      periodoActivo: m?.periodo ?? null,
      cursoActual: m?.curso ?? null,
      tutorResponsable: t?.nombre ?? null,
      tutorTelefono: t?.telefono ?? null,
      tutorEmail: t?.email ?? null,
      deudaCentavos: d?.deuda ?? 0,
      cargosPendientes: d?.cargos ?? 0,
      ultimoPagoFecha: up?.fecha ?? null,
      ultimoPagoCentavos: up?.monto ?? null,
    };
  });
}

/** Deuda viva total (centavos) de un estudiante. */
export async function deudaEstudiante(teamId: number, estudianteId: number): Promise<number> {
  const [row] = await db
    .select({ deuda: sql<number>`COALESCE(SUM(${adminEscolarCargos.saldoCentavos}), 0)::int` })
    .from(adminEscolarCargos)
    .where(and(
      eq(adminEscolarCargos.teamId, teamId),
      eq(adminEscolarCargos.estudianteId, estudianteId),
      inArray(adminEscolarCargos.estado, [...ESTADOS_DEUDA]),
    ));
  return row?.deuda ?? 0;
}
