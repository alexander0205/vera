/**
 * Consultas de SIGERD — solo lectura.
 *
 * Los endpoints salieron de leer los bundles JS del portal, que se sirven sin
 * autenticación bajo `/Areas/<Modulo>/Scripts/*.js`. Todos se invocan como
 * `$.post(rootDir + "Ctrl/Accion", { … })`: POST con form-urlencoded y respuesta
 * JSON. Por eso aquí se usa `postForm` y no `GET`.
 *
 * DELIBERADAMENTE FUERA DE ESTE MÓDULO — el portal los expone, pero escriben o
 * borran y no tienen por qué existir en nuestro código:
 *   - `modulo-registro/inscripcion/delete-matricula`
 *   - `modulo-registro/FichaPersonal/{Activar,Desactivar,Eliminar}Puesto`
 *   - `AdministracionPortal/Administracion/UpdateHomeImage`
 *
 * Si alguna vez hiciera falta escribir en SIGERD, debe ser una decisión
 * explícita con su propia revisión, no una función que se cuele aquí.
 */

import type { SigerdClient } from './client';

/** Vistas que hay que abrir antes de pedirle datos a su grid. */
const PAGINA_INSCRIPCION = '/modulo-registro/inscripcion';
const PAGINA_DISTRIBUCION = '/modulo-planeacion-academica/distribucionsecciones/distribucion-secciones';
const PAGINA_CONDICION_ACADEMICA = '/modulo-registro/inscripcion/condicion-academica';
const PAGINA_REPORTE_MATRICULA = '/ModuloReportes/Estudiantes/reporte-estudiantes-matricula';

// ─── Formas de respuesta ───────────────────────────────────────────────────

/** Catálogo estándar del portal: los combos se llenan con `Id` y `Nombre`. */
export interface SigerdCatalogo {
  Id: number;
  Nombre: string;
}

/** Algunos catálogos de secciones traen cupo máximo y descripción. */
export interface SigerdSeccion extends SigerdCatalogo {
  Tope?: number;
  Descripcion?: string;
}

/**
 * Respuesta del grid de estudiantes (jQuery Bootgrid). `rows` llega con las
 * columnas que el portal decida; se tipa laxo a propósito para no inventar un
 * contrato que no hemos visto entero.
 */
export interface SigerdPaginado<T = Record<string, unknown>> {
  current: number;
  rowCount: number;
  rows: T[];
  total: number;
}

/**
 * Fila del grid de estudiantes, con los nombres de columna que devuelve el
 * portal de verdad (verificados contra una respuesta real). Ojo: no coinciden
 * con los nombres de los filtros que se envían — el buscador manda
 * `primerApellido` pero la respuesta trae `Apellido1`.
 */
export interface SigerdEstudianteFila extends Record<string, unknown> {
  /** Entero de 8 dígitos. */
  IdEstudiante?: number;
  /** Número Único de Identificación. Llega `null` en muchos registros. */
  Nui?: string | null;
  Nombres?: string;
  Nombre2?: string | null;
  Apellido1?: string;
  Apellido2?: string | null;
  /** Registro Nacional del Estudiante. Longitud variable (vistos 13 y 16) y ausente en parte del padrón. */
  CodigoRNE?: string | null;
  /** Cadena de 10 caracteres (fecha ya formateada, no ticks de .NET). */
  FechaNacimiento?: string | null;
}

/** Columnas por las que el grid acepta ordenar. */
export type ColumnaOrdenEstudiante =
  | 'IdEstudiante'
  | 'Nui'
  | 'Nombres'
  | 'Nombre2'
  | 'Apellido1'
  | 'Apellido2'
  | 'CodigoRNE'
  | 'FechaNacimiento';

// ─── Filtros ───────────────────────────────────────────────────────────────

export interface FiltrosEstudiantes {
  nombres?: string;
  primerApellido?: string;
  segundoApellido?: string;
  /** Registro Nacional del Estudiante. */
  rne?: string;
  /** Número Único de Identificación. */
  nui?: string;
  fechaNacimiento?: string;
  idEstudiante?: string | number;
  /** Página (Bootgrid la llama `current`, empieza en 1). */
  pagina?: number;
  /** Filas por página. El portal ofrece 10, 25, 50, 100 y 500. */
  porPagina?: number;
  /** Búsqueda libre del propio grid. */
  busqueda?: string;
  /**
   * Orden. NO es opcional para el portal: si el POST llega sin `sort[...]`,
   * la acción de MVC revienta con un 500 (verificado). Por eso siempre se
   * envía uno, con `Apellido1 asc` por defecto.
   */
  ordenarPor?: ColumnaOrdenEstudiante;
  direccion?: 'asc' | 'desc';
  /**
   * Abre la vista del módulo antes de consultar (por defecto sí). Ponlo en
   * `false` solo si ya la abriste en esta misma sesión y quieres ahorrar el
   * viaje extra.
   */
  precargar?: boolean;
}

// ─── Consultas ─────────────────────────────────────────────────────────────

/**
 * Buscador de estudiantes del módulo de inscripción.
 *
 * `POST /modulo-registro/inscripcion/lista-estudiantes-json`
 *
 * El portal exige al menos un criterio: sin filtros devuelve vacío en vez de
 * listar el centro entero.
 */
export async function buscarEstudiantes(
  cli: SigerdClient,
  filtros: FiltrosEstudiantes = {},
): Promise<SigerdPaginado<SigerdEstudianteFila>> {
  // El grid vive dentro de esta vista y el portal arma estado al renderizarla.
  // Sin abrirla primero, el POST "en frío" devuelve el login.
  if (filtros.precargar !== false) await cli.abrirModulo(PAGINA_INSCRIPCION);

  return cli.postForm<SigerdPaginado<SigerdEstudianteFila>>(
    '/modulo-registro/inscripcion/lista-estudiantes-json',
    {
      nombres: filtros.nombres ?? '',
      primerApellido: filtros.primerApellido ?? '',
      segundoApellido: filtros.segundoApellido ?? '',
      rne: filtros.rne ?? '',
      nui: filtros.nui ?? '',
      fechaNacimiento: filtros.fechaNacimiento ?? '',
      idEstudiante: filtros.idEstudiante ?? '',
      // Paginación de Bootgrid.
      current: filtros.pagina ?? 1,
      rowCount: filtros.porPagina ?? 25,
      searchPhrase: filtros.busqueda ?? '',
      // Obligatorio: sin `sort[...]` la acción devuelve 500.
      [`sort[${filtros.ordenarPor ?? 'Apellido1'}]`]: filtros.direccion ?? 'asc',
    },
    { referer: PAGINA_INSCRIPCION },
  );
}

/**
 * Estudiante con su condición académica final (pantalla Condición Académica Final).
 * Campos verificados contra una respuesta real (Secundario 3ro A, 32 filas).
 */
export interface EstudianteCondicionFinal {
  idEstudiante: number;
  idMatricula: number;
  nombre: string;
  /** Estado de la matrícula (texto). */
  estadoMatricula: string;
  /** Orden del estudiante dentro de la sección. */
  ordenEnSeccion: number;
  edad: number | null;
  /** Formato dd/MM/yyyy como en el resto del portal. */
  fechaNacimiento: string | null;
  /** Id de condición: 0 NoDefinido · 2 Abandono · 3 Promovido · 4 Reprobado · 8 Transferido · 23 Aplazado. */
  IdCondicionAcademica: number;
  nombreCondicionAcademica: string;
}

/**
 * Estudiantes de una sección CON su condición académica final.
 *
 * `POST /modulo-registro/inscripcion/GetListEstudiantesCondicionAcademicaFinal`
 * con `idServicioCentro`, `idGrado`, `idSeccion`, `idAnoLectivo`, `esPrimerIngreso`
 * en query string y la paginación de Bootgrid en el cuerpo.
 *
 * Más rico que el roster: trae la condición final (Promovido/Reprobado/…). La
 * condición sólo está "definida" en años ya cerrados; en el año en curso suele
 * venir `NoDefinido`. SOLO LECTURA — actualizarla es otra acción
 * (UpdateCondicionAcademicaFinal) que NO se toca desde aquí.
 */
export async function condicionFinalPorSeccion(
  cli: SigerdClient,
  params: { idServicioCentro: number; idGrado: number; idSeccion: number; idAnoLectivo: number },
): Promise<SigerdPaginado<EstudianteCondicionFinal>> {
  await cli.abrirModulo(PAGINA_CONDICION_ACADEMICA);

  const qs = new URLSearchParams({
    idServicioCentro: String(params.idServicioCentro),
    idGrado: String(params.idGrado),
    idSeccion: String(params.idSeccion),
    idAnoLectivo: String(params.idAnoLectivo),
    esPrimerIngreso: 'true',
  });

  return cli.postForm<SigerdPaginado<EstudianteCondicionFinal>>(
    `/modulo-registro/inscripcion/GetListEstudiantesCondicionAcademicaFinal?${qs}`,
    { current: 1, rowCount: -1, searchPhrase: '' },
    { referer: PAGINA_CONDICION_ACADEMICA },
  );
}

/**
 * Estudiantes matriculados en una sección.
 *
 * `POST /ModuloReportes/Estudiantes/estudiantes` → `{ Id, Nombre }[]`, donde
 * `Nombre` es el nombre completo ya concatenado.
 *
 * `IdCentro` es OBLIGATORIO y tiene que ser el código del centro (p. ej. 5807).
 * Verificado: vacío o ausente da 500, y un id que no corresponde — como el de
 * un servicio — devuelve un array vacío en vez de error. Ojo con eso: un centro
 * equivocado parece "sección sin estudiantes".
 */
export async function estudiantesPorSeccion(
  cli: SigerdClient,
  params: { idCentro: number; idSeccion: number },
): Promise<SigerdCatalogo[]> {
  return cli.postForm<SigerdCatalogo[]>(
    '/ModuloReportes/Estudiantes/estudiantes',
    {
      IdCentro: params.idCentro,
      IdSeccion: params.idSeccion,
    },
    { referer: PAGINA_REPORTE_MATRICULA },
  );
}

/**
 * Servicios (niveles/modalidades) que ofrece un centro en un año académico.
 * Es el primer eslabón: casi todo lo demás pide un `idServicioCentro`.
 *
 * `POST /commons/servicios/servicios-por-idcentro`
 */
export async function serviciosPorCentro(
  cli: SigerdClient,
  params: { idCentro: number; idAnoAcademico?: number },
): Promise<SigerdCatalogo[]> {
  return cli.postForm<SigerdCatalogo[]>('/commons/servicios/servicios-por-idcentro', {
    id: params.idCentro,
    idAnoAcademico: params.idAnoAcademico ?? 0,
  });
}

/**
 * Secciones de un servicio para un tipo de período (grado).
 *
 * `POST /commons/secciones/secciones-por-idserviciocentro-idtipoperiodo`
 */
export async function seccionesPorServicio(
  cli: SigerdClient,
  params: { idServicioCentro: number; idTipoPeriodo: number; idAnoAcademico?: number },
): Promise<SigerdSeccion[]> {
  return cli.postForm<SigerdSeccion[]>(
    '/commons/secciones/secciones-por-idserviciocentro-idtipoperiodo',
    {
      idServicioCentro: params.idServicioCentro,
      idTipoPeriodo: params.idTipoPeriodo,
      idAnoAcademico: params.idAnoAcademico ?? 0,
    },
  );
}

/**
 * Tipos de período (grados) de un servicio, según condición académica.
 *
 * `POST /commons/tiposperiodos/tipos-periodos-por-servicioscentro-condicion-academica`
 */
export async function tiposPeriodosPorServicio(
  cli: SigerdClient,
  params: { idServicioCentro: number; idAnoAcademico?: number },
): Promise<SigerdCatalogo[]> {
  return cli.postForm<SigerdCatalogo[]>(
    '/commons/tiposperiodos/tipos-periodos-por-servicioscentro-condicion-academica',
    {
      idServicioCentro: params.idServicioCentro,
      idAnoAcademico: params.idAnoAcademico ?? 0,
    },
  );
}

/**
 * Condiciones académicas válidas para un grado concreto.
 *
 * `POST /modulo-registro/inscripcion/GetCondicionesAcademicasXNivel?idServicioCentro=&idGrado=`
 *
 * El catálogo NO es fijo: depende del nivel. Verificado en el centro 05807 —
 * los grados de primaria y secundaria añaden `Aplazado (23)`, e inicial ni
 * siquiera ofrece `Reprobado (4)`. Por eso hay que pedirlo por grado y no
 * cachear una lista única.
 */
export async function condicionesAcademicas(
  cli: SigerdClient,
  params: { idServicioCentro: number; idGrado: number },
): Promise<SigerdCatalogo[]> {
  const qs = new URLSearchParams({
    idServicioCentro: String(params.idServicioCentro),
    idGrado: String(params.idGrado),
  });

  return cli.postForm<SigerdCatalogo[]>(
    `/modulo-registro/inscripcion/GetCondicionesAcademicasXNivel?${qs}`,
    {},
    { referer: PAGINA_CONDICION_ACADEMICA },
  );
}

/**
 * Años académicos disponibles para un servicio.
 *
 * `POST /ModuloReportes/Estudiantes/jsonAnios?IdServicioCentro=…`
 * El portal pasa este parámetro por query string, no en el cuerpo.
 */
export async function aniosAcademicos(
  cli: SigerdClient,
  idServicioCentro: number,
): Promise<SigerdCatalogo[]> {
  return cli.postForm<SigerdCatalogo[]>(
    `/ModuloReportes/Estudiantes/jsonAnios?IdServicioCentro=${encodeURIComponent(idServicioCentro)}`,
    {},
  );
}

/**
 * Distribución de estudiantes por sección, paginada.
 *
 * `POST /modulo-planeacion-academica/distribucionsecciones/lista-distribucion-estudiantes-json`
 * Los tres filtros van en query string; la paginación, en el cuerpo.
 *
 * `opcion` la fija el portal según la pestaña del grid (sin distribuir vs.
 * distribuidos); se expone tal cual porque no hay catálogo documentado.
 */
export async function distribucionEstudiantes(
  cli: SigerdClient,
  params: {
    idServicioCentro: number;
    idTipoPeriodo: number;
    opcion: number | string;
    pagina?: number;
    porPagina?: number;
    precargar?: boolean;
  },
): Promise<SigerdPaginado<SigerdEstudianteFila>> {
  if (params.precargar !== false) await cli.abrirModulo(PAGINA_DISTRIBUCION);

  const qs = new URLSearchParams({
    IdServicioCentro: String(params.idServicioCentro),
    IdTipoPeriodo: String(params.idTipoPeriodo),
    Opcion: String(params.opcion),
  });

  return cli.postForm<SigerdPaginado<SigerdEstudianteFila>>(
    `/modulo-planeacion-academica/distribucionsecciones/lista-distribucion-estudiantes-json?${qs}`,
    {
      current: params.pagina ?? 1,
      rowCount: params.porPagina ?? 25,
      searchPhrase: '',
      // Mismo grid (Bootgrid) que el de estudiantes: sin `sort[...]` da 500.
      'sort[IdEstudiante]': 'asc',
    },
    { referer: PAGINA_DISTRIBUCION },
  );
}

/**
 * Reporte de matrícula de un estudiante.
 *
 * `POST /ModuloReportes/Estudiantes/InfoReporteEstudiantesMatricula/` con
 * `{ id: centro, id2: estudiante }`.
 *
 * Devuelve **HTML**, no JSON: el portal lo inyecta tal cual en la página. Si
 * hiciera falta como datos, hay que parsearlo aparte.
 */
export async function reporteMatriculaEstudiante(
  cli: SigerdClient,
  params: { idCentro: number; idEstudiante: number },
): Promise<string> {
  const body = new URLSearchParams({
    id: String(params.idCentro),
    id2: String(params.idEstudiante),
  });

  return cli.html('/ModuloReportes/Estudiantes/InfoReporteEstudiantesMatricula/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  });
}

/**
 * Centros de uno o varios distritos educativos.
 *
 * `POST /commons/centros/centros-por-distritos-educativos/{distritos}[/{cerrados}]`
 * Los distritos van en la ruta separados por coma, no en el cuerpo.
 */
export async function centrosPorDistritos(
  cli: SigerdClient,
  params: { distritos: Array<number | string>; incluirCerrados?: boolean },
): Promise<SigerdCatalogo[]> {
  const lista = params.distritos.map((d) => encodeURIComponent(String(d))).join(',');
  const sufijo = params.incluirCerrados === undefined ? '' : `/${params.incluirCerrados}`;

  return cli.postForm<SigerdCatalogo[]>(
    `/commons/centros/centros-por-distritos-educativos/${lista}${sufijo}`,
    {},
  );
}
