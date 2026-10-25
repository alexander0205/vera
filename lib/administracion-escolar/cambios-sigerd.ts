/**
 * «Revisar cambios de SIGERD» y «Mover a la sección de SIGERD»: la parte que
 * lee y escribe en la base. La comparación en sí es pura y vive en
 * `lib/sigerd/comparar-cambios.ts`, con sus pruebas.
 *
 * Todo se compara contra la ÚLTIMA DESCARGA guardada, no contra el portal: no
 * hay llamadas a SIGERD aquí. Para ver lo de hoy hay que volver a bajar
 * (`/api/sigerd/obtener`), y la pantalla lo dice con la fecha de lo que compara.
 */
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCursos, adminEscolarEstudiantes, adminEscolarGrados,
  adminEscolarMatriculas, adminEscolarPeriodos, adminEscolarServicios,
} from '@/lib/db/schema';
import { invalidarSigerd } from '@/lib/cache/escolar';
import { logAudit } from '@/lib/audit';
import { datosDesdeFichas } from '@/lib/sigerd/datos-estudiante';
import { compararConSigerd, type AlumnoZero, type CambiosSigerd, type CursoZero } from '@/lib/sigerd/comparar-cambios';
import { ultimoDumpSigerd } from '@/lib/sigerd/ultimo-dump';
import type { ArbolCentro } from '@/lib/sigerd/sync';

export interface RevisionSigerd {
  /** Falso si no hay descarga o no hay año escolar activo (ver `motivo`). */
  disponible: boolean;
  motivo?: string;
  periodo: { id: number; nombre: string } | null;
  anoAcademico: number | null;
  /** Cuándo se bajó lo que se está comparando. Lo posterior no está. */
  descargadaEl: string | null;
  cambios: CambiosSigerd | null;
}

const sinDatos = (motivo: string): RevisionSigerd => ({
  disponible: false, motivo, periodo: null, anoAcademico: null, descargadaEl: null, cambios: null,
});

/** «Primero — A · Matutina»: igual que en «Matricular desde SIGERD». */
const etiquetaCurso = (grado: string, seccion: string, tanda: string | null) => {
  const partes = [grado, seccion].filter(Boolean).join(' — ');
  return tanda ? `${partes} · ${tanda}` : partes;
};

export async function revisarCambiosSigerd(teamId: number): Promise<RevisionSigerd> {
  const ultimo = await ultimoDumpSigerd(teamId);
  const arbol = ultimo?.dump.estructura as ArbolCentro | undefined;
  if (!ultimo || !arbol) return sinDatos('Todavía no hay una descarga de SIGERD.');

  const [periodo] = await db.select({ id: adminEscolarPeriodos.id, nombre: adminEscolarPeriodos.nombre })
    .from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true)))
    .limit(1);
  if (!periodo) return sinDatos('No hay año escolar activo.');

  const [estudiantes, matriculas, cursos] = await Promise.all([
    db.select({
      id: adminEscolarEstudiantes.id,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      estado: adminEscolarEstudiantes.estado,
      sigerdId: adminEscolarEstudiantes.sigerdId,
      codigoRne: adminEscolarEstudiantes.codigoRne,
    }).from(adminEscolarEstudiantes).where(eq(adminEscolarEstudiantes.teamId, teamId)),

    // La matrícula ACTIVA del año vigente, con el curso al que apunta. Aquí no se
    // filtra por curso activo: si el curso se desactivó después de matricular,
    // el alumno sigue estando en él y hay que saber en cuál.
    db.select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      cursoId: adminEscolarMatriculas.cursoId,
      curso: adminEscolarCursos.nombre,
      sigerdSeccionId: adminEscolarCursos.sigerdSeccionId,
      grado: adminEscolarGrados.nombre,
      tanda: adminEscolarServicios.tanda,
    })
      .from(adminEscolarMatriculas)
      .innerJoin(adminEscolarCursos, eq(adminEscolarCursos.id, adminEscolarMatriculas.cursoId))
      .innerJoin(adminEscolarGrados, eq(adminEscolarGrados.id, adminEscolarCursos.gradoId))
      .innerJoin(adminEscolarServicios, eq(adminEscolarServicios.id, adminEscolarGrados.servicioId))
      .where(and(
        eq(adminEscolarMatriculas.teamId, teamId),
        eq(adminEscolarMatriculas.periodoId, periodo.id),
        eq(adminEscolarMatriculas.estado, 'activa'),
      )),

    // Las secciones del año vigente a las que se puede mover a alguien: activas
    // y con su grado y servicio activos, como en «Matricular desde SIGERD».
    db.select({
      id: adminEscolarCursos.id,
      nombre: adminEscolarCursos.nombre,
      sigerdSeccionId: adminEscolarCursos.sigerdSeccionId,
      grado: adminEscolarGrados.nombre,
      tanda: adminEscolarServicios.tanda,
    })
      .from(adminEscolarCursos)
      .innerJoin(adminEscolarGrados, eq(adminEscolarGrados.id, adminEscolarCursos.gradoId))
      .innerJoin(adminEscolarServicios, eq(adminEscolarServicios.id, adminEscolarGrados.servicioId))
      .where(and(
        eq(adminEscolarCursos.teamId, teamId),
        eq(adminEscolarServicios.periodoId, periodo.id),
        eq(adminEscolarCursos.activo, true),
        eq(adminEscolarGrados.activo, true),
        eq(adminEscolarServicios.activo, true),
      )),
  ]);

  // Una matrícula activa por alumno y año. Si hubiera dos por un dato roto, la
  // más reciente manda.
  const matriculaPorAlumno = new Map<number, (typeof matriculas)[number]>();
  for (const m of matriculas) {
    const previa = matriculaPorAlumno.get(m.estudianteId);
    if (!previa || m.id > previa.id) matriculaPorAlumno.set(m.estudianteId, m);
  }

  const alumnos: AlumnoZero[] = estudiantes.map((e) => {
    const m = matriculaPorAlumno.get(e.id);
    return {
      id: e.id,
      nombre: `${e.nombres} ${e.apellidos}`.trim(),
      estado: e.estado,
      sigerdId: e.sigerdId,
      codigoRne: e.codigoRne,
      matricula: m ? {
        id: m.id, cursoId: m.cursoId,
        cursoEtiqueta: etiquetaCurso(m.grado, m.curso, m.tanda),
        cursoSigerdSeccionId: m.sigerdSeccionId,
      } : null,
    };
  });

  const cursosZero: CursoZero[] = cursos.map((c) => ({
    id: c.id, nombre: c.nombre, sigerdSeccionId: c.sigerdSeccionId,
    etiqueta: etiquetaCurso(c.grado, c.nombre, c.tanda),
  }));

  // El RNE de cada alumno de SIGERD viene de sus fichas, no del árbol.
  const rnePorSigerd = new Map<number, string>();
  for (const [id, d] of datosDesdeFichas(ultimo.dump.estudianteFichas)) {
    if (d.codigoRne) rnePorSigerd.set(id, d.codigoRne);
  }

  return {
    disponible: true,
    periodo,
    anoAcademico: (ultimo.dump.anoAcademico as number | undefined) ?? ultimo.anoAcademico,
    descargadaEl: ultimo.bajadoEn ? ultimo.bajadoEn.toISOString() : null,
    cambios: compararConSigerd(arbol, { alumnos, cursos: cursosZero }, { rnePorSigerd }),
  };
}

// ── Mover a la sección de SIGERD ────────────────────────────────────────────

export class MoverSeccionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'MoverSeccionError';
  }
}

export interface ResultadoMover {
  movidos: number;
  /** Los que no se movieron, con el motivo. Se enseñan, no se tragan. */
  omitidos: Array<{ estudianteId: number; nombre: string; motivo: string }>;
}

/**
 * Pasa la matrícula ACTIVA de cada alumno a la sección que dice SIGERD.
 *
 * Solo cambia `curso_id` de la matrícula. Los cargos que ya existen NO se
 * tocan —están facturados, cobrados o vencidos, y reescribirlos movería deuda
 * sin que nadie lo decidiera—; lo que falte por generar sale con la tarifa de
 * la sección nueva, porque el devengo lee el curso de la matrícula (ver
 * `devengar.ts`).
 *
 * No se fía de la pantalla: vuelve a comparar con la descarga y solo mueve a
 * quien SIGUE figurando como cambio de sección y tiene destino claro. Cada
 * UPDATE exige además que la matrícula siga activa y en el curso del que se
 * partió, así que dos personas moviendo a la vez no se pisan.
 *
 * Cada movimiento deja su fila en `audit_logs`: mover a alguien de sección
 * cambia lo que se le va a cobrar y hay que poder explicarlo después.
 */
export async function moverASeccionSigerd(
  teamId: number,
  estudianteIds: readonly number[],
  quien: { userId: number; email: string; ip: string | null },
): Promise<ResultadoMover> {
  const revision = await revisarCambiosSigerd(teamId);
  if (!revision.disponible || !revision.cambios || !revision.periodo) {
    throw new MoverSeccionError(revision.motivo ?? 'SIGERD no está disponible.', 409);
  }

  const pedidos = new Set(estudianteIds);
  const vigentes = new Map(revision.cambios.cambiaronDeSeccion.map((c) => [c.estudianteId, c]));
  const resultado: ResultadoMover = { movidos: 0, omitidos: [] };

  for (const id of pedidos) {
    const c = vigentes.get(id);
    if (!c) {
      resultado.omitidos.push({
        estudianteId: id, nombre: `Estudiante #${id}`,
        motivo: 'Ya no figura como cambio de sección en la descarga de SIGERD.',
      });
      continue;
    }
    if (!c.destino) {
      resultado.omitidos.push({
        estudianteId: id, nombre: c.nombre,
        motivo: c.sinDestino === 'varias-secciones'
          ? 'SIGERD lo tiene en varias secciones: no se elige por él.'
          : c.sinDestino === 'enlace-duplicado'
            ? 'Dos secciones de tu estructura están enlazadas a esa sección de SIGERD: arregla el enlace antes de mover.'
            : 'Esa sección de SIGERD no está enlazada a una sección de tu estructura.',
      });
      continue;
    }

    const [fila] = await db.update(adminEscolarMatriculas)
      .set({ cursoId: c.destino.cursoId, updatedAt: new Date() })
      .where(and(
        eq(adminEscolarMatriculas.id, c.matriculaId),
        eq(adminEscolarMatriculas.teamId, teamId),
        eq(adminEscolarMatriculas.periodoId, revision.periodo.id),
        eq(adminEscolarMatriculas.estado, 'activa'),
        eq(adminEscolarMatriculas.cursoId, c.desdeCursoId),
      ))
      .returning({ id: adminEscolarMatriculas.id });

    if (!fila) {
      resultado.omitidos.push({
        estudianteId: id, nombre: c.nombre,
        motivo: 'Su matrícula cambió mientras tanto. Vuelve a revisar.',
      });
      continue;
    }

    resultado.movidos++;
    logAudit({
      teamId, userId: quien.userId, actor: quien.email,
      action: 'ESCOLAR_MATRICULA_MOVIDA_SIGERD',
      resource: `matricula:${c.matriculaId}`,
      ip: quien.ip,
      meta: {
        estudianteId: c.estudianteId, sigerdId: c.sigerdId, nombre: c.nombre,
        desdeCursoId: c.desdeCursoId, desde: c.desde,
        haciaCursoId: c.destino.cursoId, hacia: c.destino.etiqueta,
        descargaDe: revision.descargadaEl,
      },
    });
  }

  if (resultado.movidos > 0) invalidarSigerd(teamId);
  return resultado;
}
