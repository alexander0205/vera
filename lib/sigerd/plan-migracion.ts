/**
 * Qué hay en el snapshot de SIGERD y qué de eso ya está en nuestras tablas.
 *
 * Es el motor del asistente de migración: cada paso enseña una tabla con lo que
 * el portal trajo, marcando qué es nuevo y qué ya existe, y el colegio decide
 * con casillas qué cruza de verdad.
 *
 * NO toca el portal. Lee `sigerd_importaciones`, que es la zona de espera donde
 * la descarga dejó las cosas. Esa separación es deliberada: bajar es lento y
 * frágil (depende del MINERD, de la sesión, de la red); cruzar es instantáneo y
 * se puede repetir. Mezclarlas haría que un corte del portal a mitad dejara
 * media escuela creada.
 *
 * Cómo se decide "ya existe", por orden de fiabilidad:
 *  - Estructura: por el id de SIGERD guardado en su día; si no, por nombre.
 *  - Estudiantes: por `sigerd_id`; si no, por RNE.
 *  - Personal: por `sigerd_id_persona`; si no, por cédula.
 *
 * Sin ninguna de las dos llaves la fila queda 'dudoso' y la decide una persona.
 * Adivinar por nombre en estudiantes sería peor que preguntar: hay hermanos con
 * el mismo nombre y apellido en el mismo centro.
 */

import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adminEscolarCursos, adminEscolarEstudiantes, adminEscolarGrados,
  adminEscolarServicios, sigerdImportaciones, sigerdPersonal,
} from '@/lib/db/schema';
import type { ArbolCentro } from './sync';

/** Estado de una fila frente a lo que ya tenemos. */
export type EstadoFila = 'nuevo' | 'existe' | 'dudoso';

export interface FilaSeccion {
  idSigerd: number;
  nombre: string;
  estudiantes: number;
  estado: EstadoFila;
  /** Id nuestro cuando ya existe. */
  id: number | null;
  /** Por qué se marcó así, para poder explicarlo en pantalla. */
  motivo: string;
}

export interface FilaGrado {
  idSigerd: number;
  nombre: string;
  estado: EstadoFila;
  id: number | null;
  motivo: string;
  secciones: FilaSeccion[];
}

export interface FilaServicio {
  idSigerd: number;
  nombre: string;
  estado: EstadoFila;
  id: number | null;
  motivo: string;
  grados: FilaGrado[];
}

export interface FilaPersona {
  idSigerd: number | null;
  nombre: string;
  cedula: string | null;
  cargo: string | null;
  /** "Activo"/"Inactivo" tal cual lo dice el portal. */
  estadoSigerd: string | null;
  estado: EstadoFila;
  motivo: string;
}

export interface FilaEstudiante {
  idSigerd: number;
  nombre: string;
  /** Ruta legible: "Primario · Primero · A". */
  ubicacion: string;
  estado: EstadoFila;
  motivo: string;
  /** Falso mientras la descarga no haya traído su ficha completa. */
  conFicha: boolean;
}

export interface PlanMigracion {
  anoAcademico: number | null;
  /** Cuándo se bajó el snapshot que se está mirando. */
  bajadoEn: Date | null;
  estructura: FilaServicio[];
  estudiantes: FilaEstudiante[];
  personal: FilaPersona[];
  /**
   * Los padres NO salen del snapshot todavía: en SIGERD cuelgan del expediente
   * de cada alumno y hacen falta tres llamadas por estudiante. Hasta que la
   * descarga larga los traiga, este paso enseña el aviso en vez de una tabla
   * vacía, que se leería como "este colegio no tiene padres registrados".
   */
  padresDisponibles: boolean;
  totales: {
    servicios: number; grados: number; secciones: number;
    estudiantes: number; personal: number;
    estudiantesConFicha: number;
  };
}

/** Normaliza para comparar nombres: sin tildes, sin dobles espacios, en minúsculas. */
function clave(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Cédula comparable: solo dígitos. El portal las escribe con y sin guiones. */
function soloDigitos(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

export async function construirPlan(teamId: number): Promise<PlanMigracion | null> {
  const [imp] = await db.select()
    .from(sigerdImportaciones)
    .where(and(eq(sigerdImportaciones.teamId, teamId), eq(sigerdImportaciones.estado, 'completado')))
    .limit(1);
  if (!imp?.dump) return null;

  const dump = imp.dump as Record<string, unknown>;
  const arbol = dump.estructura as ArbolCentro | undefined;
  const fichas = (dump.personalFichas ?? []) as Array<Record<string, unknown>>;
  const personalCrudo = (dump.personal ?? []) as Array<Record<string, unknown>>;
  const fichasEstudiante = (dump.estudianteFichas ?? []) as Array<Record<string, unknown>>;

  // ── Lo nuestro, de una vez: comparar fila a fila contra la base sería una
  // consulta por cada uno de los 465 estudiantes.
  const [servicios, grados, secciones, estudiantes, personalNuestro] = await Promise.all([
    db.select({ id: adminEscolarServicios.id, nombre: adminEscolarServicios.nombre, sigerd: adminEscolarServicios.sigerdServicioId })
      .from(adminEscolarServicios).where(eq(adminEscolarServicios.teamId, teamId)),
    db.select({ id: adminEscolarGrados.id, nombre: adminEscolarGrados.nombre, sigerd: adminEscolarGrados.sigerdGradoId })
      .from(adminEscolarGrados).where(eq(adminEscolarGrados.teamId, teamId)),
    db.select({ id: adminEscolarCursos.id, nombre: adminEscolarCursos.nombre, sigerd: adminEscolarCursos.sigerdSeccionId })
      .from(adminEscolarCursos).where(eq(adminEscolarCursos.teamId, teamId)),
    db.select({ id: adminEscolarEstudiantes.id, sigerd: adminEscolarEstudiantes.sigerdId, rne: adminEscolarEstudiantes.codigoRne })
      .from(adminEscolarEstudiantes).where(eq(adminEscolarEstudiantes.teamId, teamId)),
    db.select({ id: sigerdPersonal.id, sigerd: sigerdPersonal.sigerdIdPersona, cedula: sigerdPersonal.cedula })
      .from(sigerdPersonal).where(eq(sigerdPersonal.teamId, teamId)),
  ]);

  const porSigerd = <T extends { id: number; sigerd: number | null }>(xs: T[]) =>
    new Map(xs.filter((x) => x.sigerd != null).map((x) => [x.sigerd!, x]));
  const porNombre = <T extends { id: number; nombre: string }>(xs: T[]) =>
    new Map(xs.map((x) => [clave(x.nombre), x]));

  const svPorSigerd = porSigerd(servicios), svPorNombre = porNombre(servicios);
  const grPorSigerd = porSigerd(grados), grPorNombre = porNombre(grados);
  const sePorSigerd = porSigerd(secciones), sePorNombre = porNombre(secciones);

  const estPorSigerd = new Set(estudiantes.map((e) => e.sigerd).filter(Boolean) as number[]);
  const estPorRne = new Set(estudiantes.map((e) => e.rne).filter(Boolean) as string[]);
  const perPorSigerd = new Set(personalNuestro.map((p) => p.sigerd).filter(Boolean) as number[]);
  const perPorCedula = new Set(personalNuestro.map((p) => soloDigitos(p.cedula)).filter(Boolean));

  /** Empareja un nodo del árbol. El id de SIGERD manda; el nombre es el respaldo. */
  function emparejar(
    idSigerd: number, nombre: string,
    porId: Map<number, { id: number }>, porNom: Map<string, { id: number }>,
  ): { estado: EstadoFila; id: number | null; motivo: string } {
    const porIdHit = porId.get(idSigerd);
    if (porIdHit) return { estado: 'existe', id: porIdHit.id, motivo: 'Ya emparejado con SIGERD' };
    const porNomHit = porNom.get(clave(nombre));
    if (porNomHit) return { estado: 'existe', id: porNomHit.id, motivo: 'Mismo nombre' };
    return { estado: 'nuevo', id: null, motivo: 'No está en tu estructura' };
  }

  // ── Estructura ────────────────────────────────────────────────────────────
  const estructura: FilaServicio[] = (arbol?.servicios ?? []).map((sv) => ({
    idSigerd: sv.idServicio,
    nombre: sv.nombre,
    ...emparejar(sv.idServicio, sv.nombre, svPorSigerd, svPorNombre),
    grados: sv.grados.map((g) => ({
      idSigerd: g.idGrado,
      nombre: g.nombre,
      ...emparejar(g.idGrado, g.nombre, grPorSigerd, grPorNombre),
      secciones: g.secciones.map((s) => ({
        idSigerd: s.idSeccion,
        nombre: s.nombre,
        estudiantes: s.estudiantes.length,
        ...emparejar(s.idSeccion, s.nombre, sePorSigerd, sePorNombre),
      })),
    })),
  }));

  // ── Estudiantes ───────────────────────────────────────────────────────────
  const rnePorSigerd = new Map<number, string | null>(
    fichasEstudiante.map((f) => [Number(f.idSigerd), (f.codigoRNE as string | null) ?? null]),
  );

  const filasEstudiante: FilaEstudiante[] = [];
  for (const sv of arbol?.servicios ?? []) {
    for (const g of sv.grados) {
      for (const s of g.secciones) {
        for (const e of s.estudiantes) {
          const rne = rnePorSigerd.get(e.id) ?? null;
          const yaPorId = estPorSigerd.has(e.id);
          const yaPorRne = rne != null && estPorRne.has(rne);
          filasEstudiante.push({
            idSigerd: e.id,
            nombre: e.nombre.trim(),
            ubicacion: `${sv.nombre} · ${g.nombre} · ${s.nombre}`,
            conFicha: rnePorSigerd.has(e.id),
            estado: yaPorId || yaPorRne ? 'existe' : 'nuevo',
            motivo: yaPorId ? 'Mismo id de SIGERD'
              : yaPorRne ? 'Mismo RNE'
              : rne == null && rnePorSigerd.has(e.id) ? 'Sin RNE: revísalo a mano'
              : 'No está en tu sistema',
          });
        }
      }
    }
  }
  // Sin RNE no hay forma fiable de saber si ya está: se marca para que lo mire
  // una persona en vez de crear un duplicado en silencio.
  for (const f of filasEstudiante) {
    if (f.estado === 'nuevo' && f.conFicha && !rnePorSigerd.get(f.idSigerd)) f.estado = 'dudoso';
  }

  // ── Personal ──────────────────────────────────────────────────────────────
  // El listado del portal viene en PascalCase (`Id`, `Cargo`, `Cedula`…), no en
  // el camelCase de las fichas. Son dos endpoints distintos del mismo SIGERD.
  const datosPorPersona = new Map<number, { cargo: string | null; estado: string | null }>(
    personalCrudo.map((p) => [Number(p.Id), {
      cargo: (p.Cargo as string | null) ?? null,
      estado: (p.Estado as string | null) ?? null,
    }]),
  );

  // El dump trae 27 fichas para 23 personas: el portal repite a quien tiene más
  // de un cargo en el centro. Sin esto, el asistente ofrecería crear cuatro
  // empleados que son los mismos de más arriba en la misma tabla.
  const vistos = new Set<string>();
  const personal: FilaPersona[] = [];
  for (const f of fichas) {
    const idp = f.idPersona != null ? Number(f.idPersona) : null;
    const ced = soloDigitos(f.cedula as string | null);
    const huella = idp != null ? `id:${idp}` : ced !== '' ? `ced:${ced}` : '';
    if (huella && vistos.has(huella)) continue;
    if (huella) vistos.add(huella);

    const yaPorId = idp != null && perPorSigerd.has(idp);
    const yaPorCed = ced !== '' && perPorCedula.has(ced);
    const extra = idp != null ? datosPorPersona.get(idp) : undefined;
    personal.push({
      idSigerd: idp,
      nombre: [f.primerNombre, f.segundoNombre, f.primerApellido, f.segundoApellido]
        .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || 'Sin nombre',
      cedula: (f.cedula as string | null) ?? null,
      cargo: extra?.cargo ?? null,
      estadoSigerd: extra?.estado ?? null,
      estado: yaPorId || yaPorCed ? 'existe' : ced === '' && idp == null ? 'dudoso' : 'nuevo',
      motivo: yaPorId ? 'Mismo id de SIGERD'
        : yaPorCed ? 'Misma cédula'
        : ced === '' && idp == null ? 'Sin cédula ni id: revísalo a mano'
        : 'No está en tu sistema',
    });
  }

  const conFicha = filasEstudiante.filter((e) => e.conFicha).length;

  return {
    anoAcademico: (dump.anoAcademico as number | undefined) ?? imp.anoAcademico ?? null,
    bajadoEn: imp.completadoEn ?? imp.createdAt ?? null,
    estructura,
    estudiantes: filasEstudiante,
    personal,
    // Los parientes vendrán con la descarga larga; hoy el dump no los trae.
    padresDisponibles: Array.isArray(dump.parientes) && (dump.parientes as unknown[]).length > 0,
    totales: {
      servicios: estructura.length,
      grados: estructura.reduce((n, s) => n + s.grados.length, 0),
      secciones: estructura.reduce((n, s) => n + s.grados.reduce((m, g) => m + g.secciones.length, 0), 0),
      estudiantes: filasEstudiante.length,
      personal: personal.length,
      estudiantesConFicha: conFicha,
    },
  };
}
