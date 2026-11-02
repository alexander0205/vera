/**
 * A quién se le cobra en «Cargo a varios alumnos»: a todo el colegio, a un
 * servicio, a un grado o a una sección.
 *
 * Cada nivel es un filtro completo. Antes la pantalla reutilizaba el selector
 * de matricular, que solo sabe guardar UNA sección: «Primaria» —que tiene
 * varios grados— no cabe en un id de sección, el control lo tomaba por una
 * elección a medias y se devolvía solo a «Todos los cursos». Solo se dejaba
 * elegir un servicio con un único grado y una única sección. No había forma de
 * cobrarle a «toda la sala de tareas»: tocaba repasar el colegio entero y
 * marcar a mano.
 *
 * Aquí el filtro guarda hasta dónde se acotó, y las secciones que le tocan se
 * calculan del catálogo — una lista de secciones es justo lo que la ruta de
 * generar ya sabe recibir (`cursoIds`).
 *
 * Todo es puro, sin React ni red, para poder probarlo: ver
 * `tests/unit/filtro-curso.test.ts`.
 */

import { esGradoSinGrado, textoDeCurso } from './sin-grado';

/** Una sección con su grado y su servicio, como la devuelve el catálogo de cursos. */
export interface CursoFiltrable {
  id: number; nombre: string;
  gradoId: number; gradoNombre: string;
  servicioId: number; servicioNombre: string; servicioTanda: string | null;
  /** El año escolar sale del servicio: una sección es de un solo año. */
  periodoId: number;
}

/**
 * Hasta dónde se acotó. Cada nivel cuelga del de arriba: con todo en `null` es
 * «Todos los cursos»; con solo el servicio, todos sus grados y secciones; con
 * el grado, todas sus secciones.
 */
export interface FiltroGrupo {
  servicioId: number | null;
  gradoId: number | null;
  cursoId: number | null;
  /**
   * Los alumnos sin grado de TODOS los servicios (ver `sin-grado.ts`). Va aparte
   * de los ids porque cruza servicios, y solo existe cuando está puesto.
   */
  sinGrado?: boolean;
}

export const TODOS_LOS_CURSOS: FiltroGrupo = { servicioId: null, gradoId: null, cursoId: null };
export const SIN_GRADO: FiltroGrupo = { ...TODOS_LOS_CURSOS, sinGrado: true };

type Nivel = 'servicio' | 'grado' | 'seccion';

/**
 * El filtro que queda al elegir algo en uno de los tres desplegables.
 *
 * Cambiar un nivel suelta los de debajo y nada más: el grado elegido era de
 * otro servicio y la sección de otro grado. Lo que NO hace es soltar el nivel
 * que se acaba de elegir, que era el fallo — `id` en `null` es la opción
 * «Todos»/«Todas» de ese desplegable.
 */
export function acotarFiltro(filtro: FiltroGrupo, nivel: Nivel, id: number | null): FiltroGrupo {
  if (nivel === 'servicio') return { servicioId: id, gradoId: null, cursoId: null };
  if (nivel === 'grado') return { servicioId: filtro.servicioId, gradoId: id, cursoId: null };
  return { servicioId: filtro.servicioId, gradoId: filtro.gradoId, cursoId: id };
}

/**
 * El filtro, recortado a lo que existe en el catálogo de este año escolar.
 *
 * Lo guardado puede quedarse viejo sin que nadie lo toque: se cambia de año,
 * o el catálogo se recarga y esa sección ya no está activa. Se conserva hasta
 * el último nivel que siga existiendo y se suelta el resto, de modo que los
 * desplegables enseñen siempre lo que de verdad se va a filtrar.
 */
export function normalizarFiltro(
  cursos: CursoFiltrable[], periodoId: number | null, filtro: FiltroGrupo,
): FiltroGrupo {
  if (filtro.sinGrado) return SIN_GRADO;
  const { servicioId, gradoId, cursoId } = filtro;
  const delServicio = cursos.filter((c) => c.periodoId === periodoId && c.servicioId === servicioId);
  if (servicioId == null || delServicio.length === 0) return TODOS_LOS_CURSOS;

  const delGrado = delServicio.filter((c) => c.gradoId === gradoId);
  if (gradoId == null || delGrado.length === 0) return { servicioId, gradoId: null, cursoId: null };

  if (cursoId == null || !delGrado.some((c) => c.id === cursoId)) return { servicioId, gradoId, cursoId: null };
  return { servicioId, gradoId, cursoId };
}

/**
 * Rellena los niveles de arriba cuando el filtro viene solo con el de abajo:
 * un enlace viejo `?curso=12` (antes Estudiantes solo filtraba por sección) o
 * un grado sin su servicio. Sin esto `normalizarFiltro`, que exige cada nivel
 * colgado del anterior, lo tiraría entero y el enlace dejaría de filtrar.
 */
export function completarFiltro(cursos: CursoFiltrable[], filtro: FiltroGrupo): FiltroGrupo {
  if (filtro.cursoId != null) {
    const c = cursos.find((x) => x.id === filtro.cursoId);
    if (c && filtro.servicioId == null && filtro.gradoId == null) {
      return { servicioId: c.servicioId, gradoId: c.gradoId, cursoId: c.id };
    }
  }
  if (filtro.gradoId != null && filtro.servicioId == null) {
    const c = cursos.find((x) => x.gradoId === filtro.gradoId);
    if (c) return { servicioId: c.servicioId, gradoId: c.gradoId, cursoId: filtro.cursoId };
  }
  return filtro;
}

/**
 * Las secciones que entran en el filtro, dentro del año escolar elegido.
 *
 * `null` es «Todos los cursos»: no hay nada que acotar y no se manda lista.
 * Una lista VACÍA es otra cosa —ese grupo no tiene secciones este año— y quien
 * llama no puede mandarla tal cual: la ruta de generar lee una lista vacía
 * como «sin filtro» y devolvería el colegio entero.
 *
 * Los niveles se exigen todos a la vez y siempre dentro del período. Así un
 * filtro que se quedó viejo —un servicio del año pasado, un grado que no es de
 * ese servicio— no encuentra a nadie, en vez de ensancharse a todo el colegio.
 */
export function seccionesDelFiltro(
  cursos: CursoFiltrable[], periodoId: number | null, filtro: FiltroGrupo,
): number[] | null {
  if (filtro.sinGrado) {
    return cursos.filter((c) => c.periodoId === periodoId && esGradoSinGrado(c.gradoNombre)).map((c) => c.id);
  }
  const { servicioId, gradoId, cursoId } = filtro;
  if (servicioId == null && gradoId == null && cursoId == null) return null;
  return cursos
    .filter((c) => c.periodoId === periodoId
      && (servicioId == null || c.servicioId === servicioId)
      && (gradoId == null || c.gradoId === gradoId)
      && (cursoId == null || c.id === cursoId))
    .map((c) => c.id);
}

export interface OpcionesFiltro {
  servicios: { id: number; etiqueta: string }[];
  grados: { id: number; nombre: string }[];
  secciones: { id: number; nombre: string }[];
  /** ¿Hay este año alguna sección de alumnos sin grado? */
  haySinGrado: boolean;
}

/** La tanda va con el nombre: «Primaria» matutina y vespertina son dos servicios. */
function etiquetaServicio(c: CursoFiltrable): string {
  return c.servicioTanda ? `${c.servicioNombre} · ${c.servicioTanda}` : c.servicioNombre;
}

/**
 * Lo que ofrece cada desplegable, en el orden del catálogo.
 *
 * Los grados son los del servicio elegido y las secciones las del grado
 * elegido: sin el nivel de arriba no hay nada que listar, y el desplegable se
 * queda en su «Todos»/«Todas».
 */
export function opcionesDelFiltro(
  cursos: CursoFiltrable[], periodoId: number | null, filtro: FiltroGrupo,
): OpcionesFiltro {
  const servicios = new Map<number, { id: number; etiqueta: string }>();
  const grados = new Map<number, { id: number; nombre: string }>();
  const secciones: { id: number; nombre: string }[] = [];
  let haySinGrado = false;

  for (const c of cursos) {
    if (c.periodoId !== periodoId) continue;
    if (esGradoSinGrado(c.gradoNombre)) haySinGrado = true;
    if (!servicios.has(c.servicioId)) servicios.set(c.servicioId, { id: c.servicioId, etiqueta: etiquetaServicio(c) });
    if (c.servicioId !== filtro.servicioId) continue;
    if (!grados.has(c.gradoId)) grados.set(c.gradoId, { id: c.gradoId, nombre: c.gradoNombre });
    if (c.gradoId === filtro.gradoId) secciones.push({ id: c.id, nombre: c.nombre });
  }
  return { servicios: [...servicios.values()], grados: [...grados.values()], secciones, haySinGrado };
}

/**
 * Cómo se llama el grupo elegido, para decirlo en la pantalla: «Sala de
 * tareas», «Segundo de Primaria · Matutina», «Segundo A de Primaria ·
 * Matutina». `null` cuando no se acotó, o cuando el filtro no apunta a nada de
 * este año.
 */
export function nombreDelGrupo(
  cursos: CursoFiltrable[], periodoId: number | null, filtro: FiltroGrupo,
): string | null {
  if (filtro.sinGrado) return 'Alumnos sin grado';
  const ids = seccionesDelFiltro(cursos, periodoId, filtro);
  const muestra = ids?.length ? cursos.find((c) => c.id === ids[0]) : undefined;
  if (!muestra) return null;
  const servicio = etiquetaServicio(muestra);
  if (filtro.gradoId == null) return servicio;
  const grado = filtro.cursoId == null ? muestra.gradoNombre : textoDeCurso(muestra.gradoNombre, muestra.nombre);
  return `${grado} de ${servicio}`;
}

/* ------------------------------------------------------------------ */
/*  Cuántos alumnos hay en cada grupo                                  */
/* ------------------------------------------------------------------ */

/**
 * Una matrícula activa, con lo justo para contar y para decir de qué curso es
 * cada alumno. Es lo que ya devuelve `GET /matriculas`; el tipo vive aquí para
 * que la pantalla no tenga que nombrar la sección por su id.
 */
export interface MatriculaActiva {
  estudianteId: number;
  cursoId: number | null;
  /** Nombre de la sección: «A», «Única». */
  curso: string | null;
  grado: string | null;
  servicio: string | null;
  tanda: string | null;
}

/** Alumnos distintos del año escolar: en total y por servicio, grado y sección. */
export interface ConteoAlumnos {
  total: number;
  porServicio: Record<number, number>;
  porGrado: Record<number, number>;
  porSeccion: Record<number, number>;
  /** Alumnos sin grado, de todos los servicios. */
  sinGrado: number;
}

/**
 * Cuántos alumnos hay en cada grupo, para ponerlo al lado de su nombre.
 *
 * «Sala de tareas · 5 alumnos» es lo que deja elegir sin equivocarse: quien
 * iba a cobrarle a la sala y ve «146» sabe que tocó donde no era ANTES de
 * continuar. Es solo una pista —la lista de verdad la da la ruta de generar—
 * y por eso la frase de cobrar nunca usa estos números.
 *
 * Se cruza con el catálogo ENTERO, también las secciones desactivadas, igual
 * que `seccionesDelFiltro`: sus alumnos siguen siendo de su servicio y se les
 * va a cobrar. Cada alumno cuenta una vez por grupo aunque tenga dos
 * matrículas, y una matrícula colgada de una sección de otro año no suma en
 * ningún grupo de este (sí en el total, que es lo que ve el servidor).
 */
export function contarAlumnos(
  cursos: CursoFiltrable[], periodoId: number | null, matriculas: MatriculaActiva[],
): ConteoAlumnos {
  const delAnio = new Map<number, CursoFiltrable>();
  for (const c of cursos) if (c.periodoId === periodoId) delAnio.set(c.id, c);

  const todos = new Set<number>();
  const servicios = new Map<number, Set<number>>();
  const grados = new Map<number, Set<number>>();
  const secciones = new Map<number, Set<number>>();
  const sinGrado = new Set<number>();
  const apuntar = (grupos: Map<number, Set<number>>, grupo: number, alumno: number) => {
    const yaEstan = grupos.get(grupo);
    if (yaEstan) yaEstan.add(alumno); else grupos.set(grupo, new Set([alumno]));
  };

  for (const m of matriculas) {
    todos.add(m.estudianteId);
    const seccion = m.cursoId == null ? undefined : delAnio.get(m.cursoId);
    if (!seccion) continue;
    apuntar(servicios, seccion.servicioId, m.estudianteId);
    apuntar(grados, seccion.gradoId, m.estudianteId);
    apuntar(secciones, seccion.id, m.estudianteId);
    if (esGradoSinGrado(seccion.gradoNombre)) sinGrado.add(m.estudianteId);
  }

  const tamanos = (grupos: Map<number, Set<number>>) => {
    const salida: Record<number, number> = {};
    for (const [grupo, alumnos] of grupos) salida[grupo] = alumnos.size;
    return salida;
  };
  return {
    total: todos.size,
    porServicio: tamanos(servicios),
    porGrado: tamanos(grados),
    porSeccion: tamanos(secciones),
    sinGrado: sinGrado.size,
  };
}

/**
 * De qué curso es cada alumno, escrito como se dice en el colegio: «Primero A ·
 * Primaria · Matutina». Va bajo el nombre en la lista de revisar, porque la
 * ruta de generar devuelve nombre y código pero no el curso, y con todo el
 * colegio delante «José Pérez» a secas no dice a cuál de los dos se le cobra.
 *
 * Vacío si la matrícula no tiene sección.
 */
export function cursoDeCadaAlumno(matriculas: MatriculaActiva[]): Map<number, string> {
  const salida = new Map<number, string>();
  for (const m of matriculas) {
    if (salida.has(m.estudianteId)) continue;
    const seccion = m.curso ? textoDeCurso(m.grado, m.curso) : '';
    salida.set(m.estudianteId, seccion ? [seccion, m.servicio, m.tanda].filter(Boolean).join(' · ') : '');
  }
  return salida;
}

/* ------------------------------------------------------------------ */
/*  Lo que se pregunta para elegir un grupo                            */
/* ------------------------------------------------------------------ */

/** Una opción que se puede tocar: trae ya el filtro que resulta de elegirla. */
export interface OpcionGrupo {
  id: string;
  etiqueta: string;
  filtro: FiltroGrupo;
  /** Alumnos del grupo. `null` si no se pudo contar: no se enseña número. */
  alumnos: number | null;
  /** ¿Es la que está elegida ahora? */
  puesta: boolean;
}

/** «¿A todo Primaria o solo a un curso?», con sus opciones. */
export interface PreguntaDeAfinar {
  id: 'curso' | 'seccion' | 'unico';
  pregunta: string;
  opciones: OpcionGrupo[];
}

export interface PreguntasDelFiltro {
  /** Un grupo por servicio del año escolar, en el orden del catálogo. */
  grupos: OpcionGrupo[];
  /** «Todo el colegio». */
  colegio: OpcionGrupo;
  /** Las preguntas para acotar dentro del servicio elegido. Vacío si no hay nada que acotar. */
  afinar: PreguntaDeAfinar[];
}

/**
 * Lo que se le enseña a la persona para elegir a quién: los servicios, «todo el
 * colegio» y, dentro del servicio elegido, hasta dos preguntas para quedarse
 * con un curso o una sección.
 *
 * Sustituye a los tres desplegables Servicio / Grado / Sección. Aquellos
 * obligaban a saber qué es cada palabra y a abrir tres listas para ver qué
 * había; aquí todo está a la vista y solo se pregunta lo que tiene respuesta:
 *
 *  - un servicio de una sola sección no pregunta nada;
 *  - uno con varios grados pregunta el curso, y si ese curso tiene varias
 *    secciones, la sección;
 *  - uno con un único grado y varias secciones pregunta directamente la
 *    sección (elegirla fija grado y sección a la vez).
 *
 * La primera opción de cada pregunta es el nivel de arriba entero («Todo»,
 * «Todo Primero»): parar en cualquier nivel sigue siendo una respuesta
 * completa. Cada opción trae su `FiltroGrupo` hecho con `acotarFiltro`, de
 * modo que el control solo tiene que devolverlo.
 *
 * Con `elegido` en false nadie viene marcado —ni «todo el colegio»— y no se
 * pregunta nada: la persona todavía no ha dicho a quién.
 */
export function preguntasDelFiltro(
  cursos: CursoFiltrable[], periodoId: number | null, filtro: FiltroGrupo,
  conteo: ConteoAlumnos | null, elegido: boolean,
): PreguntasDelFiltro {
  const cuenta = (grupo: Record<number, number> | undefined, id: number) =>
    (conteo && grupo ? grupo[id] ?? 0 : null);
  const delServicio = (servicioId: number) => acotarFiltro(TODOS_LOS_CURSOS, 'servicio', servicioId);

  const { servicios, grados, haySinGrado } = opcionesDelFiltro(cursos, periodoId, filtro);
  // El servicio automático «Sin grado» ya va dentro de «Alumnos sin grado».
  const grupos: OpcionGrupo[] = servicios.filter((s) => !esGradoSinGrado(s.etiqueta)).map((s) => ({
    id: `servicio-${s.id}`,
    etiqueta: s.etiqueta,
    filtro: delServicio(s.id),
    alumnos: cuenta(conteo?.porServicio, s.id),
    puesta: elegido && filtro.servicioId === s.id,
  }));
  if (haySinGrado) {
    grupos.push({
      id: 'sin-grado',
      etiqueta: 'Alumnos sin grado',
      filtro: SIN_GRADO,
      alumnos: conteo ? conteo.sinGrado : null,
      puesta: elegido && filtro.sinGrado === true,
    });
  }
  const colegio: OpcionGrupo = {
    id: 'colegio',
    etiqueta: 'Todo el colegio',
    filtro: TODOS_LOS_CURSOS,
    alumnos: conteo ? conteo.total : null,
    puesta: elegido && filtro.servicioId == null && !filtro.sinGrado,
  };

  const servicioId = filtro.servicioId;
  const servicio = servicios.find((s) => s.id === servicioId);
  if (!elegido || servicioId == null || !servicio) return { grupos, colegio, afinar: [] };

  const secciones = cursos.filter((c) => c.periodoId === periodoId && c.servicioId === servicioId);
  // Una sola sección: elegir el servicio ya es elegir la sección.
  if (secciones.length <= 1) return { grupos, colegio, afinar: [] };

  const todoElServicio: OpcionGrupo = {
    id: 'todo',
    etiqueta: 'Todo',
    filtro: delServicio(servicioId),
    alumnos: cuenta(conteo?.porServicio, servicioId),
    puesta: false,
  };
  const opcionDeSeccion = (c: CursoFiltrable): OpcionGrupo => ({
    id: `seccion-${c.id}`,
    etiqueta: textoDeCurso(c.gradoNombre, c.nombre),
    filtro: acotarFiltro(acotarFiltro(delServicio(servicioId), 'grado', c.gradoId), 'seccion', c.id),
    alumnos: cuenta(conteo?.porSeccion, c.id),
    puesta: filtro.cursoId === c.id,
  });

  if (grados.length === 1) {
    return {
      grupos, colegio,
      afinar: [{
        id: 'unico',
        pregunta: `¿A todo «${servicio.etiqueta}» o solo a una sección?`,
        opciones: [{ ...todoElServicio, puesta: filtro.cursoId == null }, ...secciones.map(opcionDeSeccion)],
      }],
    };
  }

  const afinar: PreguntaDeAfinar[] = [{
    id: 'curso',
    pregunta: `¿A todo «${servicio.etiqueta}» o solo a un curso?`,
    opciones: [
      { ...todoElServicio, puesta: filtro.gradoId == null },
      ...grados.map((g): OpcionGrupo => ({
        id: `grado-${g.id}`,
        etiqueta: g.nombre,
        filtro: acotarFiltro(delServicio(servicioId), 'grado', g.id),
        alumnos: cuenta(conteo?.porGrado, g.id),
        puesta: filtro.gradoId === g.id,
      })),
    ],
  }];

  const grado = grados.find((g) => g.id === filtro.gradoId);
  const delGrado = grado ? secciones.filter((c) => c.gradoId === grado.id) : [];
  if (grado && delGrado.length > 1) {
    afinar.push({
      id: 'seccion',
      pregunta: `¿A todo ${grado.nombre} o solo a una sección?`,
      opciones: [
        {
          id: 'todo-el-grado',
          etiqueta: `Todo ${grado.nombre}`,
          filtro: acotarFiltro(delServicio(servicioId), 'grado', grado.id),
          alumnos: cuenta(conteo?.porGrado, grado.id),
          puesta: filtro.cursoId == null,
        },
        ...delGrado.map(opcionDeSeccion),
      ],
    });
  }
  return { grupos, colegio, afinar };
}
