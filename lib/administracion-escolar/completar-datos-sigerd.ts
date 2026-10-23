/**
 * «Completar datos desde SIGERD»: llenar RNE, sexo y fecha de nacimiento de los
 * estudiantes que ya están en Zero con lo que la descarga trajo en sus fichas.
 *
 * Cero llamadas al portal: todo sale de `sigerd_importaciones`. Por eso se puede
 * pulsar tantas veces como se quiera y, si la descarga no cambió, la segunda
 * vez no encuentra nada que hacer.
 *
 * Qué decide y qué no: la decisión (qué campos, qué RNE chocan) es lógica pura
 * en `lib/sigerd/datos-estudiante.ts`, con sus pruebas. Aquí solo se leen los
 * estudiantes, se aplica el plan y se invalida el caché.
 *
 * Solo toca estudiantes ACTIVOS con `sigerd_id`, y solo campos vacíos: lo que
 * alguien escribió a mano no se pisa. Las escrituras llevan `coalesce` además
 * de la comprobación en memoria, para que dos pulsaciones a la vez no se
 * sobrescriban entre sí.
 */
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes } from '@/lib/db/schema';
import { invalidarSigerd } from '@/lib/cache/escolar';
import {
  claveRne, datosDesdeFichas, planearCompletado,
  type CamposACompletar, type EstudianteParaCompletar,
} from '@/lib/sigerd/datos-estudiante';
import { ultimoDumpSigerd } from '@/lib/sigerd/ultimo-dump';

export interface ResultadoCompletar {
  /** Estudiantes activos con id de SIGERD que se miraron. */
  revisados: number;
  /** A cuántos se les llenó al menos un campo. */
  completados: number;
  /** Su id de SIGERD no tiene ficha en la descarga (conviene volver a bajar). */
  sinFicha: number;
  /** Su RNE ya lo usa otro estudiante del colegio: ese campo no se escribió. */
  rneRepetido: number;
  /** No hay ninguna descarga de SIGERD: no había de dónde sacar nada. */
  sinDescarga: boolean;
}

/** Escrituras en paralelo por tanda: rápido sin saturar el pooler de la base. */
const TANDA = 20;

/**
 * @param dumpYaCargado El volcado, si quien llama ya lo leyó (`cruzarEstudiantes`):
 *   pesa varios MB con las fichas y no hay por qué leerlo dos veces.
 */
export async function completarDatosDesdeSigerd(
  teamId: number,
  dumpYaCargado?: Record<string, unknown> | null,
): Promise<ResultadoCompletar> {
  const dump = dumpYaCargado ?? (await ultimoDumpSigerd(teamId))?.dump ?? null;
  if (!dump) {
    return { revisados: 0, completados: 0, sinFicha: 0, rneRepetido: 0, sinDescarga: true };
  }

  const datos = datosDesdeFichas(dump.estudianteFichas);

  // TODOS los estudiantes del colegio, no solo los activos: un RNE que tiene un
  // alumno retirado también es de ese alumno, y la guarda tiene que verlo.
  const todos = await db
    .select({
      id: adminEscolarEstudiantes.id,
      estado: adminEscolarEstudiantes.estado,
      sigerdId: adminEscolarEstudiantes.sigerdId,
      codigo: adminEscolarEstudiantes.codigo,
      codigoRne: adminEscolarEstudiantes.codigoRne,
      sexo: adminEscolarEstudiantes.sexo,
      fechaNacimiento: adminEscolarEstudiantes.fechaNacimiento,
    })
    .from(adminEscolarEstudiantes)
    .where(eq(adminEscolarEstudiantes.teamId, teamId));

  // RNE ocupados: en `codigo_rne` y en `codigo` (el enriquecimiento viejo,
  // `aplicarFichas`, guardaba el RNE como código del alumno).
  const rneEnUso = new Map<string, number[]>();
  const ocupar = (rne: string | null, id: number) => {
    if (!rne || rne.trim() === '') return;
    const k = claveRne(rne);
    rneEnUso.set(k, [...(rneEnUso.get(k) ?? []), id]);
  };
  for (const e of todos) { ocupar(e.codigoRne, e.id); ocupar(e.codigo, e.id); }

  const activos: EstudianteParaCompletar[] = todos
    .filter((e) => e.estado === 'activo' && e.sigerdId != null)
    .map((e) => ({
      id: e.id, sigerdId: e.sigerdId!, codigoRne: e.codigoRne,
      sexo: e.sexo, fechaNacimiento: e.fechaNacimiento,
    }));

  const plan = planearCompletado(activos, datos, rneEnUso);

  const col = adminEscolarEstudiantes;
  for (let i = 0; i < plan.cambios.length; i += TANDA) {
    await Promise.all(plan.cambios.slice(i, i + TANDA).map(({ id, campos }: { id: number; campos: CamposACompletar }) =>
      db.update(adminEscolarEstudiantes)
        .set({
          ...(campos.codigoRne ? { codigoRne: sql`coalesce(nullif(${col.codigoRne}, ''), ${campos.codigoRne})` } : {}),
          ...(campos.sexo ? { sexo: sql`coalesce(nullif(${col.sexo}, ''), ${campos.sexo})` } : {}),
          ...(campos.fechaNacimiento ? { fechaNacimiento: sql`coalesce(${col.fechaNacimiento}, ${campos.fechaNacimiento}::date)` } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(col.teamId, teamId), eq(col.id, id)))));
  }

  // Con el RNE ya puesto, el asistente reconoce a esos alumnos por RNE: su
  // plan, que se sirve de caché, tiene que enterarse.
  if (plan.completados > 0) invalidarSigerd(teamId);

  return {
    revisados: plan.revisados,
    completados: plan.completados,
    sinFicha: plan.sinFicha,
    rneRepetido: plan.rneRepetido,
    sinDescarga: false,
  };
}
