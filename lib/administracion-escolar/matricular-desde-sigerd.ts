/**
 * Matricular de una vez a los alumnos según la sección que dice SIGERD.
 *
 * `cruzarEstudiantes` crea los alumnos pero a propósito NO los matricula: la
 * matrícula lleva conceptos y cargos que el portal no trae. La sección, en
 * cambio, sí la trae, y quedaba en el snapshot sin uso: el colegio tenía que
 * matricular uno por uno, o sección por sección en el lote, algo que SIGERD ya
 * sabía. Esto cierra ese hueco con la misma regla del lote —todos los conceptos
 * con tarifa en la sección, como los deja marcados el selector de plan—, así
 * que la matrícula queda completa y cobrando, no a medias.
 *
 * Solo entra quien se puede emparejar sin adivinar:
 *  - el alumno, por `sigerd_id` o por RNE (igual que `construirPlan`);
 *  - la sección, por `sigerd_seccion_id` y DENTRO del año escolar activo.
 * El resto se cuenta y se explica, no se fuerza.
 */
import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCursos, adminEscolarEstudiantes, adminEscolarGrados,
  adminEscolarMatriculas, adminEscolarPeriodos, adminEscolarServicios,
  sigerdImportaciones,
} from '@/lib/db/schema';
import { matricularLote } from './matricula-lote';
import type { ArbolCentro } from '@/lib/sigerd/sync';

export interface GrupoSigerd {
  cursoId: number;
  /** "Primero — A · Matutina". */
  curso: string;
  /** Grado, para agrupar secciones en pantalla ("Primero"). */
  grado: string;
  /** Nombre de la sección ("A"). */
  seccion: string;
  /** Tanda o servicio ("Matutina"). */
  tanda: string | null;
  estudiantes: Array<{ id: number; nombre: string }>;
}

/** Alguien que SIGERD lista pero que no se puede matricular, y dónde lo tiene. */
export interface OmitidoSigerd {
  nombre: string;
  /** Ruta que dice SIGERD: "Primario · Primero · A". */
  ubicacion: string;
}

export interface PendientesSigerd {
  /** Falso si no hay descarga de SIGERD o no hay año escolar activo. */
  disponible: boolean;
  motivo?: string;
  periodo: { id: number; nombre: string } | null;
  anoAcademico: number | null;
  /** Por sección: lo que el botón va a matricular. */
  grupos: GrupoSigerd[];
  /** Cuántos se matricularían (suma de los grupos). */
  porMatricular: number;
  /** Ya tienen matrícula activa en el período: se dejan como están. */
  yaMatriculados: number;
  /** Están en SIGERD pero no como estudiantes activos: sin cruzar, o dados de baja. */
  sinEstudiante: OmitidoSigerd[];
  /** Su sección de SIGERD no está enlazada a una sección del año activo. */
  sinSeccion: OmitidoSigerd[];
}

const vacio = (motivo: string): PendientesSigerd => ({
  disponible: false, motivo, periodo: null, anoAcademico: null,
  grupos: [], porMatricular: 0, yaMatriculados: 0, sinEstudiante: [], sinSeccion: [],
});

export async function pendientesDesdeSigerd(teamId: number): Promise<PendientesSigerd> {
  // La descarga más reciente: es la que dice dónde está cada alumno este año.
  const [imp] = await db.select({ dump: sigerdImportaciones.dump, ano: sigerdImportaciones.anoAcademico })
    .from(sigerdImportaciones)
    .where(and(eq(sigerdImportaciones.teamId, teamId), eq(sigerdImportaciones.estado, 'completado')))
    .orderBy(desc(sigerdImportaciones.anoAcademico))
    .limit(1);
  const dump = (imp?.dump ?? null) as Record<string, unknown> | null;
  const arbol = dump?.estructura as ArbolCentro | undefined;
  if (!arbol) return vacio('No hay descarga de SIGERD todavía.');

  const [periodo] = await db.select({ id: adminEscolarPeriodos.id, nombre: adminEscolarPeriodos.nombre })
    .from(adminEscolarPeriodos)
    .where(and(eq(adminEscolarPeriodos.teamId, teamId), eq(adminEscolarPeriodos.activo, true)))
    .limit(1);
  if (!periodo) return vacio('No hay año escolar activo.');

  // Secciones del año activo enlazadas a SIGERD. Una sección de otro año con el
  // mismo id de SIGERD no vale: matricularía en la estructura del año pasado.
  const [cursos, estudiantes] = await Promise.all([
    db.select({
      id: adminEscolarCursos.id,
      nombre: adminEscolarCursos.nombre,
      sigerd: adminEscolarCursos.sigerdSeccionId,
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
    db.select({
      id: adminEscolarEstudiantes.id,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      sigerd: adminEscolarEstudiantes.sigerdId,
      rne: adminEscolarEstudiantes.codigoRne,
    })
      .from(adminEscolarEstudiantes)
      .where(and(eq(adminEscolarEstudiantes.teamId, teamId), eq(adminEscolarEstudiantes.estado, 'activo'))),
  ]);

  const cursoPorSeccion = new Map(cursos.filter((c) => c.sigerd != null).map((c) => [c.sigerd!, c]));
  const estPorSigerd = new Map(estudiantes.filter((e) => e.sigerd != null).map((e) => [e.sigerd!, e]));
  const estPorRne = new Map(estudiantes.filter((e) => e.rne).map((e) => [e.rne!, e]));
  const fichas = (dump?.estudianteFichas ?? []) as Array<Record<string, unknown>>;
  const rnePorSigerd = new Map(fichas.map((f) => [Number(f.idSigerd), (f.codigoRNE as string | null) ?? null]));

  // Quien ya tiene matrícula activa este año no se toca: si SIGERD dice otra
  // sección, eso es un cambio de sección y lo decide una persona.
  const ids = estudiantes.map((e) => e.id);
  const activas = ids.length
    ? await db.select({ estudianteId: adminEscolarMatriculas.estudianteId })
        .from(adminEscolarMatriculas)
        .where(and(
          eq(adminEscolarMatriculas.teamId, teamId),
          eq(adminEscolarMatriculas.periodoId, periodo.id),
          eq(adminEscolarMatriculas.estado, 'activa'),
          inArray(adminEscolarMatriculas.estudianteId, ids),
        ))
    : [];
  const conMatricula = new Set(activas.map((m) => m.estudianteId));

  const grupos = new Map<number, GrupoSigerd>();
  const vistos = new Set<number>();
  let yaMatriculados = 0;
  const sinEstudiante: OmitidoSigerd[] = [];
  const sinSeccion: OmitidoSigerd[] = [];

  for (const sv of arbol.servicios) {
    for (const g of sv.grados) {
      for (const s of g.secciones) {
        const curso = cursoPorSeccion.get(s.idSeccion);
        const ubicacion = `${sv.nombre} · ${g.nombre} · ${s.nombre}`;
        for (const e of s.estudiantes) {
          const rne = rnePorSigerd.get(e.id);
          const est = estPorSigerd.get(e.id) ?? (rne ? estPorRne.get(rne) : undefined);
          if (!est) { sinEstudiante.push({ nombre: e.nombre.trim(), ubicacion }); continue; }
          // El portal a veces repite a un alumno en dos secciones; vale la primera.
          if (vistos.has(est.id)) continue;
          vistos.add(est.id);
          if (conMatricula.has(est.id)) { yaMatriculados++; continue; }
          if (!curso) { sinSeccion.push({ nombre: `${est.nombres} ${est.apellidos}`.trim(), ubicacion }); continue; }

          let grupo = grupos.get(curso.id);
          if (!grupo) {
            const partes = [curso.grado, curso.nombre].filter(Boolean).join(' — ');
            grupo = {
              cursoId: curso.id,
              curso: curso.tanda ? `${partes} · ${curso.tanda}` : partes,
              grado: curso.grado,
              seccion: curso.nombre,
              tanda: curso.tanda,
              estudiantes: [],
            };
            grupos.set(curso.id, grupo);
          }
          grupo.estudiantes.push({ id: est.id, nombre: `${est.nombres} ${est.apellidos}`.trim() });
        }
      }
    }
  }

  const lista = [...grupos.values()].sort((a, b) => a.curso.localeCompare(b.curso, 'es'));
  return {
    disponible: true,
    periodo,
    anoAcademico: (dump?.anoAcademico as number | undefined) ?? imp?.ano ?? null,
    grupos: lista,
    porMatricular: lista.reduce((n, g) => n + g.estudiantes.length, 0),
    yaMatriculados, sinEstudiante, sinSeccion,
  };
}

export interface ResultadoDesdeSigerd {
  creadas: number;
  conflicto: number;
  error: number;
  /** Lo mismo, sección por sección: así se ve dónde quedó cada grupo. */
  secciones: Array<{ curso: string; esperadas: number; creadas: number; conflicto: number; error: number }>;
  /** Secciones que no se pudieron procesar enteras, con el motivo. */
  fallos: Array<{ curso: string; motivo: string }>;
}

/**
 * Matricula a todos los pendientes: un lote por sección, con todos los
 * conceptos que tienen tarifa en ella. Se recalcula aquí lo pendiente en vez de
 * fiarse de lo que enseñó la pantalla: entre una cosa y otra pudo cambiar.
 */
export async function matricularDesdeSigerd(teamId: number): Promise<ResultadoDesdeSigerd> {
  const p = await pendientesDesdeSigerd(teamId);
  const r: ResultadoDesdeSigerd = { creadas: 0, conflicto: 0, error: 0, secciones: [], fallos: [] };
  if (!p.disponible || !p.periodo) {
    r.fallos.push({ curso: 'SIGERD', motivo: p.motivo ?? 'No disponible' });
    return r;
  }

  for (const g of p.grupos) {
    try {
      const lote = await matricularLote({
        teamId,
        periodoId: p.periodo.id,
        cursoId: g.cursoId,
        estudianteIds: g.estudiantes.map((e) => e.id),
        conceptos: 'todos',
        notas: 'Matriculado desde SIGERD.',
        dryRun: false,
      });
      const error = lote.resumen.error + lote.resumen.invalido;
      r.creadas += lote.resumen.crear;
      r.conflicto += lote.resumen.conflicto;
      r.error += error;
      r.secciones.push({
        curso: g.curso, esperadas: g.estudiantes.length,
        creadas: lote.resumen.crear, conflicto: lote.resumen.conflicto, error,
      });
    } catch (err) {
      console.error('[matricular-desde-sigerd] sección', g.cursoId, err);
      r.fallos.push({ curso: g.curso, motivo: err instanceof Error ? err.message : 'Error' });
    }
  }
  return r;
}
