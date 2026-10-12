import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarMatriculas,
  adminEscolarEstudiantes,
  adminEscolarCursos,
  adminEscolarGrados,
  adminEscolarServicios,
  adminEscolarPeriodos,
  adminEscolarDocumentosRequeridos,
  adminEscolarDocumentosEntregados,
  adminEscolarDocumentoListas,
  adminEscolarEstudianteTutores,
  adminEscolarTutores,
} from '@/lib/db/schema';
import { mismoNivel, type Exigencia, type EstadoDocumento } from './documentos';

/**
 * Quién debe qué, en todo el colegio.
 *
 * Hasta ahora los documentos solo se veían alumno por alumno. En agosto, con
 * cuatrocientas matrículas, eso significa abrir cuatrocientas fichas para saber
 * a quién hay que reclamarle — así que en la práctica no se reclamaba.
 *
 * Se calcula EN BLOQUE y no llamando al checklist por alumno: cuatro consultas
 * para todo el colegio en vez de tres por matrícula. Con 465 estudiantes, la
 * diferencia es entre una pantalla que abre y una que caduca.
 *
 * La regla de qué falta es la misma que la del checklist individual —un
 * requerido no aprobado falta; un «si aplica» sin resolver tampoco está
 * resuelto— porque si divergieran, la lista diría una cosa y la ficha del
 * alumno otra.
 */

const RESUELTOS: EstadoDocumento[] = ['aprobado', 'no_aplica'];

export interface FilaSeguimiento {
  matriculaId: number;
  estudianteId: number;
  estudiante: string;
  curso: string | null;
  nivel: string | null;
  /** Correo del responsable, si lo hay. Sin él no se le puede mandar nada. */
  email: string | null;
  total: number;
  aprobados: number;
  /** Requeridos que aún no están aprobados. */
  faltan: number;
  /** «Si aplica» que nadie ha resuelto. */
  sinResolver: number;
  /** Subidos esperando que alguien los mire. */
  porAprobar: number;
  completa: boolean;
  /** Los que faltan, por nombre. Es lo que se le reclama a la familia. */
  pendientes: string[];
}

export interface ResumenSeguimiento {
  periodoId: number | null;
  periodoNombre: string | null;
  filas: FilaSeguimiento[];
  totales: {
    matriculas: number;
    completas: number;
    conPendientes: number;
    porAprobar: number;
    /** Con documentos pendientes y sin correo al que escribirles. */
    sinCorreo: number;
  };
}

export async function seguimientoDeDocumentos(
  teamId: number, opts: { periodoId?: number | null } = {},
): Promise<ResumenSeguimiento> {
  // El período: el que pidan o el que esté marcado como activo. Mezclar años
  // haría que un alumno apareciera dos veces con dos expedientes distintos.
  const [periodo] = opts.periodoId
    ? await db.select().from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.id, opts.periodoId), eq(adminEscolarPeriodos.teamId, teamId)))
      .limit(1)
    : await db.select().from(adminEscolarPeriodos)
      .where(and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true)))
      .limit(1);

  if (!periodo) {
    return {
      periodoId: null, periodoNombre: null, filas: [],
      totales: { matriculas: 0, completas: 0, conPendientes: 0, porAprobar: 0, sinCorreo: 0 },
    };
  }

  const matriculas = await db
    .select({
      id: adminEscolarMatriculas.id,
      estudianteId: adminEscolarMatriculas.estudianteId,
      listaId: adminEscolarMatriculas.documentoListaId,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      curso: adminEscolarCursos.nombre,
      nivel: adminEscolarServicios.nombre,
      // El correo vive en el TUTOR responsable de pago, no en el alumno: es a
      // quien se le reclama, y es el mismo criterio que usa el enlace de
      // documentos para proponer destinatario.
      email: adminEscolarTutores.email,
    })
    .from(adminEscolarMatriculas)
    .innerJoin(adminEscolarEstudiantes, eq(adminEscolarMatriculas.estudianteId, adminEscolarEstudiantes.id))
    .leftJoin(adminEscolarCursos, eq(adminEscolarMatriculas.cursoId, adminEscolarCursos.id))
    .leftJoin(adminEscolarGrados, eq(adminEscolarCursos.gradoId, adminEscolarGrados.id))
    .leftJoin(adminEscolarServicios, eq(adminEscolarGrados.servicioId, adminEscolarServicios.id))
    .leftJoin(adminEscolarEstudianteTutores, and(
      eq(adminEscolarEstudianteTutores.estudianteId, adminEscolarEstudiantes.id),
      eq(adminEscolarEstudianteTutores.teamId, teamId),
      eq(adminEscolarEstudianteTutores.responsablePago, true),
    ))
    .leftJoin(adminEscolarTutores, eq(adminEscolarEstudianteTutores.tutorId, adminEscolarTutores.id))
    .where(and(
      eq(adminEscolarMatriculas.teamId, teamId),
      eq(adminEscolarMatriculas.periodoId, periodo.id),
    ));

  if (matriculas.length === 0) {
    return {
      periodoId: periodo.id, periodoNombre: periodo.nombre, filas: [],
      totales: { matriculas: 0, completas: 0, conPendientes: 0, porAprobar: 0, sinCorreo: 0 },
    };
  }

  // TODOS los requeridos del colegio de una vez. Se reparten en memoria: son
  // decenas de filas, y pedirlos por matrícula serían cientos de consultas.
  const requeridos = await db.select().from(adminEscolarDocumentosRequeridos)
    .where(and(
      eq(adminEscolarDocumentosRequeridos.teamId, teamId),
      eq(adminEscolarDocumentosRequeridos.activo, true),
    ));

  const entregados = await db
    .select({
      matriculaId: adminEscolarDocumentosEntregados.matriculaId,
      requeridoId: adminEscolarDocumentosEntregados.requeridoId,
      estado: adminEscolarDocumentosEntregados.estado,
    })
    .from(adminEscolarDocumentosEntregados)
    .where(and(
      eq(adminEscolarDocumentosEntregados.teamId, teamId),
      inArray(adminEscolarDocumentosEntregados.matriculaId, matriculas.map((m) => m.id)),
    ));

  const estadoDe = new Map<string, EstadoDocumento>();
  for (const e of entregados) {
    estadoDe.set(`${e.matriculaId}:${e.requeridoId}`, e.estado as EstadoDocumento);
  }

  const porLista = new Map<number, typeof requeridos>();
  const porMatricula = new Map<number, typeof requeridos>();
  const sueltos: typeof requeridos = [];
  for (const r of requeridos) {
    if (r.matriculaId != null) {
      porMatricula.set(r.matriculaId, [...(porMatricula.get(r.matriculaId) ?? []), r]);
    } else if (r.listaId != null) {
      porLista.set(r.listaId, [...(porLista.get(r.listaId) ?? []), r]);
    } else {
      sueltos.push(r);
    }
  }

  const filas: FilaSeguimiento[] = matriculas.map((m) => {
    // Mismo criterio que el checklist individual: el listado elegido manda, y
    // sin él se cae al camino viejo por nivel deduplicando por nombre.
    let suyos = m.listaId ? (porLista.get(m.listaId) ?? []) : [];
    if (!m.listaId) {
      const vistos = new Set<string>();
      suyos = sueltos
        .concat([...porLista.values()].flat())
        .filter((r) => r.nivel == null || mismoNivel(r.nivel, m.nivel))
        .filter((r) => {
          const k = r.nombre.trim().toLowerCase();
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        });
    }
    suyos = suyos.concat(porMatricula.get(m.id) ?? []);

    let aprobados = 0, faltan = 0, sinResolver = 0, porAprobar = 0;
    const pendientes: string[] = [];
    for (const r of suyos) {
      const estado = estadoDe.get(`${m.id}:${r.id}`) ?? 'pendiente';
      if (estado === 'aprobado') aprobados++;
      if (estado === 'recibido') porAprobar++;
      if ((r.exigencia as Exigencia) === 'requerido' && estado !== 'aprobado') {
        faltan++; pendientes.push(r.nombre);
      }
      if ((r.exigencia as Exigencia) === 'si_aplica' && !RESUELTOS.includes(estado)) {
        sinResolver++; pendientes.push(r.nombre);
      }
    }

    return {
      matriculaId: m.id,
      estudianteId: m.estudianteId,
      estudiante: [m.nombres, m.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre',
      curso: m.curso,
      nivel: m.nivel,
      email: m.email?.trim() || null,
      total: suyos.length,
      aprobados,
      faltan,
      sinResolver,
      porAprobar,
      completa: faltan === 0 && sinResolver === 0,
      pendientes,
    };
  });

  // Lo que falta primero, y dentro de eso el que más debe: es el orden en que
  // se reclama. Alfabético dejaría lo urgente repartido por toda la lista.
  filas.sort((a, b) => {
    if (a.completa !== b.completa) return a.completa ? 1 : -1;
    const d = (b.faltan + b.sinResolver) - (a.faltan + a.sinResolver);
    return d !== 0 ? d : a.estudiante.localeCompare(b.estudiante, 'es');
  });

  return {
    periodoId: periodo.id,
    periodoNombre: periodo.nombre,
    filas,
    totales: {
      matriculas: filas.length,
      completas: filas.filter((f) => f.completa).length,
      conPendientes: filas.filter((f) => !f.completa).length,
      porAprobar: filas.reduce((s, f) => s + f.porAprobar, 0),
      sinCorreo: filas.filter((f) => !f.completa && !f.email).length,
    },
  };
}

/** Los listados que existen, para el filtro de la pantalla. */
export function listasDelColegio(teamId: number) {
  return db.select({ id: adminEscolarDocumentoListas.id, nombre: adminEscolarDocumentoListas.nombre })
    .from(adminEscolarDocumentoListas)
    .where(and(
      eq(adminEscolarDocumentoListas.teamId, teamId),
      eq(adminEscolarDocumentoListas.activo, true),
    ));
}
