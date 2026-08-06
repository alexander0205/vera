/**
 * Importación de una sección de SIGERD al módulo Administración Escolar.
 *
 * Dos fases separadas a propósito:
 *   `planificarImportacion` — solo lee y calcula qué pasaría. Sin escrituras.
 *   `aplicarImportacion`    — ejecuta el plan dentro de una transacción.
 *
 * Traer expedientes de menores desde un sistema del Estado a nuestra base no es
 * una operación que deba ocurrir por accidente: la UI enseña el plan primero y
 * el usuario confirma.
 *
 * RECONCILIACIÓN: el estudiante se identifica por `codigo`, que es el RNE del
 * MINERD (o `SIGERD-<id>` cuando el RNE falta). Si ya existe con ese código no
 * se duplica ni se sobrescribe — se reutiliza. Nunca se modifican datos de un
 * estudiante que ya estaba en el sistema; SIGERD manda al crear, no al editar.
 */
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCursos,
  adminEscolarEstudiantes,
  adminEscolarMatriculas,
  adminEscolarPeriodos,
} from '@/lib/db/schema';
import { codigoParaEstudiante, type EstudianteSigerd } from '@/lib/sigerd/importar';

export interface FilaPlan {
  idSigerd: number;
  codigo: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string | null;
  /** `nuevo` se crea; `existente` se reutiliza tal cual. */
  estudiante: 'nuevo' | 'existente';
  /** Id local cuando ya existía. */
  estudianteId?: number;
  /** `nueva` se inserta; `ya-matriculado` se omite (mismo período y curso). */
  matricula: 'nueva' | 'ya-matriculado';
}

export interface PlanImportacion {
  teamId: number;
  periodoId: number;
  cursoId: number;
  periodoNombre: string;
  cursoNombre: string;
  filas: FilaPlan[];
  resumen: {
    total: number;
    estudiantesNuevos: number;
    estudiantesExistentes: number;
    matriculasNuevas: number;
    yaMatriculados: number;
  };
}

export class ImportacionError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ImportacionError';
  }
}

/**
 * Calcula qué se crearía sin tocar nada.
 *
 * Valida que período y curso pertenezcan al team: los ids llegan del cliente y
 * sin esta comprobación se podrían enganchar matrículas al catálogo de otra
 * empresa.
 */
export async function planificarImportacion(params: {
  teamId: number;
  periodoId: number;
  cursoId: number;
  estudiantes: EstudianteSigerd[];
}): Promise<PlanImportacion> {
  const { teamId, periodoId, cursoId, estudiantes } = params;

  const [periodo] = await db
    .select({ id: adminEscolarPeriodos.id, nombre: adminEscolarPeriodos.nombre })
    .from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.id, periodoId), eq(adminEscolarPeriodos.teamId, teamId)))
    .limit(1);
  if (!periodo) throw new ImportacionError('El período no existe o no pertenece a esta empresa.');

  const [curso] = await db
    .select({ id: adminEscolarCursos.id, nombre: adminEscolarCursos.nombre })
    .from(adminEscolarCursos)
    .where(and(eq(adminEscolarCursos.id, cursoId), eq(adminEscolarCursos.teamId, teamId)))
    .limit(1);
  if (!curso) throw new ImportacionError('El curso no existe o no pertenece a esta empresa.');

  const codigos = estudiantes.map(codigoParaEstudiante);

  const existentes = codigos.length
    ? await db
        .select({ id: adminEscolarEstudiantes.id, codigo: adminEscolarEstudiantes.codigo })
        .from(adminEscolarEstudiantes)
        .where(
          and(
            eq(adminEscolarEstudiantes.teamId, teamId),
            inArray(adminEscolarEstudiantes.codigo, codigos),
          ),
        )
    : [];

  const porCodigo = new Map(existentes.map((e) => [e.codigo, e.id]));

  // Matrículas ya registradas para este período y curso, para no duplicarlas.
  const idsExistentes = [...porCodigo.values()];
  const matriculadas = idsExistentes.length
    ? await db
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

  const yaMatriculados = new Set(matriculadas.map((m) => m.estudianteId));

  const filas: FilaPlan[] = estudiantes.map((e) => {
    const codigo = codigoParaEstudiante(e);
    const estudianteId = porCodigo.get(codigo);

    return {
      idSigerd: e.idSigerd,
      codigo,
      nombres: e.nombres,
      apellidos: e.apellidos,
      fechaNacimiento: e.fechaNacimiento,
      estudiante: estudianteId ? 'existente' : 'nuevo',
      estudianteId,
      matricula: estudianteId && yaMatriculados.has(estudianteId) ? 'ya-matriculado' : 'nueva',
    };
  });

  return {
    teamId,
    periodoId,
    cursoId,
    periodoNombre: periodo.nombre,
    cursoNombre: curso.nombre,
    filas,
    resumen: {
      total: filas.length,
      estudiantesNuevos: filas.filter((f) => f.estudiante === 'nuevo').length,
      estudiantesExistentes: filas.filter((f) => f.estudiante === 'existente').length,
      matriculasNuevas: filas.filter((f) => f.matricula === 'nueva').length,
      yaMatriculados: filas.filter((f) => f.matricula === 'ya-matriculado').length,
    },
  };
}

export interface ResultadoImportacion {
  estudiantesCreados: number;
  matriculasCreadas: number;
  omitidos: number;
}

/**
 * Ejecuta el plan. Todo o nada: si algo falla a mitad, no queda un curso con
 * media sección importada.
 *
 * Se vuelve a planificar dentro de la transacción en vez de confiar en el plan
 * que mandó el cliente — entre la vista previa y la confirmación pudo cambiar
 * cualquier cosa, y el cliente no es fuente de verdad sobre qué ya existe.
 */
export async function aplicarImportacion(params: {
  teamId: number;
  periodoId: number;
  cursoId: number;
  estudiantes: EstudianteSigerd[];
}): Promise<ResultadoImportacion> {
  const plan = await planificarImportacion(params);
  const { teamId, periodoId, cursoId } = params;

  const porIdSigerd = new Map(params.estudiantes.map((e) => [e.idSigerd, e]));

  return await db.transaction(async (tx) => {
    let estudiantesCreados = 0;
    let matriculasCreadas = 0;
    let omitidos = 0;

    for (const fila of plan.filas) {
      if (fila.matricula === 'ya-matriculado') {
        omitidos++;
        continue;
      }

      let estudianteId = fila.estudianteId;

      if (!estudianteId) {
        const origen = porIdSigerd.get(fila.idSigerd);
        const [creado] = await tx
          .insert(adminEscolarEstudiantes)
          .values({
            teamId,
            codigo: fila.codigo,
            nombres: fila.nombres,
            apellidos: fila.apellidos,
            fechaNacimiento: fila.fechaNacimiento,
            // Solo viene si se pidió la sección `conFicha`. Sin ella queda
            // `null` — nunca se deduce del nombre.
            sexo: origen?.ficha?.sexoNormalizado ?? null,
            estado: 'activo',
          })
          .returning({ id: adminEscolarEstudiantes.id });

        estudianteId = creado.id;
        estudiantesCreados++;
      }

      await tx.insert(adminEscolarMatriculas).values({
        teamId,
        estudianteId,
        periodoId,
        cursoId,
        estado: 'activa',
        notas: `Importado de SIGERD (IdEstudiante ${fila.idSigerd}).`,
      });
      matriculasCreadas++;
    }

    return { estudiantesCreados, matriculasCreadas, omitidos };
  });
}
