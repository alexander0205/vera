/**
 * "Descargar todo" — volcado completo y de SOLO LECTURA de un centro.
 *
 * No toca la base de datos. Junta en un objeto todo lo que SIGERD expone del
 * centro de la sesión y lo devuelve tal cual, para que el usuario tenga el
 * dataset íntegro y decida después qué importar.
 *
 * Dos niveles de profundidad, por el costo en peticiones:
 *   - `descargarTodo`  (esto): estructura + lista de estudiantes + personal.
 *     ~60 peticiones para Andrés Bello. Cabe en una llamada de Vercel.
 *   - fichas de 29 campos por estudiante: opcional vía `conFichaEstudiante`,
 *     una petición por estudiante único del árbol (~465 para Andrés Bello,
 *     varios minutos). Sigue existiendo aparte el flujo en lotes
 *     (`/api/sigerd/enriquecer`) para alimentar el módulo escolar, que no usa
 *     esta opción ni depende de ella.
 *
 * Endpoints que toca (todos verificados):
 *   contexto   GET  /modulo-registro/FichaPersonal/ListaPersonal
 *   servicios  POST /commons/servicios/servicios-por-idcentro
 *   grados     POST /commons/tiposperiodos/tipos-periodos-por-servicioscentro-condicion-academica
 *   secciones  POST /commons/secciones/secciones-por-idserviciocentro-idtipoperiodo
 *   alumnos    POST /ModuloReportes/Estudiantes/estudiantes
 *   personal   POST /FichaPersonal/grid-ficha
 *   puestos    POST /modulo-registro/FichaPersonal/obtenerPuestos
 */

import type { SigerdClient } from './client';
import { recopilarCentro, type ArbolCentro, type ProgresoSync } from './sync';
import { condicionFinalPorSeccion } from './consultas';
import { traerFichaEstudiante, type FichaEstudianteSigerd } from './ficha';
import { traerParientesEstudiante, type ParienteSigerd } from './parientes';
import { traerFichaPersonal, type FichaPersonalSigerd } from './ficha-personal';
import {
  catalogoPuestos,
  contextoCentroSesion,
  personalDeCentro,
  type EmpleadoSigerd,
  type PuestoSigerd,
} from './personal';

/** Reintenta una lectura ante fallos transitorios del portal (hasta 3 intentos). */
async function conReintento<T>(fn: () => Promise<T>): Promise<T | null> {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      return await fn();
    } catch {
      if (intento < 3) await new Promise((r) => setTimeout(r, 500 * intento));
    }
  }
  return null;
}

export interface DumpCentro {
  anoAcademico: number;
  contexto: { idRegional: number; idDistrito: number; idCentro: number };
  /** Estructura académica + lista de estudiantes por sección (sin ficha). */
  estructura: ArbolCentro;
  /** Empleados del centro (nombre, cédula, cargo, estado). Vacío si no se pidió. */
  personal: EmpleadoSigerd[];
  /**
   * Ficha detallada de cada empleado (identidad + contacto + sexo + fecha), sólo
   * si se pidió `fichaPersonal`. Indexada por `idPersona` (= EmpleadoSigerd.Id).
   */
  personalFichas: FichaPersonalSigerd[];
  /** Catálogo de cargos del MINERD (168), para dar contexto a `personal`. */
  puestos: PuestoSigerd[];
  /**
   * Ficha de 29 campos de cada estudiante único del árbol (sexo, nacionalidad,
   * RNE, estado civil, teléfonos, acta de nacimiento con libro/folio/año/
   * municipioJCE/oficialíaJCE, dirección completa, programa, tarjeta de
   * solidaridad…), sólo si se pidió `conFichaEstudiante`. Indexada por
   * `idSigerd` (= id de `estudiantes` en `estructura`). Vacío si no se pidió.
   *
   * DATOS SENSIBLES: expediente de menores (dirección, acta de nacimiento). No
   * loguear su contenido.
   */
  estudianteFichas: FichaEstudianteSigerd[];
  /**
   * Responsables (padre/madre/tutor) por estudiante, sólo si se pidió
   * `conParientes`. Solo se listan los estudiantes que tienen al menos uno.
   * DATOS SENSIBLES: cédula/teléfono/dirección de familiares de menores.
   */
  estudianteParientes: { idEstudiante: number; parientes: ParienteSigerd[] }[];
  totales: {
    servicios: number;
    grados: number;
    secciones: number;
    estudiantes: number;
    empleados: number;
    seccionesConError: number;
    /** Fichas de estudiante traídas (0 si no se pidió `conFichaEstudiante`). */
    nFichasEstudiante: number;
    /** Total de responsables traídos (0 si no se pidió `conParientes`). */
    nParientes: number;
  };
}

/**
 * Descarga el centro completo (nivel estructura + roster + personal).
 *
 * `conPersonal` por defecto true — el usuario lo pidió explícitamente. El centro
 * NO se recibe del cliente: sale de la sesión del portal.
 */
export async function descargarTodo(
  cli: SigerdClient,
  params: {
    anoAcademico: number;
    conPersonal?: boolean;
    /** Añade la condición final a cada sección (+1 petición por sección). */
    conCondicionFinal?: boolean;
    /** Añade la ficha detallada de cada empleado (+1 petición por empleado). */
    conFichaPersonal?: boolean;
    /**
     * Añade la ficha de 29 campos de cada estudiante único del árbol (dedup por
     * id; +1 petición por estudiante, ~465 para un centro típico). El flujo pasa
     * de ~1 min a ~4-5 min — esperado, no es un bug.
     */
    conFichaEstudiante?: boolean;
    /**
     * Añade los responsables (padre/madre/tutor) de cada estudiante (+3
     * peticiones por estudiante, ~1400 en un centro típico). MUY pesado: para
     * dev o descargas por lotes, NO para el sync masivo en prod (excede el
     * maxDuration=300 de Vercel).
     */
    conParientes?: boolean;
  },
  onProgreso?: ProgresoSync,
): Promise<DumpCentro> {
  const estructura = await recopilarCentro(cli, { anoAcademico: params.anoAcademico }, onProgreso);

  // Condición final por sección: recorre el árbol ya recopilado y añade a cada
  // sección la lista de estudiantes con su condición (Promovido/Reprobado/…).
  if (params.conCondicionFinal) {
    let hechas = 0;
    for (const s of estructura.servicios) {
      for (const g of s.grados) {
        for (const sec of g.secciones) {
          const r = await conReintento(() =>
            condicionFinalPorSeccion(cli, {
              idServicioCentro: s.idServicio,
              idGrado: g.idGrado,
              idSeccion: sec.idSeccion,
              idAnoLectivo: params.anoAcademico,
            }),
          );
          if (r) sec.condicionFinal = r.rows ?? [];
          onProgreso?.('condicion', ++hechas, estructura.totales.secciones);
        }
      }
    }
  }

  // Ficha de 29 campos por estudiante: recorre el árbol ya recopilado, dedup
  // por id (un estudiante no debería repetirse entre secciones, pero si pasara
  // no queremos pedir su ficha dos veces) y trae una por una.
  let estudianteFichas: FichaEstudianteSigerd[] = [];
  if (params.conFichaEstudiante) {
    const idsUnicos = new Set<number>();
    for (const s of estructura.servicios) {
      for (const g of s.grados) {
        for (const sec of g.secciones) {
          for (const e of sec.estudiantes) idsUnicos.add(e.id);
        }
      }
    }

    const ids = [...idsUnicos];
    for (const [i, idEstudiante] of ids.entries()) {
      const ficha = await conReintento(() => traerFichaEstudiante(cli, idEstudiante, { precargar: i === 0 }));
      if (ficha) estudianteFichas.push(ficha);
      onProgreso?.('ficha-estudiante', i + 1, ids.length);
    }
  }

  // Responsables (padre/madre/tutor) por estudiante — 3 peticiones cada uno.
  // Solo se guardan los estudiantes con al menos un responsable.
  const estudianteParientes: { idEstudiante: number; parientes: ParienteSigerd[] }[] = [];
  if (params.conParientes) {
    const ids = new Set<number>();
    for (const s of estructura.servicios)
      for (const g of s.grados)
        for (const sec of g.secciones)
          for (const e of sec.estudiantes) ids.add(e.id);

    const lista = [...ids];
    for (const [i, idEstudiante] of lista.entries()) {
      const parientes = await conReintento(() =>
        traerParientesEstudiante(cli, idEstudiante, { precargar: i === 0 }),
      );
      if (parientes && parientes.length) estudianteParientes.push({ idEstudiante, parientes });
      onProgreso?.('parientes', i + 1, lista.length);
    }
  }

  let personal: EmpleadoSigerd[] = [];
  let personalFichas: FichaPersonalSigerd[] = [];
  let puestos: PuestoSigerd[] = [];

  if (params.conPersonal !== false) {
    onProgreso?.('personal', 0, 1);
    const ctx = await contextoCentroSesion(cli);
    personal = await personalDeCentro(cli, ctx);
    puestos = await catalogoPuestos(cli);
    onProgreso?.('personal', 1, 1);

    if (params.conFichaPersonal) {
      for (const [i, emp] of personal.entries()) {
        const ficha = await conReintento(() => traerFichaPersonal(cli, emp.Id, { precargar: i === 0 }));
        if (ficha) personalFichas.push(ficha);
        onProgreso?.('ficha-personal', i + 1, personal.length);
      }
    }
  }

  return {
    anoAcademico: params.anoAcademico,
    contexto: {
      idRegional: estructura.idRegional,
      idDistrito: estructura.idDistrito,
      idCentro: estructura.idCentro,
    },
    estructura,
    personal,
    personalFichas,
    puestos,
    estudianteFichas,
    estudianteParientes,
    totales: {
      servicios: estructura.totales.servicios,
      grados: estructura.totales.grados,
      secciones: estructura.totales.secciones,
      estudiantes: estructura.totales.estudiantes,
      empleados: personal.length,
      seccionesConError: estructura.totales.seccionesConError,
      nFichasEstudiante: estudianteFichas.length,
      nParientes: estudianteParientes.reduce((n, e) => n + e.parientes.length, 0),
    },
  };
}
