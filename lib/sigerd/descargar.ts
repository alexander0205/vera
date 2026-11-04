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

interface OpcionesDescarga {
  anoAcademico: number;
  conPersonal?: boolean;
  /** Añade la condición final a cada sección (+1 petición por sección). */
  conCondicionFinal?: boolean;
  /** Añade la ficha detallada de cada empleado (+1 petición por empleado). */
  conFichaPersonal?: boolean;
  /**
   * Añade la ficha de 29 campos de cada estudiante único del árbol (dedup por
   * id; +1 petición por estudiante, ~465 para un centro típico). Es lo que más
   * pesa: con ella la descarga pasa de ~1 min a varios.
   */
  conFichaEstudiante?: boolean;
}

/**
 * Una petición de las que se hacen DESPUÉS de la estructura: la condición final
 * de una sección (por índices del árbol, para escribirla en su sitio) o la ficha
 * de un empleado o de un estudiante.
 */
export type TareaDescarga =
  | { tipo: 'condicion'; s: number; g: number; sec: number }
  | { tipo: 'ficha-personal'; id: number }
  | { tipo: 'ficha-estudiante'; id: number };

/**
 * Una descarga a medias: lo ya traído y lo que falta pedir.
 *
 * Existe porque un centro grande no cabe en una llamada de Vercel (300 s): son
 * una petición por estudiante, otra por empleado y otra por sección. Cada
 * llamada avanza lo que le dé tiempo y guarda esto; la siguiente sigue donde
 * quedó. Es JSON plano a propósito: se guarda tal cual en la base.
 */
export interface DescargaParcial {
  anoAcademico: number;
  estructura: ArbolCentro;
  personal: EmpleadoSigerd[];
  puestos: PuestoSigerd[];
  personalFichas: FichaPersonalSigerd[];
  estudianteFichas: FichaEstudianteSigerd[];
  /** Lo que falta por pedir, en orden: condiciones, fichas de personal, de estudiantes. */
  pendientes: TareaDescarga[];
  /** Cuántas tareas tenía la descarga al empezar (para decir «N de M»). */
  total: number;
}

/**
 * Primera parte: la estructura (servicios, grados, secciones y alumnos), el
 * personal y el catálogo de cargos, que son pocas peticiones, y la lista de lo
 * que falta. No pide ninguna ficha.
 */
export async function iniciarDescarga(
  cli: SigerdClient,
  params: OpcionesDescarga,
  onProgreso?: ProgresoSync,
): Promise<DescargaParcial> {
  const estructura = await recopilarCentro(cli, { anoAcademico: params.anoAcademico }, onProgreso);

  let personal: EmpleadoSigerd[] = [];
  let puestos: PuestoSigerd[] = [];
  if (params.conPersonal !== false) {
    onProgreso?.('personal', 0, 1);
    const ctx = await contextoCentroSesion(cli);
    personal = await personalDeCentro(cli, ctx);
    puestos = await catalogoPuestos(cli);
    onProgreso?.('personal', 1, 1);
  }

  const pendientes: TareaDescarga[] = [];
  if (params.conCondicionFinal) {
    estructura.servicios.forEach((s, si) => s.grados.forEach((g, gi) => g.secciones.forEach((_, ki) => {
      pendientes.push({ tipo: 'condicion', s: si, g: gi, sec: ki });
    })));
  }
  // El grid de personal da una fila por (persona, puesto): el mismo Id puede
  // venir repetido. Su ficha es una sola.
  if (params.conPersonal !== false && params.conFichaPersonal) {
    for (const id of new Set(personal.map((e) => e.Id))) pendientes.push({ tipo: 'ficha-personal', id });
  }
  // Un estudiante no debería repetirse entre secciones, pero si pasara no se
  // pide su ficha dos veces.
  if (params.conFichaEstudiante) {
    for (const id of idsEstudiantes(estructura)) pendientes.push({ tipo: 'ficha-estudiante', id });
  }

  return {
    anoAcademico: params.anoAcademico,
    estructura,
    personal,
    puestos,
    personalFichas: [],
    estudianteFichas: [],
    pendientes,
    total: pendientes.length,
  };
}

function idsEstudiantes(estructura: ArbolCentro): number[] {
  const ids = new Set<number>();
  for (const s of estructura.servicios)
    for (const g of s.grados)
      for (const sec of g.secciones)
        for (const e of sec.estudiantes) ids.add(e.id);
  return [...ids];
}

/**
 * Pide tareas pendientes, en orden, hasta que se acaben o se pase `hasta` (ms
 * desde epoch; `Infinity` = todas). Escribe lo traído en `parcial` y quita cada
 * tarea de `pendientes` al terminarla, así que se puede retomar en otra llamada
 * con otra sesión. Una ficha que falla tras los reintentos se salta, como
 * siempre hizo la descarga completa.
 *
 * La primera ficha de cada tipo en cada llamada abre su módulo del portal
 * (`precargar`); las siguientes reusan esa página.
 */
export async function avanzarDescarga(
  cli: SigerdClient,
  parcial: DescargaParcial,
  hasta: number,
  onProgreso?: ProgresoSync,
): Promise<number> {
  const abiertos = new Set<TareaDescarga['tipo']>();
  let hechas = 0;
  while (parcial.pendientes.length > 0 && Date.now() < hasta) {
    const t = parcial.pendientes[0];
    const precargar = !abiertos.has(t.tipo);
    abiertos.add(t.tipo);

    if (t.tipo === 'condicion') {
      const s = parcial.estructura.servicios[t.s];
      const g = s?.grados[t.g];
      const sec = g?.secciones[t.sec];
      if (s && g && sec) {
        const r = await conReintento(() =>
          condicionFinalPorSeccion(cli, {
            idServicioCentro: s.idServicio,
            idGrado: g.idGrado,
            idSeccion: sec.idSeccion,
            idAnoLectivo: parcial.anoAcademico,
          }),
        );
        if (r) sec.condicionFinal = r.rows ?? [];
      }
    } else if (t.tipo === 'ficha-personal') {
      const ficha = await conReintento(() => traerFichaPersonal(cli, t.id, { precargar }));
      if (ficha) parcial.personalFichas.push(ficha);
    } else {
      const ficha = await conReintento(() => traerFichaEstudiante(cli, t.id, { precargar }));
      if (ficha) parcial.estudianteFichas.push(ficha);
    }

    parcial.pendientes.shift();
    hechas++;
    onProgreso?.(t.tipo, parcial.total - parcial.pendientes.length, parcial.total);
  }
  return hechas;
}

/** El volcado final a partir de una descarga ya sin pendientes. */
export function armarDump(
  parcial: DescargaParcial,
  estudianteParientes: { idEstudiante: number; parientes: ParienteSigerd[] }[] = [],
): DumpCentro {
  const { estructura } = parcial;
  return {
    anoAcademico: parcial.anoAcademico,
    contexto: {
      idRegional: estructura.idRegional,
      idDistrito: estructura.idDistrito,
      idCentro: estructura.idCentro,
    },
    estructura,
    personal: parcial.personal,
    personalFichas: parcial.personalFichas,
    puestos: parcial.puestos,
    estudianteFichas: parcial.estudianteFichas,
    estudianteParientes,
    totales: {
      servicios: estructura.totales.servicios,
      grados: estructura.totales.grados,
      secciones: estructura.totales.secciones,
      estudiantes: estructura.totales.estudiantes,
      empleados: parcial.personal.length,
      seccionesConError: estructura.totales.seccionesConError,
      nFichasEstudiante: parcial.estudianteFichas.length,
      nParientes: estudianteParientes.reduce((n, e) => n + e.parientes.length, 0),
    },
  };
}

/**
 * Descarga el centro completo de una vez (estructura + roster + personal y, si
 * se piden, condiciones y fichas). Para la ruta de desarrollo y la consola; la
 * pantalla del colegio va por tandas (`iniciarDescarga` + `avanzarDescarga`).
 *
 * `conPersonal` por defecto true — el usuario lo pidió explícitamente. El centro
 * NO se recibe del cliente: sale de la sesión del portal.
 */
export async function descargarTodo(
  cli: SigerdClient,
  params: OpcionesDescarga & {
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
  const parcial = await iniciarDescarga(cli, params, onProgreso);
  await avanzarDescarga(cli, parcial, Infinity, onProgreso);

  // Responsables (padre/madre/tutor) por estudiante — 3 peticiones cada uno.
  // Solo se guardan los estudiantes con al menos un responsable.
  const estudianteParientes: { idEstudiante: number; parientes: ParienteSigerd[] }[] = [];
  if (params.conParientes) {
    const lista = idsEstudiantes(parcial.estructura);
    for (const [i, idEstudiante] of lista.entries()) {
      const parientes = await conReintento(() =>
        traerParientesEstudiante(cli, idEstudiante, { precargar: i === 0 }),
      );
      if (parientes && parientes.length) estudianteParientes.push({ idEstudiante, parientes });
      onProgreso?.('parientes', i + 1, lista.length);
    }
  }

  return armarDump(parcial, estudianteParientes);
}
