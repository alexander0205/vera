/**
 * Vuelca el árbol de un centro de SIGERD al módulo Administración Escolar.
 *
 * Mapeo (SIGERD → nuestro esquema):
 *   año académico            → adminEscolarPeriodos   (1 período)
 *   servicio + grado + sección → adminEscolarCursos    (ej. "Primero A", nivel "Primario")
 *   estudiante de sección     → adminEscolarEstudiantes
 *   estudiante en sección     → adminEscolarMatriculas (curso + período)
 *
 * IDEMPOTENTE: reconcilia por clave estable y no duplica ni pisa.
 *   - período   por (teamId, nombre)
 *   - curso     por (teamId, nombre, nivel)
 *   - estudiante por (teamId, codigo)  — codigo = RNE o `SIGERD-<id>`
 *   - matrícula  por (teamId, estudiante, período, curso)
 * Correr el sync 10 veces deja el mismo resultado. Nunca sobrescribe datos
 * locales de un estudiante que ya existía: SIGERD manda al crear, no al editar.
 *
 * LIMITACIÓN CONOCIDA: el curso se reconcilia por nombre+nivel porque el
 * esquema no tiene columna para el `idSeccion` de SIGERD. Con los datos reales
 * no colisiona (el nivel lleva el servicio), pero lo correcto a futuro es una
 * migración que añada `sigerd_seccion_id` y reconciliar por eso.
 */
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarServicios,
  adminEscolarGrados,
  adminEscolarCursos,
  adminEscolarEstudiantes,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
} from '@/lib/db/schema';
import type { ArbolCentro } from '@/lib/sigerd/sync';

/** Nombres de año de SIGERD por id, para ponerle un nombre lindo al período. */
const NOMBRE_ANIO: Record<number, string> = {
  23: '2024-2025',
  24: '2025-2026',
};

export interface ResumenSync {
  periodo: { id: number; nombre: string; creado: boolean };
  cursos: { nuevos: number; existentes: number };
  estudiantes: { nuevos: number; existentes: number };
  matriculas: { nuevas: number; yaExistian: number };
  /** Estudiantes del árbol sin nombre utilizable (no se insertan). */
  descartados: number;
}

/** Nombre de curso legible y único-por-nivel: "Primero A". */
function nombreCurso(gradoNombre: string, seccionNombre: string): string {
  // El grado a veces trae paréntesis largos ("Primer grado (7mo Nivel Básico)").
  // Se recorta el paréntesis para el nombre; el detalle queda en el nivel/servicio.
  const grado = gradoNombre.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  return `${grado} ${seccionNombre}`.trim().slice(0, 80);
}

/** Separa el nombre completo de SIGERD en nombres/apellidos de forma conservadora. */
function partirNombre(completo: string): { nombres: string; apellidos: string } {
  const partes = completo.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return { nombres: completo.trim(), apellidos: '' };
  // Heurística simple: mitad y mitad. SIGERD da el nombre concatenado en el
  // listado de sección; para separación fiel hace falta la ficha (Nivel 2).
  const corte = Math.ceil(partes.length / 2);
  return { nombres: partes.slice(0, corte).join(' '), apellidos: partes.slice(corte).join(' ') };
}

/**
 * Vuelca el árbol. Todo dentro de una transacción: o entra el centro completo,
 * o no entra nada. Con `dryRun` calcula el resumen sin escribir.
 */
export async function sincronizarArbol(params: {
  teamId: number;
  arbol: ArbolCentro;
  dryRun?: boolean;
}): Promise<ResumenSync> {
  const { teamId, arbol, dryRun } = params;
  const nombrePeriodo = NOMBRE_ANIO[arbol.anoAcademico] ?? `Año ${arbol.anoAcademico}`;

  return await db.transaction(async (tx) => {
    const resumen: ResumenSync = {
      periodo: { id: 0, nombre: nombrePeriodo, creado: false },
      cursos: { nuevos: 0, existentes: 0 },
      estudiantes: { nuevos: 0, existentes: 0 },
      matriculas: { nuevas: 0, yaExistian: 0 },
      descartados: 0,
    };

    // ── Período ──
    const [periodoExistente] = await tx
      .select({ id: adminEscolarPeriodos.id })
      .from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.nombre, nombrePeriodo)))
      .limit(1);

    let periodoId = periodoExistente?.id ?? 0;
    if (!periodoId) {
      resumen.periodo.creado = true;
      if (!dryRun) {
        const [creado] = await tx
          .insert(adminEscolarPeriodos)
          .values({ teamId, nombre: nombrePeriodo, activo: true })
          .returning({ id: adminEscolarPeriodos.id });
        periodoId = creado.id;
      }
    }
    resumen.periodo.id = periodoId;

    // ── Recorrer secciones ──
    let orden = 0;
    for (const servicio of arbol.servicios) {
      const nivel = servicio.nombre.slice(0, 60);

      // Servicio/tanda (find-or-create): el grado cuelga de él.
      const nombreServicio = servicio.nombre.slice(0, 100);
      const [sExist] = await tx
        .select({ id: adminEscolarServicios.id })
        .from(adminEscolarServicios)
        .where(and(
          eq(adminEscolarServicios.teamId, teamId),
          eq(adminEscolarServicios.periodoId, periodoId),
          eq(adminEscolarServicios.nombre, nombreServicio),
        ))
        .limit(1);
      let servicioId = sExist?.id ?? 0;
      if (!servicioId && !dryRun) {
        const [sc] = await tx
          .insert(adminEscolarServicios)
          .values({ teamId, periodoId, nombre: nombreServicio })
          .returning({ id: adminEscolarServicios.id });
        servicioId = sc.id;
      }

      for (const grado of servicio.grados) {
        // Grado (find-or-create): la sección cuelga de él (modelo Grado→Sección).
        const nombreGrado = grado.nombre.slice(0, 100);
        const [gExist] = await tx
          .select({ id: adminEscolarGrados.id })
          .from(adminEscolarGrados)
          .where(and(
            eq(adminEscolarGrados.teamId, teamId),
            eq(adminEscolarGrados.nombre, nombreGrado),
            eq(adminEscolarGrados.nivel, nivel),
          ))
          .limit(1);
        let gradoId = gExist?.id ?? 0;
        if (!gradoId && !dryRun) {
          const [gc] = await tx
            .insert(adminEscolarGrados)
            .values({ teamId, servicioId, nombre: nombreGrado, nivel })
            .returning({ id: adminEscolarGrados.id });
          gradoId = gc.id;
        }

        for (const seccion of grado.secciones) {
          orden++;
          const nombre = nombreCurso(grado.nombre, seccion.nombre);

          // curso por (teamId, nombre, nivel)
          const [cursoExistente] = await tx
            .select({ id: adminEscolarCursos.id })
            .from(adminEscolarCursos)
            .where(
              and(
                eq(adminEscolarCursos.teamId, teamId),
                eq(adminEscolarCursos.nombre, nombre),
                eq(adminEscolarCursos.nivel, nivel),
              ),
            )
            .limit(1);

          let cursoId = cursoExistente?.id ?? 0;
          if (cursoId) {
            resumen.cursos.existentes++;
          } else {
            resumen.cursos.nuevos++;
            if (!dryRun) {
              const [creado] = await tx
                .insert(adminEscolarCursos)
                .values({ teamId, gradoId, nombre, nivel, orden, activo: true })
                .returning({ id: adminEscolarCursos.id });
              cursoId = creado.id;
            }
          }

          if (!seccion.estudiantes.length) continue;

          // Códigos de esta sección: RNE no está en el listado, así que el
          // código estable disponible aquí es SIGERD-<id>. (El RNE llega con la
          // ficha, Nivel 2; entonces se puede reconciliar mejor.)
          const codigos = seccion.estudiantes.map((e) => `SIGERD-${e.id}`);

          const existentes = await tx
            .select({ id: adminEscolarEstudiantes.id, codigo: adminEscolarEstudiantes.codigo })
            .from(adminEscolarEstudiantes)
            .where(
              and(
                eq(adminEscolarEstudiantes.teamId, teamId),
                inArray(adminEscolarEstudiantes.codigo, codigos),
              ),
            );
          const porCodigo = new Map(existentes.map((e) => [e.codigo, e.id]));

          // Matrículas ya presentes para este período+curso.
          const idsExistentes = [...porCodigo.values()];
          const yaMatric = idsExistentes.length
            ? await tx
                .select({ estudianteId: adminEscolarMatriculas.estudianteId })
                .from(adminEscolarMatriculas)
                .where(
                  and(
                    eq(adminEscolarMatriculas.teamId, teamId),
                    eq(adminEscolarMatriculas.periodoId, periodoId),
                    eq(adminEscolarMatriculas.cursoId, cursoId),
                    inArray(adminEscolarMatriculas.estudianteId, idsExistentes),
                  ),
                )
            : [];
          const yaMatriculado = new Set(yaMatric.map((m) => m.estudianteId));

          for (const est of seccion.estudiantes) {
            const codigo = `SIGERD-${est.id}`;
            const nombreLimpio = est.nombre.trim();
            if (!nombreLimpio) {
              resumen.descartados++;
              continue;
            }

            let estudianteId = porCodigo.get(codigo);
            if (estudianteId) {
              resumen.estudiantes.existentes++;
            } else {
              resumen.estudiantes.nuevos++;
              if (!dryRun) {
                const { nombres, apellidos } = partirNombre(nombreLimpio);
                const [creado] = await tx
                  .insert(adminEscolarEstudiantes)
                  .values({ teamId, codigo, nombres, apellidos: apellidos || nombres, estado: 'activo' })
                  .returning({ id: adminEscolarEstudiantes.id });
                estudianteId = creado.id;
                porCodigo.set(codigo, estudianteId);
              }
            }

            if (estudianteId && yaMatriculado.has(estudianteId)) {
              resumen.matriculas.yaExistian++;
            } else {
              resumen.matriculas.nuevas++;
              if (!dryRun && estudianteId && periodoId && cursoId) {
                await tx.insert(adminEscolarMatriculas).values({
                  teamId,
                  estudianteId,
                  periodoId,
                  cursoId,
                  estado: 'activa',
                  notas: `Importado de SIGERD (IdEstudiante ${est.id}).`,
                });
              }
            }
          }
        }
      }
    }

    return resumen;
  });
}
