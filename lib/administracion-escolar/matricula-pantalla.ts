/**
 * Lo que necesitan las pantallas de «Nueva matrícula» y «Editar matrícula» y
 * no es pintar: a dónde se entra, a dónde se vuelve y qué hay que saber del
 * alumno antes de enseñar el formulario.
 *
 * Matricular y editar una matrícula eran un diálogo que se abría encima de la
 * ficha del alumno o del listado de Matriculación. Quien lo abría ya tenía los
 * datos en la mano —el alumno, sus otras matrículas— y se los pasaba. Ahora
 * son pantallas con dirección propia, y una dirección se puede abrir sola o
 * recargar: lo que antes llegaba por props hay que derivarlo aquí, con las
 * MISMAS reglas que usaba la ficha, para que el formulario arranque igual
 * entrando por donde se entre.
 *
 * TypeScript puro, sin React: lo usan las páginas de servidor (para validar lo
 * que viene en la dirección) y las de cliente. Tampoco sale a la red por su
 * cuenta —quien carga recibe con qué pedir—, así que
 * `tests/unit/matricula-pantalla.test.ts` lo prueba entero sin montar nada.
 */

/* ------------------------------------------------------------------ */
/*  Lo que viene en la dirección                                       */
/* ------------------------------------------------------------------ */

/** Base de mentira para resolver rutas relativas: solo se le mira el origen. */
const ORIGEN = 'http://interno.invalid';

/**
 * Una ruta de ESTE módulo: empieza por `/escolar/`, sin `//` (que además
 * descarta cualquier `protocolo://`) y sin barras invertidas, que los
 * navegadores leen como `/`.
 */
function esRutaDelModulo(ruta: string): boolean {
  return ruta.startsWith('/escolar/') && !ruta.includes('//') && !ruta.includes('\\');
}

/**
 * El `?volver=` de la dirección, si es de fiar; si no, `null`.
 *
 * Es texto que escribe cualquiera: basta con mandarle a alguien un enlace a
 * «Editar matrícula» con `?volver=https://otro-sitio` para que el botón de
 * guardar lo saque de la aplicación con la sesión abierta. Por eso solo vale
 * una ruta interna del módulo.
 *
 * Se mira dos veces: tal como llega y resuelta como la resolvería el
 * navegador. Así caen `/escolar/../dashboard`, que empieza bien y acaba fuera,
 * y el tabulador metido entre dos barras, que el navegador quita antes de
 * leerlas. Se devuelve la ruta ya resuelta, que es la que se validó.
 */
export function volverSeguro(crudo: unknown): string | null {
  if (typeof crudo !== 'string' || !esRutaDelModulo(crudo)) return null;
  let url: URL;
  try {
    url = new URL(crudo, ORIGEN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGEN) return null;
  const resuelta = `${url.pathname}${url.search}${url.hash}`;
  return esRutaDelModulo(resuelta) ? resuelta : null;
}

/**
 * Un id escrito en la dirección (`/matriculas/[id]/editar`, `?estudiante=`).
 *
 * Solo dígitos, entero y mayor que cero. `parseInt` se traga `12abc` como 12 y
 * las rutas de la API no lo comprueban: un id a medias acabaría pidiendo la
 * matrícula de otro.
 */
export function idDeRuta(crudo: unknown): number | null {
  if (typeof crudo !== 'string' || !/^[1-9]\d*$/.test(crudo)) return null;
  const n = Number(crudo);
  return Number.isSafeInteger(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/*  A dónde se entra                                                   */
/* ------------------------------------------------------------------ */

function conQuery(ruta: string, query: URLSearchParams): string {
  const qs = query.toString();
  return qs ? `${ruta}?${qs}` : ruta;
}

/**
 * La dirección de «Nueva matrícula».
 *
 * `estudianteId` cuando el alumno ya está decidido (se llega desde su ficha o
 * de darlo de alta); sin él la pantalla enseña el buscador de alumnos.
 * `volver` es la pantalla desde la que se sale, para regresar a ella.
 */
export function rutaNuevaMatricula(
  { estudianteId, volver }: { estudianteId?: number | null; volver?: string | null } = {},
): string {
  const q = new URLSearchParams();
  if (estudianteId != null) q.set('estudiante', String(estudianteId));
  if (volver) q.set('volver', volver);
  return conQuery('/escolar/matriculas/nueva', q);
}

/** La dirección de «Editar matrícula». */
export function rutaEditarMatricula(matriculaId: number, volver?: string | null): string {
  const q = new URLSearchParams();
  if (volver) q.set('volver', volver);
  return conQuery(`/escolar/matriculas/${matriculaId}/editar`, q);
}

/**
 * La ficha del alumno tal como se está viendo —su pestaña, su período—, para
 * volver a ella y no a su primera pestaña.
 *
 * `factura` no viaja: es lo que abre el cajón de facturar, y volver de editar
 * una matrícula no es pedir una factura.
 */
export function rutaDeVueltaALaFicha(estudianteId: number, query: string): string {
  const q = new URLSearchParams(query);
  q.delete('factura');
  return conQuery(`/escolar/estudiantes/${estudianteId}`, q);
}

/* ------------------------------------------------------------------ */
/*  A dónde se vuelve                                                  */
/* ------------------------------------------------------------------ */

export interface DestinoAlSalir {
  href: string;
  /** Lo que dice el enlace de volver: nombra el sitio al que lleva. */
  etiqueta: string;
}

/**
 * A dónde se va al guardar, al cancelar y con el enlace de volver.
 *
 * Manda el `volver` de la dirección si es de fiar. Si no viene (se abrió la
 * dirección a mano, o desde el alta de un alumno) o no vale, se cae en la
 * ficha del alumno cuando se sabe quién es, y en Matriculación cuando no.
 *
 * `volver` se valida AQUÍ otra vez aunque las páginas ya lo hagan: es la
 * última parada antes de navegar y no depende de que quien llame se acuerde.
 */
export function destinoAlSalir(
  { volver, estudianteId }: { volver?: string | null; estudianteId?: number | null },
): DestinoAlSalir {
  const seguro = volverSeguro(volver);
  const href = seguro
    ?? (estudianteId != null ? `/escolar/estudiantes/${estudianteId}` : '/escolar/matriculas');
  const ruta = href.split(/[?#]/)[0];
  const etiqueta = /^\/escolar\/estudiantes\/\d+$/.test(ruta) ? 'Volver al perfil'
    : ruta === '/escolar/matriculas' ? 'Volver a matriculación'
    : 'Volver';
  return { href, etiqueta };
}

/* ------------------------------------------------------------------ */
/*  Lo que antes llegaba por props                                     */
/* ------------------------------------------------------------------ */

/** Del alumno, lo que hace falta para matricularlo (`GET /estudiantes/[id]`). */
export interface AlumnoDeLaMatricula {
  nombres: string;
  apellidos: string;
  codigo: string | null;
  /** Registro Nacional del Estudiante. */
  codigoRne: string | null;
}

/** De cada matrícula suya, lo que cuenta (`GET /estudiantes/[id]/matriculas`). */
export interface MatriculaDelAlumno {
  periodoId: number;
  estado: string;
}

export interface DatosDelAlumno {
  /** Como lo escribe su ficha: nombres y apellidos. */
  nombre: string;
  /** Años en los que YA tiene una matrícula activa: no se pueden volver a elegir. */
  periodosOcupados: number[];
  /** Nunca estuvo matriculado. Cuenta todas sus matrículas, no solo las activas. */
  esPrimera: boolean;
  /** Con qué arranca el código de matrícula: su RNE, o el código que ya tenga. */
  codigoSugerido: string;
}

/**
 * Lo que la ficha del alumno le pasaba al diálogo, con sus mismas reglas.
 *
 * Están copiadas de ahí a propósito, palabra por palabra: dos matrículas
 * activas en el mismo período serían dos cuentas de cobro para un solo alumno,
 * y el código que el colegio maneja en papel es el RNE antes que el propio.
 */
export function datosDelAlumno(
  estudiante: AlumnoDeLaMatricula,
  matriculas: readonly MatriculaDelAlumno[],
): DatosDelAlumno {
  return {
    nombre: `${estudiante.nombres} ${estudiante.apellidos}`,
    periodosOcupados: matriculas.filter((m) => m.estado === 'activa').map((m) => m.periodoId),
    esPrimera: matriculas.length === 0,
    codigoSugerido: estudiante.codigoRne || estudiante.codigo || '',
  };
}

/** Lo que recibe el formulario de la matrícula, venga de donde venga. */
export interface ArranqueDelFormulario<M> {
  /** La matrícula que se edita, o `null` si se crea una. */
  matricula: M | null;
  /** El alumno ya decidido. `null` = se elige con el buscador. */
  estudianteFijoId: number | null;
  estudianteFijoNombre: string | null;
  periodosOcupados: number[];
  esPrimera: boolean;
  codigoSugerido: string;
}

/**
 * Con qué arranca el formulario según cómo se entró.
 *
 *  - Editar: la matrícula tal como la devuelve su ruta, y el alumno es el
 *    suyo. No hay primera vez ni código que sugerir: ya tiene los dos.
 *  - Nueva con alumno (`?estudiante=`): lo mismo que al abrirla desde su ficha.
 *  - Nueva sin alumno: nada decidido, como al abrirla desde Matriculación.
 */
export function arranqueDelFormulario<M extends { estudianteId: number }>(
  { matricula, estudianteId, alumno }: {
    matricula: M | null;
    /** El de `?estudiante=`; al editar manda el de la matrícula. */
    estudianteId: number | null;
    /** `null` cuando no hay alumno decidido. */
    alumno: DatosDelAlumno | null;
  },
): ArranqueDelFormulario<M> {
  const creando = matricula == null;
  return {
    matricula,
    estudianteFijoId: matricula ? matricula.estudianteId : estudianteId,
    estudianteFijoNombre: alumno?.nombre ?? null,
    periodosOcupados: alumno?.periodosOcupados ?? [],
    esPrimera: creando && alumno != null ? alumno.esPrimera : false,
    codigoSugerido: creando && alumno != null ? alumno.codigoSugerido : '',
  };
}

/* ------------------------------------------------------------------ */
/*  Cargar lo que antes llegaba por props                              */
/* ------------------------------------------------------------------ */

/** De una respuesta, lo que aquí se mira. `fetch` la cumple tal cual. */
export interface RespuestaDeRuta {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/** Con qué se pide una ruta de la API. En la pantalla es `fetch`. */
export type Pedir = (ruta: string) => Promise<RespuestaDeRuta>;

/** Cómo acabó la carga de la pantalla. «Cargando» lo pone quien espera. */
export type CargaDeLaMatricula<M> =
  /** No existe, o es de otro colegio: las rutas no lo distinguen, y no hace falta. */
  | { estado: 'no-existe'; que: 'matricula' | 'estudiante' }
  /** No se pudo saber: sin red, sesión caída, error del servidor. Se puede reintentar. */
  | { estado: 'fallo' }
  | { estado: 'lista'; arranque: ArranqueDelFormulario<M> };

/**
 * Pide lo que hace falta para enseñar el formulario y dice con qué arranca.
 *
 * Primero la matrícula (al editar), porque de ella sale de quién es; después,
 * a la vez, el alumno y sus matrículas: las mismas rutas que alimentan su
 * ficha. Sin alumno decidido no se pide nada: el formulario trae él solo la
 * lista para elegirlo.
 *
 * Nunca lanza. Un fallo de red o una respuesta que no es JSON es un «fallo»,
 * no un «no existe»: decirle a alguien que su matrícula no existe porque se le
 * cayó el wifi es mandarlo a buscar un error que no hay.
 */
export async function cargarArranque<M extends { estudianteId: number }>(
  { modo, matriculaId, estudianteId }: {
    modo: 'nueva' | 'editar';
    /** Al editar. `null` = el id de la dirección no era un número. */
    matriculaId: number | null;
    /** Al crear: el de `?estudiante=`, si lo hay. */
    estudianteId: number | null;
  },
  pedir: Pedir,
): Promise<CargaDeLaMatricula<M>> {
  try {
    let matricula: M | null = null;
    if (modo === 'editar') {
      // Un id que no es un número no puede ser de ninguna matrícula: ni se pide.
      if (matriculaId == null) return { estado: 'no-existe', que: 'matricula' };
      const res = await pedir(`/api/administracion-escolar/matriculas/${matriculaId}`);
      if (res.status === 404 || res.status === 400) return { estado: 'no-existe', que: 'matricula' };
      if (!res.ok) return { estado: 'fallo' };
      const data = await res.json() as { matricula?: M | null };
      if (!data.matricula) return { estado: 'fallo' };
      matricula = data.matricula;
    }

    const alumnoId = matricula ? matricula.estudianteId : estudianteId;
    if (alumnoId == null) {
      return { estado: 'lista', arranque: arranqueDelFormulario({ matricula, estudianteId: null, alumno: null }) };
    }

    const [resAlumno, resMatriculas] = await Promise.all([
      pedir(`/api/administracion-escolar/estudiantes/${alumnoId}`),
      pedir(`/api/administracion-escolar/estudiantes/${alumnoId}/matriculas`),
    ]);
    // Si el alumno existe lo dice SU ruta: la de sus matrículas contesta una
    // lista vacía para uno de otro colegio, que se leería como «nunca estuvo
    // matriculado». Al editar no puede faltar —la matrícula es suya—, así que
    // ahí un 404 es un fallo y no un «no existe».
    if (resAlumno.status === 404 && !matricula) return { estado: 'no-existe', que: 'estudiante' };
    if (!resAlumno.ok || !resMatriculas.ok) return { estado: 'fallo' };
    const [alumno, suyas] = await Promise.all([
      resAlumno.json() as Promise<{ estudiante?: AlumnoDeLaMatricula | null }>,
      resMatriculas.json() as Promise<{ matriculas?: MatriculaDelAlumno[] | null }>,
    ]);
    if (!alumno.estudiante) return { estado: 'fallo' };

    return {
      estado: 'lista',
      arranque: arranqueDelFormulario({
        matricula,
        estudianteId: alumnoId,
        alumno: datosDelAlumno(alumno.estudiante, suyas.matriculas ?? []),
      }),
    };
  } catch {
    return { estado: 'fallo' };
  }
}

/* ------------------------------------------------------------------ */
/*  Cabecera                                                           */
/* ------------------------------------------------------------------ */

/**
 * Título y subtítulo de la pantalla: los mismos que llevaba el diálogo.
 *
 * `esPrimera` cambia solo el texto, pero importa: «Nueva matrícula» delante de
 * alguien que nunca estuvo matriculado se lee como un trámite más, y lo que se
 * está haciendo es inscribirlo.
 */
export function titulosDeMatricula(
  { editando, esPrimera }: { editando: boolean; esPrimera: boolean },
): { titulo: string; subtitulo: string } {
  if (editando) {
    return {
      titulo: 'Editar matrícula',
      subtitulo: 'Corrige el curso, la fecha o el estado de esta inscripción.',
    };
  }
  if (esPrimera) {
    return {
      titulo: 'Matricular estudiante',
      subtitulo: 'Elige el período y el curso. De aquí sale su código de matrícula.',
    };
  }
  return {
    titulo: 'Nueva matrícula',
    subtitulo: 'Inscribe un estudiante en un período y curso.',
  };
}

/* ------------------------------------------------------------------ */
/*  La ficha que hay que refrescar                                     */
/* ------------------------------------------------------------------ */

/**
 * La clave con la que la ficha del alumno guarda sus datos en SWR.
 *
 * Está aquí porque la usan dos pantallas: la ficha, para pedirlos, y el
 * formulario de la matrícula, para avisar de que cambiaron. La ficha no vuelve
 * a pedir lo que pidió hace menos de 30 segundos (`dedupingInterval`), así que
 * sin ese aviso se vuelve de guardar una matrícula y se ve la de antes.
 */
export function claveFichaEstudiante(estudianteId: number): string {
  return `/api/administracion-escolar/estudiantes/${estudianteId}/ficha`;
}
