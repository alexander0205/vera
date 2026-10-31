import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCursos, adminEscolarGrados, adminEscolarPeriodos, adminEscolarServicios,
} from '@/lib/db/schema';
import { NOMBRE_SECCION_SIN_GRADO, NOMBRE_SIN_GRADO } from './sin-grado';

/**
 * La sección a la que va quien no tiene grado, creándola si hace falta.
 *
 * Con `servicioId`, dentro de ese servicio («Estudiantes Otros Centros»), que es
 * lo que hace que le lleguen sus precios. Sin él, en un servicio «Sin grado» del
 * año escolar, donde solo le aplican los precios propios y los de todo el
 * colegio.
 *
 * Se puede pedir mil veces: si ya existe, devuelve la misma. `null` si el año
 * escolar o el servicio no son de este colegio.
 */
export async function asegurarSeccionSinGrado(teamId: number, periodoId: number, servicioId: number | null) {
  return db.transaction(async (tx) => {
    // Dos secretarias matriculando a la vez crearían dos «Sin grado».
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`sin-grado:${teamId}:${periodoId}`}))`);

    const [periodo] = await tx.select({ id: adminEscolarPeriodos.id }).from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId))).limit(1);
    if (!periodo) return null;

    const delAno = and(eq(adminEscolarServicios.teamId, teamId), eq(adminEscolarServicios.periodoId, periodoId));
    let [servicio] = await tx.select().from(adminEscolarServicios).where(and(
      delAno,
      servicioId != null
        ? eq(adminEscolarServicios.id, servicioId)
        : sql`lower(${adminEscolarServicios.nombre}) = ${NOMBRE_SIN_GRADO.toLowerCase()}`,
    )).limit(1);
    if (!servicio) {
      if (servicioId != null) return null;
      // Al final de las listas: el orden lo puso el colegio y esto no es suyo.
      [servicio] = await tx.insert(adminEscolarServicios)
        .values({ teamId, periodoId, nombre: NOMBRE_SIN_GRADO, orden: 9999 }).returning();
    }

    let [grado] = await tx.select().from(adminEscolarGrados).where(and(
      eq(adminEscolarGrados.teamId, teamId),
      eq(adminEscolarGrados.servicioId, servicio.id),
      sql`lower(${adminEscolarGrados.nombre}) = ${NOMBRE_SIN_GRADO.toLowerCase()}`,
    )).limit(1);
    if (!grado) {
      [grado] = await tx.insert(adminEscolarGrados)
        .values({ teamId, servicioId: servicio.id, nombre: NOMBRE_SIN_GRADO, orden: 9999 }).returning();
    }

    let [seccion] = await tx.select().from(adminEscolarCursos).where(and(
      eq(adminEscolarCursos.teamId, teamId),
      eq(adminEscolarCursos.gradoId, grado.id),
      eq(adminEscolarCursos.nombre, NOMBRE_SECCION_SIN_GRADO),
    )).limit(1);
    if (!seccion) {
      [seccion] = await tx.insert(adminEscolarCursos)
        .values({ teamId, gradoId: grado.id, nombre: NOMBRE_SECCION_SIN_GRADO }).returning();
    }

    // Si alguien los desactivó, se vuelven a encender: se está matriculando ahí.
    if (!servicio.activo) await tx.update(adminEscolarServicios).set({ activo: true, updatedAt: new Date() }).where(eq(adminEscolarServicios.id, servicio.id));
    if (!grado.activo) await tx.update(adminEscolarGrados).set({ activo: true, updatedAt: new Date() }).where(eq(adminEscolarGrados.id, grado.id));
    if (!seccion.activo) await tx.update(adminEscolarCursos).set({ activo: true, updatedAt: new Date() }).where(eq(adminEscolarCursos.id, seccion.id));

    // La misma forma que una fila de GET /cursos: la pantalla la mete en su lista.
    return {
      id: seccion.id,
      nombre: seccion.nombre,
      gradoId: grado.id,
      gradoNombre: grado.nombre,
      servicioId: servicio.id,
      servicioNombre: servicio.nombre,
      servicioTanda: servicio.tanda,
      periodoId,
      activo: true,
      gradoActivo: true,
      servicioActivo: true,
    };
  });
}
