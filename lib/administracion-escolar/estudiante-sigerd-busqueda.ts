/**
 * «Buscar este estudiante en SIGERD»: con qué se busca en el portal a un alumno
 * que YA tenemos, y cuándo lo que devuelve se puede dar por bueno sin preguntar.
 *
 * Es `estudiante-sigerd-campos.ts` mirado desde el otro lado: allí se traduce
 * la ficha del portal a nuestras columnas; aquí, nuestra ficha a los filtros de
 * su buscador. Vive fuera del diálogo porque las dos decisiones tienen
 * consecuencias —elegir a un alumno le ata tutores al momento— y dentro de un
 * componente no hay forma de probarlas.
 *
 * Sin `server-only`: lo usa el diálogo, que corre en el navegador.
 */

import { partirApellidos } from '@/lib/sigerd/nombres';
import { aFechaISO } from '@/lib/sigerd/fechas';

/** Los siete filtros del buscador del portal, con SUS nombres. */
export interface CriteriosSigerd {
  nombres: string;
  primerApellido: string;
  segundoApellido: string;
  rne: string;
  nui: string;
  idEstudiante: string;
  fechaNacimiento: string;
}

const SIN_CRITERIOS: CriteriosSigerd = {
  nombres: '', primerApellido: '', segundoApellido: '',
  rne: '', nui: '', idEstudiante: '', fechaNacimiento: '',
};

/**
 * Lo que hace falta de nuestra ficha. Todo puede faltar: un alumno creado a
 * mano no tiene id de SIGERD ni RNE, y la pantalla se pinta vacía si la carga
 * falló.
 */
export interface FichaParaBuscar {
  sigerdId?: number | null;
  codigoRne?: string | null;
  nombres?: string | null;
  apellidos?: string | null;
  /** `yyyy-MM-dd`, como la guarda la ficha. */
  fechaNacimiento?: string | null;
}

export interface BusquedaDeFicha {
  /**
   * Con qué se busca. No es un adorno: un identificador señala a UNA persona y
   * un nombre no, y de eso depende que el resultado se pueda elegir solo.
   */
  por: 'id' | 'rne' | 'nombre';
  criterios: CriteriosSigerd;
  /**
   * La fecha de nacimiento de la ficha (`yyyy-MM-dd`), solo al buscar por RNE.
   *
   * NO es un filtro —no viaja al portal—: es con qué se comprueba, antes de
   * elegir solo, que el RNE devolvió al mismo niño. El id de SIGERD lo pone el
   * sistema; el RNE lo teclea una persona.
   */
  nacio?: string;
}

/**
 * Los criterios para buscar en el portal al alumno de esta ficha, o `null` si
 * la ficha no trae nada con qué buscar.
 *
 * Se usa UN solo camino, el más preciso que haya, y nunca dos a la vez: el
 * portal junta los filtros con «y», así que un id bueno acompañado de un nombre
 * con una letra distinta no devuelve a nadie y parece que el alumno no existe.
 *
 *   1. el id de SIGERD — es la clave del padrón y filtra exacto;
 *   2. el RNE;
 *   3. el nombre, que es lo único que tiene un alumno creado a mano.
 *
 * `soloPorNombre` se salta los dos primeros. Es la salida para cuando el
 * identificador de la ficha es justo lo que está en duda —quedó enlazada a un
 * homónimo, o el RNE se copió mal—: buscando por él volvería siempre el mismo
 * alumno, se elegiría solo y el enlace equivocado no tendría arreglo.
 */
export function busquedaDesdeFicha(
  ficha: FichaParaBuscar,
  { soloPorNombre = false }: { soloPorNombre?: boolean } = {},
): BusquedaDeFicha | null {
  const id = ficha.sigerdId;
  if (!soloPorNombre && typeof id === 'number' && Number.isInteger(id) && id > 0) {
    return { por: 'id', criterios: { ...SIN_CRITERIOS, idEstudiante: String(id) } };
  }

  const fecha = (ficha.fechaNacimiento ?? '').trim();
  const fechaIso = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : '';

  const rne = (ficha.codigoRne ?? '').trim();
  if (!soloPorNombre && rne) {
    return { por: 'rne', criterios: { ...SIN_CRITERIOS, rne }, ...(fechaIso ? { nacio: fechaIso } : {}) };
  }

  const nombres = (ficha.nombres ?? '').replace(/\s+/g, ' ').trim();
  const apellidos = partirApellidos(ficha.apellidos ?? '');
  // Una fecha suelta no identifica a nadie en un padrón nacional.
  if (!nombres && !apellidos.primero) return null;

  return {
    por: 'nombre',
    criterios: {
      ...SIN_CRITERIOS,
      // Solo el PRIMER nombre. El portal guarda el segundo en otra columna
      // (`Nombre2`) y no tiene filtro para ella; si `nombres` compara contra la
      // primera, como `primerApellido` contra `Apellido1`, los dos juntos no
      // encuentran a nadie. No está comprobado contra el portal, y por eso se
      // va a lo seguro: buscar de menos solo alarga una lista que ya acortan
      // los apellidos y la fecha; buscar de más la deja vacía.
      nombres: nombres.split(' ')[0],
      primerApellido: apellidos.primero,
      // Con tres apellidos o más no se sabe cuál es el segundo, y uno mal
      // puesto vacía la búsqueda. Mejor una lista más larga que ninguna.
      segundoApellido: apellidos.dudoso ? '' : apellidos.segundo,
      // El campo del diálogo es de tipo fecha: algo que no sea `yyyy-MM-dd` se
      // vería en blanco y aun así viajaría como filtro invisible.
      fechaNacimiento: fechaIso,
    },
  };
}

/** De una fila del buscador, lo que hace falta para reconocer de quién es. */
export interface FilaIdentificable {
  IdEstudiante?: number;
  CodigoRNE?: string | null;
  /** Como la manda el portal: `dd/MM/yyyy`. */
  FechaNacimiento?: string | null;
}

/**
 * ¿Ese resultado es de OTRO alumno del colegio?
 *
 * `existeId` es el alumno nuestro que ya tiene ese id de SIGERD. Si es el mismo
 * que se está editando no hay nada que proteger —volver a traer su propia ficha
 * es justo lo que se quiere—; si es otro, elegirlo dejaría dos fichas apuntando
 * al mismo niño del padrón. En el alta no hay `estudianteId` y cualquiera que
 * exista es otro.
 */
export function esDeOtroAlumno(
  existeId: number | null | undefined,
  estudianteId?: number | null,
): boolean {
  return !!existeId && existeId !== estudianteId;
}

/** El RNE sin lo que cambia de una mano a otra: espacios, guiones, mayúsculas. */
function claveRne(rne: string | null | undefined): string {
  return (rne ?? '').replace(/[\s-]/g, '').toUpperCase();
}

/**
 * ¿El resultado de la búsqueda automática se puede elegir sin preguntar?
 *
 * Solo cuando no cabe duda de quién es: se buscó por un identificador, volvió
 * exactamente UNA fila y esa fila trae el mismo identificador que se pidió.
 *
 * Al RNE se le pide además la misma fecha de nacimiento que la ficha. El id de
 * SIGERD lo guardó el sistema al importar o al elegir; el RNE lo copia una
 * persona de un papel, y uno con un dígito cambiado que resulte ser de otro
 * niño cargaría sus datos y le ataría a sus padres sin un solo clic. Sin fecha
 * en la ficha, o con otra en el portal, se enseña la fila y confirma alguien.
 *
 * Por nombre NUNCA, aunque salga uno solo: el buscador es nacional, un homónimo
 * de otra escuela es posible, y elegir no es inocuo —ata los tutores del portal
 * al alumno en el mismo momento—. Ahí confirma una persona con un clic.
 *
 * Tampoco se elige lo que la pantalla no dejaría pulsar: una fila que ya es de
 * otro alumno del colegio, o una de la que no se pudo comprobar (`yaEstan` en
 * `null`). Ante la duda se enseña la lista, que es lo que había antes.
 */
export function seEligeSolo({ busqueda, filas, yaEstan, estudianteId }: {
  busqueda: BusquedaDeFicha;
  filas: readonly FilaIdentificable[];
  /** Id de SIGERD → alumno nuestro que ya lo tiene. `null` = no se pudo preguntar. */
  yaEstan: ReadonlyMap<number, number> | null;
  /** El alumno que se está editando. */
  estudianteId?: number | null;
}): boolean {
  if (busqueda.por === 'nombre') return false;
  if (filas.length !== 1) return false;

  const fila = filas[0];
  // El portal manda el id como número. Sin él no se elige, se haya buscado por
  // lo que se haya buscado: la ficha y los tutores se piden con ese id, así que
  // elegir cerraría el diálogo sin haber traído nada; y quien elige lo
  // guardaría vacío y la ficha perdería su enlace.
  const id = typeof fila.IdEstudiante === 'number' ? fila.IdEstudiante : null;
  if (id == null) return false;

  const coincide = busqueda.por === 'id'
    ? String(id) === busqueda.criterios.idEstudiante
    : claveRne(fila.CodigoRNE) !== '' && claveRne(fila.CodigoRNE) === claveRne(busqueda.criterios.rne)
      && !!busqueda.nacio && aFechaISO(fila.FechaNacimiento) === busqueda.nacio;
  if (!coincide) return false;

  if (yaEstan == null) return false;
  return !esDeOtroAlumno(yaEstan.get(id), estudianteId);
}

/** Lo que el buscador dice desde siempre cuando no sale nadie. Es el del alta. */
export const NADIE_CON_ESOS_DATOS = 'Ningún alumno con esos datos. Prueba con menos letras o solo el apellido.';

/**
 * Qué decir cuando el portal no devuelve a nadie, según con qué se buscó.
 *
 * El aviso de siempre —«prueba con menos letras»— está escrito para quien
 * tecleó un nombre. Al buscar al alumno de una ficha el criterio lo pone el
 * sistema y suele ser un identificador: quien sigue ese consejo escribe el
 * apellido con el RNE malo todavía puesto, el portal junta los dos con «y»,
 * vuelve a no salir nadie y se da por hecho que el alumno no está en SIGERD.
 * El consejo tiene que señalar lo que de verdad estorba.
 */
export function avisoSinResultados(buscado: CriteriosSigerd): string {
  const identificadores = [
    buscado.rne.trim() ? 'RNE' : '',
    buscado.nui.trim() ? 'NUI' : '',
    buscado.idEstudiante.trim() ? 'id de SIGERD' : '',
  ].filter(Boolean);

  if (identificadores.length > 0) {
    const cuales = identificadores.map((i) => `ese ${i}`).join(' y ');
    const quitar = identificadores.length > 1
      ? 'Alguno puede estar mal: bórralos'
      : 'Puede estar mal: bórralo';
    return `Ningún alumno con ${cuales}. ${quitar} y busca por nombre y apellido.`;
  }

  // Sin identificador, lo que más estorba es una fecha equivocada en la ficha:
  // es exacta, y un día de diferencia deja fuera al alumno.
  if (buscado.fechaNacimiento.trim()) {
    return 'Ningún alumno con esos datos. Prueba sin la fecha de nacimiento, con menos letras o solo el apellido.';
  }

  return NADIE_CON_ESOS_DATOS;
}
