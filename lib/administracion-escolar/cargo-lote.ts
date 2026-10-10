/**
 * Las reglas de «Cargo a varios alumnos» que no necesitan pantalla: qué se
 * manda, qué frase se enseña y qué se le dice a la persona cuando algo falla.
 *
 * Están aquí, sin React ni red, por dos motivos:
 *
 *  - La frase «Les vas a cobrar RD$150.00 de «Día de cine» a 5 alumnos de Sala
 *    de tareas» es lo único que separa a la secretaria de crearle una deuda a
 *    quien no era. Tiene que poder probarse palabra por palabra, y salir de los
 *    MISMOS datos que viajan al servidor (`PedidoRevisado`), no del formulario.
 *  - Esta pantalla no se puede ejecutar en las pruebas (el proyecto no tiene
 *    navegador de pruebas): lo que no sea pintar vive aquí para que lo cubra
 *    `tests/unit/cargo-lote.test.ts`.
 */

import { fmtDOP, fmtFechaCorta, parseDOPaCentavos } from '@/lib/utils/format';

/* ------------------------------------------------------------------ */
/*  Lo que viaja                                                       */
/* ------------------------------------------------------------------ */

/**
 * A quién se le cobra. `null` es «todavía no lo ha dicho»: nadie viene elegido
 * de entrada, porque el valor de entrada de antes era el colegio entero y
 * bastaba no tocar nada para revisar a 146 alumnos creyendo que eran 12.
 */
export type Quien = null | 'grupo' | 'a-mano';

/** De dónde salió el monto cuando no lo tecleó la persona. */
export type OrigenMonto = null | 'ultima-vez' | 'catalogo';

/** Un cobro del colegio (en la base, un «concepto de pago»). */
export interface CobroDelColegio {
  id: number;
  nombre: string;
  tipo: string;
  activo?: boolean;
  productId?: number | null;
}

/** Una línea de la revisión: a quién se le crearía el cargo y a quién no. */
export interface DetalleRevisado {
  estudianteId: number;
  matriculaId: number;
  nombre: string;
  codigo: string | null;
  resultado: 'crear' | 'creado' | 'duplicado';
}

/**
 * El cuerpo de `POST /cargos/generar`, sin `dryRun` ni la lista de alumnos:
 * esos dos los pone quien llama, uno al revisar y los dos al crear.
 */
export interface CuerpoGenerar {
  periodoId: number;
  /** Las secciones del grupo. Ausente = todo el colegio. Nunca vacía. */
  cursoIds?: number[];
  conceptoId: number;
  mes: number | null;
  anio: number;
  montoCentavos: number;
  fechaVencimiento: string | null;
}

/**
 * Lo que se le preguntó al servidor en la revisión, entero.
 *
 * La revisión lo guarda y de él salen la frase de la barra, la del diálogo y
 * el cuerpo de «crear». Si la frase leyera del formulario y el envío también,
 * serían dos lecturas de algo que se puede mover entre medias; así es una sola
 * cosa y no hay forma de que digan distinto.
 */
export interface PedidoRevisado {
  cuerpo: CuerpoGenerar;
  /** Nombre del cobro, como se va a leer en la cuenta del alumno. */
  cobro: string;
  /** «octubre de 2026» si es una mensualidad; si no, `null`. */
  mesTexto: string | null;
  /** «Solo algunos alumnos»: la lista llega sin nadie marcado. */
  aMano: boolean;
  /** Ver `claveDeQuienes`. */
  clave: string;
  anioEscolar: string;
  anioEnCurso: boolean;
}

/* ------------------------------------------------------------------ */
/*  Texto                                                              */
/* ------------------------------------------------------------------ */

/** Minúsculas y sin tildes: quien teclea con prisa no pone tildes. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** «1 alumno» / «5 alumnos». */
export function alumnosEnLetras(n: number): string {
  return n === 1 ? '1 alumno' : `${n} alumnos`;
}

/**
 * Nombres en una frase: «Ana», «Ana y Luis», «Ana, Luis y Eva», y a partir del
 * cuarto «Ana, Luis, Eva y 4 más». Una lista de veinte nombres en la barra de
 * cobrar ya no se lee; tres bastan para reconocer a quién se quitó.
 */
export function listarNombres(nombres: string[], tope = 3): string {
  if (nombres.length === 0) return '';
  if (nombres.length === 1) return nombres[0];
  if (nombres.length > tope) {
    return `${nombres.slice(0, tope).join(', ')} y ${nombres.length - tope} más`;
  }
  const ultimo = nombres[nombres.length - 1];
  // «Ana e Inés», no «Ana y Inés»: esto lo leen maestros.
  const y = /^h?i(?![aeo])/i.test(normalizar(ultimo)) ? 'e' : 'y';
  return `${nombres.slice(0, -1).join(', ')} ${y} ${ultimo}`;
}

/* ------------------------------------------------------------------ */
/*  Fechas                                                             */
/* ------------------------------------------------------------------ */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function dosCifras(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Las tres partes de un 'YYYY-MM-DD', o `null` si no es un día del calendario.
 *
 * Todo va por `Date.UTC` y tablas propias, sin `Intl` ni la zona de la máquina:
 * una fecha de vencimiento es un día del calendario, no un instante, y con la
 * zona de por medio el 16 se convertía en 15 según dónde corriera.
 */
function partesDeFecha(iso: string | null | undefined): { anio: number; mes: number; dia: number } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [anio, mes, dia] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return { anio, mes, dia };
}

/**
 * ¿Es una fecha que se puede poner de límite? Un día que existe y de este
 * siglo: el campo de fecha deja teclear el año cifra a cifra y «0026» es una
 * fecha real para el navegador.
 */
export function esFechaValida(iso: string): boolean {
  const p = partesDeFecha(iso);
  return p !== null && p.anio >= 2000 && p.anio <= 2100;
}

/** La fecha `dias` días después. Cruza fin de mes y de año. */
export function sumarDias(iso: string, dias: number): string {
  const p = partesDeFecha(iso);
  if (!p) return iso;
  const d = new Date(Date.UTC(p.anio, p.mes - 1, p.dia + dias));
  return `${d.getUTCFullYear()}-${dosCifras(d.getUTCMonth() + 1)}-${dosCifras(d.getUTCDate())}`;
}

/**
 * «viernes 16 de octubre de 2026». Con el día de la semana, que es como se
 * dice una fecha en una oficina («hasta el viernes») y lo que delata un error
 * de un vistazo: «16/10/2026» y «16/11/2026» se parecen; «viernes» y «lunes» no.
 */
export function fechaEnLetras(iso: string): string {
  const p = partesDeFecha(iso);
  if (!p) return '';
  const dia = DIAS[new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay()];
  return `${dia} ${p.dia} de ${MESES[p.mes]} de ${p.anio}`;
}

/** «octubre de 2026», para la frase de una mensualidad. */
export function mesEnLetras(mes: number, anio: number): string {
  return `${MESES[mes] ?? ''} de ${anio}`;
}

export type MomentoDeLaFecha = 'sin-fecha' | 'pasada' | 'hoy' | 'futura';

/**
 * Dónde cae la fecha límite respecto a hoy. `hoy` llega de fuera (`hoyRD()`):
 * así se prueba sin tocar el reloj y «hoy» es el de República Dominicana, no
 * el de UTC, que a las ocho de la noche ya es mañana.
 */
export function momentoDeLaFecha(iso: string | null | undefined, hoy: string): MomentoDeLaFecha {
  if (!iso) return 'sin-fecha';
  if (iso < hoy) return 'pasada';
  return iso === hoy ? 'hoy' : 'futura';
}

/**
 * Lo que se lee debajo del campo de fecha mientras se elige. `aviso` lo pinta
 * en ámbar: hoy y una fecha pasada no se bloquean —se cobra con retraso a
 * propósito a veces— pero no pueden pasar sin que se note.
 */
export function ecoDeLaFecha(iso: string, hoy: string): { texto: string; aviso: boolean } {
  switch (momentoDeLaFecha(iso, hoy)) {
    case 'sin-fecha':
      return { texto: 'Sin fecha límite: a nadie le sale como atrasado.', aviso: false };
    case 'hoy':
      return { texto: 'Es hoy. Desde mañana, al que no haya pagado le sale como atrasado.', aviso: true };
    case 'pasada':
      return { texto: 'Esa fecha ya pasó: les va a salir como atrasado desde hoy.', aviso: true };
    default: {
      const letras = fechaEnLetras(iso);
      return {
        // Con mayúscula: es el principio de la línea.
        texto: `${letras.charAt(0).toUpperCase()}${letras.slice(1)}. Pasado ese día, al que no haya pagado le sale como atrasado.`,
        aviso: false,
      };
    }
  }
}

/** Hasta cuándo pueden pagar, en la frase de cobrar y en el resultado. */
export function fraseDelPlazo(fecha: string | null | undefined, hoy: string, cuantos: number): string {
  const uno = cuantos === 1;
  switch (momentoDeLaFecha(fecha, hoy)) {
    case 'sin-fecha':
      return 'Sin fecha límite para pagar.';
    case 'hoy':
      return `${uno ? 'Tiene' : 'Tienen'} hasta hoy para pagar: desde mañana ${uno ? 'le' : 'les'} sale como atrasado.`;
    case 'pasada':
      return `La fecha límite (${fmtFechaCorta(fecha)}) ya pasó: ${uno ? 'le' : 'les'} sale como atrasado desde hoy.`;
    default:
      return `${uno ? 'Tiene' : 'Tienen'} hasta el ${fechaEnLetras(fecha as string)} para pagar.`;
  }
}

/* ------------------------------------------------------------------ */
/*  Monto                                                              */
/* ------------------------------------------------------------------ */

/** RD$1,000,000 por alumno: más que eso no es un cobro de colegio, es un dedo de más. */
export const MONTO_MAXIMO_CENTAVOS = 100_000_000;
/** De RD$10,000 en adelante se avisa: suele sobrar un cero. */
const MONTO_ALTO_CENTAVOS = 1_000_000;
/** Por debajo de RD$10 se avisa: suelen faltar ceros. */
const MONTO_BAJO_CENTAVOS = 1_000;

export type ProblemaDeMonto = null | 'vacio' | 'no-se-entiende' | 'demasiado';

/**
 * Lo tecleado, en centavos, y qué tiene de malo si no sirve.
 *
 * Va por `parseDOPaCentavos` porque aquí la coma es separador de MILES, que es
 * como este sistema escribe el dinero («RD$2,800.00»): leída como decimal,
 * «1,100» creaba el cargo por RD$1.10. Se perdona el «RD$» delante, que es lo
 * que sale al copiar un monto de otra pantalla.
 */
export function leerMonto(texto: string): { centavos: number; problema: ProblemaDeMonto } {
  const limpio = texto.trim().replace(/^(rd)?\$\s*/i, '');
  if (!limpio) return { centavos: 0, problema: 'vacio' };
  const centavos = parseDOPaCentavos(limpio);
  if (centavos === null) return { centavos: 0, problema: 'no-se-entiende' };
  // Cero no se entiende mal: es que todavía no ha dicho cuánto.
  if (centavos === 0) return { centavos: 0, problema: 'vacio' };
  if (centavos > MONTO_MAXIMO_CENTAVOS) return { centavos, problema: 'demasiado' };
  return { centavos, problema: null };
}

/** ¿El monto es raro para un cobro de colegio? No bloquea: solo se dice. */
export function avisoDeMonto(centavos: number): null | 'alto' | 'bajo' {
  if (centavos >= MONTO_ALTO_CENTAVOS) return 'alto';
  if (centavos > 0 && centavos < MONTO_BAJO_CENTAVOS) return 'bajo';
  return null;
}

/** La pista del campo del monto cuando todavía no hay un número que repetir. */
export const PISTA_DEL_MONTO = 'Solo el número, por ejemplo 150.';

/**
 * Lo que se lee debajo del campo del monto mientras se escribe: el número de
 * vuelta, ya con su «RD$» y sus comas. Es la forma de ver que «1,100» se leyó
 * mil cien y no uno con diez, ANTES de continuar.
 *
 * Mientras lo escrito no se entiende no se regaña: el error sale al pulsar
 * «Continuar», no a media tecla.
 */
export function ecoDelMonto(texto: string): { texto: string; aviso: boolean } {
  const { centavos, problema } = leerMonto(texto);
  if (problema !== null) return { texto: PISTA_DEL_MONTO, aviso: false };
  const raro = avisoDeMonto(centavos);
  if (raro === 'alto') {
    return { texto: `Son ${fmtDOP(centavos)} por alumno. Si te sobra un cero, corrígelo.`, aviso: true };
  }
  if (raro === 'bajo') {
    return { texto: `Son ${fmtDOP(centavos)} por alumno. Mira si te faltan ceros.`, aviso: true };
  }
  return { texto: `${fmtDOP(centavos)} por alumno`, aviso: false };
}

/* ------------------------------------------------------------------ */
/*  Cobros                                                             */
/* ------------------------------------------------------------------ */

/**
 * Mensualidad e inscripción: los cobros que tienen precio por curso y becas.
 *
 * Desde esta pantalla todos pagan lo mismo, así que van escondidos tras un
 * enlace y con aviso: quien los cobre por aquí se salta las tarifas sin saberlo.
 */
export function esCobroFijo(tipo: string): boolean {
  return tipo === 'mensualidad' || tipo === 'inscripcion';
}

/**
 * El cobro ACTIVO que ya se llama así, sin mirar tildes ni mayúsculas.
 *
 * Sirve para no crear un gemelo: escribir «dia de cine» teniendo ya «Día de
 * Cine» dejaba dos cobros iguales en el catálogo, y el segundo no veía a
 * quién se le había cobrado el primero. Un cobro inactivo no cuenta: el
 * colegio lo retiró, y no se le puede elegir.
 */
export function cobroConEseNombre<T extends CobroDelColegio>(cobros: T[], nombre: string): T | null {
  const buscado = normalizar(nombre.trim());
  if (!buscado) return null;
  return cobros.find((c) => c.activo !== false && normalizar(c.nombre.trim()) === buscado) ?? null;
}

/**
 * Qué cobros se enseñan en «¿Qué vas a cobrar?» y si lo buscado no dio nada.
 *
 * El ELEGIDO SALE SIEMPRE, case o no con lo buscado y quepa o no entre los
 * primeros. Con algo escrito en el buscador el elegido desaparecía de la lista
 * pero seguía elegido: se veía «Día de cine» sin marcar, se pulsaba «Continuar»
 * y lo que se cobraba era la «Excursión» que ya no estaba a la vista.
 */
export function cobrosALaVista<T extends { id: number; nombre: string }>(
  sueltos: T[], d: { buscado: string; verTodos: boolean; cobroId: string; tope: number },
): { visibles: T[]; sinCoincidencias: boolean } {
  const elegido = sueltos.find((c) => String(c.id) === d.cobroId);
  const conElegido = (lista: T[]) => (elegido && !lista.includes(elegido) ? [...lista, elegido] : lista);
  const buscado = normalizar(d.buscado.trim());
  if (buscado) {
    const casan = sueltos.filter((c) => normalizar(c.nombre).includes(buscado));
    return { visibles: conElegido(casan), sinCoincidencias: casan.length === 0 };
  }
  if (d.verTodos || sueltos.length <= d.tope) return { visibles: sueltos, sinCoincidencias: false };
  return { visibles: conElegido(sueltos.slice(0, d.tope)), sinCoincidencias: false };
}

/* ------------------------------------------------------------------ */
/*  La lista de alumnos y sus marcas                                   */
/* ------------------------------------------------------------------ */

/**
 * Qué pregunta es esta, sin el monto ni la fecha: año escolar, secciones,
 * cobro, mes y si se marca a mano.
 *
 * Es lo que decide QUIÉN sale en la lista y quién «ya lo tiene». Dos revisiones
 * con la misma clave enseñan la misma lista, y por eso las marcas de una
 * valen para la otra (ver `marcasTrasRevisar`). El monto y la fecha se quedan
 * fuera a propósito: corregir «150» por «200» no cambia a quién se le cobra.
 */
export function claveDeQuienes(cuerpo: CuerpoGenerar, aMano: boolean): string {
  const secciones = cuerpo.cursoIds ? [...cuerpo.cursoIds].sort((a, b) => a - b).join(',') : 'colegio';
  return [cuerpo.periodoId, secciones, cuerpo.conceptoId, cuerpo.mes ?? '', aMano ? 'a-mano' : 'grupo'].join('|');
}

/** Las marcas que dejó la persona, con la pregunta a la que pertenecen. */
export interface MemoriaDeMarcas { clave: string; ids: number[] }

/**
 * Quién viene marcado al llegar una revisión.
 *
 * - En un grupo, todos los que pueden recibirlo: lo normal es cobrarle a la
 *   sala entera y quitar a dos.
 * - En «solo algunos», nadie: lo normal es añadir a los ocho que van.
 * - Si la persona ya había marcado sobre ESTA misma pregunta (volvió al paso 1
 *   a corregir el monto), se conservan sus marcas. Perderlas era volver a
 *   quitar a mano a los mismos dos, o no acordarse y cobrarles.
 *
 * Quien «ya lo tiene» no queda marcado nunca, estuviera o no en la memoria:
 * entre una revisión y otra se le pudo crear el cargo desde otra pantalla.
 */
export function marcasTrasRevisar(
  detalles: DetalleRevisado[], aMano: boolean, memoria: MemoriaDeMarcas | null, clave: string,
): { ids: number[]; recordadas: boolean } {
  const pueden = detalles.filter((d) => d.resultado !== 'duplicado').map((d) => d.estudianteId);
  if (memoria && memoria.clave === clave) {
    const guardadas = new Set(memoria.ids);
    return { ids: pueden.filter((id) => guardadas.has(id)), recordadas: true };
  }
  return { ids: aMano ? [] : pueden, recordadas: false };
}

/**
 * Los alumnos que tienen un cargo SIN ANULAR, de una lista de cargos de un
 * cobro en un año escolar (lo que devuelve `GET /cargos?conceptoId=&periodoId=`).
 */
export function alumnosConCargoVivo(cargos: { estudianteId: number; estado: string }[]): number[] {
  return [...new Set(cargos.filter((c) => c.estado !== 'anulado').map((c) => c.estudianteId))];
}

/**
 * La revisión del servidor, con «ya lo tiene» puesto también a quien tiene ese
 * cobro guardado CON MES.
 *
 * Para un cobro suelto la pantalla manda `mes: null`, y con mes nulo el
 * servidor solo mira los cargos que tampoco tienen mes. Pero hay excursiones
 * guardadas con mes: la versión anterior de esta pantalla dejaba puesto el mes
 * en curso por debajo al traer un producto del catálogo, y el cargo individual
 * hace lo mismo al cambiar de año escolar. A esos alumnos la revisión los
 * devolvía como «se le puede cobrar» y salían marcados, mientras la pantalla
 * decía «a nadie se le cobra dos veces lo mismo».
 *
 * `yaLoTienen` son los alumnos con un cargo sin anular de ese cobro en ese año
 * escolar, tenga mes o no. Aquí solo se AÑADEN bloqueos: a quien el servidor
 * ya dio por duplicado no se le quita.
 */
export function marcarLosQueYaLoTienen<T extends { total: number; detalles: DetalleRevisado[] }>(
  revision: T, yaLoTienen: ReadonlySet<number>,
): T & { creados: number; omitidos: number } {
  const detalles = revision.detalles.map((d) => (
    d.resultado !== 'duplicado' && yaLoTienen.has(d.estudianteId)
      ? { ...d, resultado: 'duplicado' as const }
      : d
  ));
  const creados = detalles.filter((d) => d.resultado !== 'duplicado').length;
  return { ...revision, detalles, creados, omitidos: detalles.length - creados };
}

/** Los nombres de los que quedan marcados, en el orden de la lista. */
export function nombresMarcados(detalles: DetalleRevisado[], seleccion: ReadonlySet<number>): string[] {
  return detalles
    .filter((d) => d.resultado !== 'duplicado' && seleccion.has(d.estudianteId))
    .map((d) => d.nombre);
}

/* ------------------------------------------------------------------ */
/*  Cuando crear se quedó sin respuesta                                */
/* ------------------------------------------------------------------ */

/**
 * Lo que se intentó crear cuando la respuesta no llegó: a quiénes, con qué
 * pedido y de qué grupo. Se guarda para poder contestar «¿se crearon o no?» en
 * cuanto se vuelva a mirar la lista.
 */
export interface IntentoSinRespuesta {
  pedido: PedidoRevisado;
  grupo: string | null;
  marcados: { estudianteId: number; nombre: string }[];
}

export interface Comprobacion {
  /**
   * - `se-crearon`: todos los que se mandaron y siguen en la lista tienen ya el
   *   cargo. El alta es una sola escritura —o entran todos o ninguno—, así que
   *   es la respuesta que se perdió.
   * - `no-se-crearon`: ninguno lo tiene.
   * - `parte`: unos sí y otros no; a los que sí se lo puso otra persona entre
   *   medias. Se dice cuántos, sin adivinar quién fue.
   * - `sin-datos`: ninguno de los que se mandaron sale ya en la lista.
   */
  veredicto: 'se-crearon' | 'no-se-crearon' | 'parte' | 'sin-datos';
  /** Los que se mandaron y ahora tienen el cargo. */
  conCargo: DetalleRevisado[];
  /** Los que se mandaron y siguen sin él. */
  sinCargo: DetalleRevisado[];
  /** Los que se mandaron y ya no salen en la lista: de esos no se puede saber. */
  desaparecidos: number[];
}

/**
 * ¿Se llegaron a crear los cargos de un intento que se quedó sin respuesta?
 *
 * Se contesta comparando a quiénes se mandó con la lista recién revisada: quien
 * ahora sale como «ya lo tiene» lo recibió. Es la pregunta que la persona se
 * hace en ese momento y la pantalla no contestaba: salía el aviso de «todos ya
 * lo tienen» con un botón de «Crear un cobro nuevo», que es justo cómo se
 * cobra dos veces.
 */
export function comprobarIntento(enviados: number[], detalles: DetalleRevisado[]): Comprobacion {
  const porId = new Map(detalles.map((d) => [d.estudianteId, d]));
  const conCargo: DetalleRevisado[] = [];
  const sinCargo: DetalleRevisado[] = [];
  const desaparecidos: number[] = [];
  for (const id of new Set(enviados)) {
    const d = porId.get(id);
    if (!d) desaparecidos.push(id);
    else if (d.resultado === 'duplicado') conCargo.push(d);
    else sinCargo.push(d);
  }
  const veredicto = conCargo.length > 0
    ? (sinCargo.length > 0 ? 'parte' : 'se-crearon')
    : (sinCargo.length > 0 ? 'no-se-crearon' : 'sin-datos');
  return { veredicto, conCargo, sinCargo, desaparecidos };
}

/**
 * Lo que se dice encima de la lista cuando se comprobó y NO estaba todo
 * creado. `null` si no hay nada que decir aquí: con todo creado no se enseña
 * la lista, se enseña el resultado.
 */
export function avisoDeComprobacion(c: Comprobacion): string | null {
  if (c.veredicto === 'no-se-crearon') {
    return 'Comprobado: no se había creado ningún cargo. Tus marcas siguen como las dejaste; ya puedes cobrar.';
  }
  if (c.veredicto === 'parte') {
    const si = c.conCargo.length;
    const no = c.sinCargo.length;
    return `Comprobado: ${si === 1 ? '1 ya tiene' : `${si} ya tienen`} el cargo y ${
      no === 1 ? 'a 1 todavía no se le creó. Sigue marcado' : `a ${no} todavía no se les creó. Siguen marcados`
    }: revisa la lista y cobra.`;
  }
  return null;
}

/** De quién no se pudo comprobar nada: ya no sale en el grupo. */
export function fraseDeSinComprobar(nombres: string[]): string {
  return nombres.length === 1
    ? `De ${nombres[0]} no se pudo comprobar: ya no sale en ese grupo. Mira su cuenta en su ficha.`
    : `De ${listarNombres(nombres)} no se pudo comprobar: ya no salen en ese grupo. Mira su cuenta en la ficha de cada uno.`;
}

/**
 * Primero los que se pueden marcar y al final los que ya lo tienen, cada
 * bloque en el orden en que llegó (por nombre). Mezclados, las casillas
 * bloqueadas rompían el repaso de la lista cada tres líneas.
 */
export function ordenarParaRevisar<T extends { resultado: DetalleRevisado['resultado'] }>(detalles: T[]): T[] {
  return [
    ...detalles.filter((d) => d.resultado !== 'duplicado'),
    ...detalles.filter((d) => d.resultado === 'duplicado'),
  ];
}

/**
 * Los alumnos que casan con lo buscado, por nombre, código o curso.
 *
 * Por curso porque con todo el colegio la lista son 150 nombres por orden
 * alfabético: «primero a» es la manera de quedarse con una sección. Se busca
 * el texto seguido y no palabra a palabra; si no, la «a» de «primero a»
 * casaría con cualquier «Primaria».
 */
export function filtrarAlumnos<T extends { estudianteId: number; nombre: string; codigo: string | null }>(
  detalles: T[], cursoPorAlumno: Map<number, string>, query: string,
): T[] {
  const q = normalizar(query.trim()).replace(/\s+/g, ' ');
  if (!q) return detalles;
  return detalles.filter((d) => normalizar(
    `${d.nombre} ${d.codigo ?? ''} ${cursoPorAlumno.get(d.estudianteId) ?? ''}`,
  ).replace(/\s+/g, ' ').includes(q));
}

/* ------------------------------------------------------------------ */
/*  Las frases                                                         */
/* ------------------------------------------------------------------ */

export interface DatosDeLaFrase {
  montoCentavos: number;
  cobro: string;
  mesTexto: string | null;
  aMano: boolean;
  /** El grupo que se revisó. `null` es todo el colegio. */
  grupo: string | null;
  /** Cuántos quedan marcados: a esos se les crea el cargo. */
  marcados: number;
  /** Cuántos salieron en la lista, contando a los que ya lo tienen. */
  enLaLista: number;
  fechaVencimiento: string | null;
  hoy: string;
}

export interface FraseDelCobro {
  /** La frase entera. `null` sin nadie marcado: no hay nada que decir ni que cobrar. */
  principal: string | null;
  /** «Total: RD$750.00». */
  total: string;
  totalCentavos: number;
  plazo: string;
}

/** «RD$150.00 de «Día de cine»» y, si es mensualidad, « de octubre de 2026». */
function loQueSeCobra(montoCentavos: number, cobro: string, mesTexto: string | null): string {
  return `${fmtDOP(montoCentavos)} de «${cobro}»${mesTexto ? ` de ${mesTexto}` : ''}`;
}

/**
 * Lo que va a pasar al confirmar, dicho como se lo diría una persona a otra.
 *
 * «Le» con uno y «Les» con varios. «A 3 de los 5» en cuanto hay alguien de la
 * lista que no lo recibe —se le quitó la marca o ya lo tenía—: el «de los 5»
 * es lo que avisa de que no es el grupo entero. Con todo el colegio, «a los
 * 148 alumnos de todo el colegio»: que suene a lo grande que es.
 */
export function fraseDelCobro(d: DatosDeLaFrase): FraseDelCobro {
  const n = d.marcados;
  const totalCentavos = n * d.montoCentavos;
  const plazo = fraseDelPlazo(d.fechaVencimiento, d.hoy, n);
  const total = `Total: ${fmtDOP(totalCentavos)}`;
  if (n <= 0) return { principal: null, total, totalCentavos, plazo };

  let aQuien: string;
  if (d.aMano) {
    aQuien = n === 1 ? 'a 1 alumno que marcaste tú' : `a ${n} alumnos que marcaste tú, uno por uno`;
  } else {
    const donde = d.grupo ? `de ${d.grupo}` : 'de todo el colegio';
    if (n < d.enLaLista) aQuien = `a ${n} de los ${d.enLaLista} alumnos ${donde}`;
    else if (d.grupo || n === 1) aQuien = `a ${alumnosEnLetras(n)} ${donde}`;
    else aQuien = `a los ${n} alumnos ${donde}`;
  }

  return {
    principal: `${n === 1 ? 'Le' : 'Les'} vas a cobrar ${loQueSeCobra(d.montoCentavos, d.cobro, d.mesTexto)} ${aQuien}.`,
    total,
    totalCentavos,
    plazo,
  };
}

/** «No se le cobra a: Ana y Luis.» — a quién se le quitó la marca. */
export function fraseDeQuitados(nombres: string[]): string {
  return `No se le cobra a: ${listarNombres(nombres)}.`;
}

/**
 * «Marcaste a: Ana, Luis y Eva.» — a quiénes se les va a cobrar cuando se
 * marcan uno por uno.
 *
 * Ahí la frase de cobrar solo dice cuántos («a 8 alumnos que marcaste tú»), y
 * ocho es el número que se esperaba aunque uno de los ocho sea el «José Pérez»
 * de la fila de al lado. Con los nombres delante se ve antes de confirmar.
 */
export function fraseDeMarcados(nombres: string[], tope = 5): string {
  return `Marcaste a: ${listarNombres(nombres, tope)}.`;
}

/** «2 ya lo tienen y no se les cobra otra vez.» */
export function fraseDeDuplicados(n: number): string {
  return n === 1
    ? '1 ya lo tiene y no se le cobra otra vez.'
    : `${n} ya lo tienen y no se les cobra otra vez.`;
}

/**
 * Lo que se hizo, con el número que devolvió el SERVIDOR y no el que se marcó:
 * entre la revisión y el clic alguien pudo crear el mismo cargo desde otra
 * pantalla, y el resultado tiene que decir lo que de verdad quedó creado.
 */
export function fraseDeLoCobrado(d: {
  montoCentavos: number; cobro: string; mesTexto: string | null;
  aMano: boolean; grupo: string | null; creados: number;
  fechaVencimiento: string | null; hoy: string;
}): { principal: string; total: string; plazo: string } {
  const n = d.creados;
  const donde = d.aMano ? 'que marcaste tú' : d.grupo ? `de ${d.grupo}` : 'de todo el colegio';
  return {
    principal: `${n === 1 ? 'Le' : 'Les'} cobraste ${loQueSeCobra(d.montoCentavos, d.cobro, d.mesTexto)} a ${alumnosEnLetras(n)} ${donde}.`,
    total: `Total: ${fmtDOP(n * d.montoCentavos)}`,
    plazo: fraseDelPlazo(d.fechaVencimiento, d.hoy, n),
  };
}

/** El titular de lo que se acaba de hacer. */
export function tituloDelResultado(creados: number): string {
  if (creados <= 0) return 'No se creó ningún cargo';
  return creados === 1 ? 'Listo: se creó 1 cargo' : `Listo: se crearon ${creados} cargos`;
}

/** «2 ya lo tenían y no se les cobró otra vez.» */
export function fraseDeOmitidos(n: number): string {
  return n === 1
    ? '1 ya lo tenía y no se le cobró otra vez.'
    : `${n} ya lo tenían y no se les cobró otra vez.`;
}

/**
 * A quién se marcó y el servidor ya no encontró en el grupo: se le cambió de
 * curso o se le retiró la matrícula entre la revisión y el clic. Con su
 * nombre, porque «se crearon 4» habiendo marcado 5 obliga a adivinar a quién.
 */
export function fraseDeNoEncontrados(nombres: string[]): string {
  return nombres.length === 1
    ? `No se le creó a ${nombres[0]}: ya no está matriculado en ese grupo.`
    : `No se les creó a ${listarNombres(nombres)}: ya no están matriculados en ese grupo.`;
}

/**
 * El titular de «a nadie de este grupo se le puede cobrar esto: ya lo tienen».
 * Con una mensualidad dice de qué mes: lo que ya tienen es la de ESE mes, no
 * la mensualidad para siempre.
 */
export function tituloTodosLoTienen(
  total: number, grupo: string | null, cobro: string, mesTexto: string | null = null,
): string {
  const donde = grupo ? `de «${grupo}»` : 'del colegio';
  const que = `«${cobro}»${mesTexto ? ` de ${mesTexto}` : ''}`;
  return total === 1
    ? `El único alumno ${donde} ya tiene ${que}`
    : `Los ${total} alumnos ${donde} ya tienen ${que}`;
}

/**
 * Qué hacer cuando todos lo tienen, y qué botón ofrecer.
 *
 * Una mensualidad se repite cada mes: lo que toca es elegir OTRO MES. Antes se
 * le decía lo mismo que a un cobro suelto —«cóbralo como un cobro nuevo, con
 * otro nombre»— y eso llenaba el catálogo de «Mensualidad 2» o dejaba creyendo
 * que noviembre no se podía cobrar.
 */
export function consejoTodosLoTienen(d: { mesTexto: string | null; puedeCrear: boolean }): {
  texto: string; accion: null | 'otro-mes' | 'cobro-nuevo';
} {
  if (d.mesTexto) {
    return {
      texto: 'Ya tienen la de ese mes. Vuelve al paso 1 y elige otro mes, o elige otro grupo.',
      accion: 'otro-mes',
    };
  }
  const mismaRegla = 'A nadie se le cobra dos veces lo mismo en el mismo año escolar, aunque ya lo haya pagado.';
  return d.puedeCrear
    ? {
      texto: `${mismaRegla} Si esto es otro día distinto, cóbralo como un cobro nuevo, con otro nombre. Si no, elige otro grupo.`,
      accion: 'cobro-nuevo',
    }
    : {
      texto: `${mismaRegla} Si esto es otro día distinto, pídele a un administrador de tu colegio que cree el cobro con otro nombre. Si no, elige otro grupo.`,
      accion: null,
    };
}

/** La línea del paso 1 cuando ya está contestado. */
export function resumenQueSeCobra(d: {
  montoCentavos: number; cobro: string; mesTexto: string | null; fechaVencimiento: string | null;
}): string {
  const plazo = d.fechaVencimiento ? `hasta el ${fmtFechaCorta(d.fechaVencimiento)}` : 'sin fecha límite';
  return `${loQueSeCobra(d.montoCentavos, d.cobro, d.mesTexto)} · ${plazo}`;
}

/** La línea del paso 2 cuando ya está contestado. */
export function resumenAQuien(d: { aMano: boolean; grupo: string | null; total: number | null }): string {
  if (d.aMano) return 'Solo algunos alumnos';
  const quien = d.grupo ?? 'Todo el colegio';
  return d.total == null ? quien : `${quien} · ${alumnosEnLetras(d.total)}`;
}

/**
 * Lo que hay que repetir en ámbar justo antes de confirmar, porque es lo que
 * más cuesta deshacer: el colegio entero, un año que no es el de ahora, un
 * monto con un cero de más.
 */
export function avisosDeConfirmar(d: {
  pedido: PedidoRevisado; grupo: string | null; marcados: number; enLaLista: number;
}): string[] {
  const avisos: string[] = [];
  if (!d.pedido.aMano && d.grupo === null && d.marcados === d.enLaLista) {
    avisos.push('Son todos los alumnos del colegio.');
  }
  if (!d.pedido.anioEnCurso) {
    avisos.push(`Es del año escolar «${d.pedido.anioEscolar}», que no es el que está en curso.`);
  }
  if (avisoDeMonto(d.pedido.cuerpo.montoCentavos) === 'alto') {
    avisos.push(`Son ${fmtDOP(d.pedido.cuerpo.montoCentavos)} por alumno.`);
  }
  return avisos;
}

/* ------------------------------------------------------------------ */
/*  Errores                                                            */
/* ------------------------------------------------------------------ */

/** Lo que se dice bajo cada campo del paso 1 cuando falta o está mal. */
export const ERRORES_PASO_1 = {
  cobro: 'Elige qué vas a cobrar.',
  nombre: 'Escribe cómo se llama lo que vas a cobrar.',
  crear: 'No se pudo guardar el cobro nuevo. Revisa tu conexión y pulsa «Continuar» otra vez.',
  crear403: 'No tienes permiso para crear cobros nuevos. Elige uno de la lista o pídeselo a un administrador de tu colegio.',
  renombrar: 'No se pudo guardar el nombre corregido. Revisa tu conexión y pulsa «Continuar» otra vez.',
  nombreRepetido: 'Ya tienes otro cobro con ese nombre. Ponle uno distinto.',
  mes: 'Elige de qué mes es la mensualidad.',
  fecha: 'Esa fecha no es válida. Elígela otra vez en el calendario.',
  monto: {
    vacio: 'Escribe cuánto paga cada alumno. Solo el número, por ejemplo 150.',
    'no-se-entiende': 'No entendí ese monto. Escribe solo el número, por ejemplo 150 o 1,100.50.',
    demasiado: 'Ese monto es demasiado grande. Revísalo.',
  },
} as const;

export const ERROR_SIN_ELEGIR_A_QUIEN = 'Elige a quién se le cobra.';

/**
 * No se pudo mirar quién tiene ya ese cobro (ver `marcarLosQueYaLoTienen`).
 * Sin eso no se enseña la lista: saldría marcado alguien que ya lo tiene.
 */
export const ERRORES_AL_COMPROBAR_EL_COBRO = {
  'sin-respuesta': 'No se pudo comprobar quién tiene ya este cobro. Revisa tu conexión y pulsa «Continuar» otra vez.',
  demasiados: 'Este cobro ya tiene tantos cargos este año escolar que desde aquí no se puede comprobar quién lo tiene. Cóbralo como un cobro nuevo, con otro nombre.',
} as const;

/** El error de cada campo del paso 1, para pintarlo debajo del suyo. */
export interface ErroresPaso1 {
  cobro?: string;
  nombre?: string;
  mes?: string;
  monto?: string;
  fecha?: string;
}

/**
 * Lo que se enseña cuando el servidor dice que no, en palabras de la oficina.
 *
 * El texto crudo del servidor NUNCA sale tal cual («montoCentavos debe ser un
 * entero positivo», «Período no encontrado»): está escrito para quien
 * programa. La única excepción es el 402, cuyo mensaje sí está escrito para
 * el cliente —dice qué pasa con su plan— y va detrás de «No se creó nada».
 *
 * `seSabeQueNoSeCreo` es lo que decide qué hace la pantalla al crear: un 4xx
 * garantiza que no se escribió nada y el error se queda junto al botón; sin
 * respuesta o con un 5xx no se sabe, y hay que volver a comprobar la lista
 * antes de dejar que se pulse otra vez — si no, se cobra dos veces.
 */
export function mensajeDeError(
  fase: 'revisar' | 'crear', status: number, crudo: unknown,
): { texto: string; seSabeQueNoSeCreo: boolean } {
  const dicho = typeof crudo === 'string' ? crudo.trim() : '';
  const pista = normalizar(dicho);
  const esDelCobro = status === 404 && pista.includes('concepto');
  const esDelAnio = status === 404 && pista.includes('periodo');
  const esDelMes = status === 400 && /\bmes\b/.test(pista);

  if (fase === 'revisar') {
    // Revisar solo lee: pase lo que pase, no se creó nada.
    const texto = status === 0
      ? 'No se pudo buscar a los alumnos. Revisa tu conexión y pulsa «Continuar» otra vez.'
      : status === 401 ? 'Tu sesión se cerró. Entra otra vez y repite el cobro.'
      : status === 403 ? 'No tienes permiso para crear cargos. Pídeselo a un administrador de tu colegio.'
      : esDelCobro ? 'Ese cobro ya no existe en tu colegio. Vuelve al paso 1 y elige otro.'
      : esDelAnio ? 'Ese año escolar ya no existe. Recarga la página.'
      : esDelMes ? 'Ese mes no es de este año escolar. Vuelve al paso 1 y elige otro mes.'
      : 'No se pudo buscar a los alumnos. Inténtalo otra vez.';
    return { texto, seSabeQueNoSeCreo: true };
  }

  if (status < 400 || status >= 500) {
    return {
      // Promete lo que la pantalla hace después: al volver a mirar la lista se
      // contesta si se crearon o no (ver `comprobarIntento`).
      texto: 'No llegó respuesta y no sabemos si los cargos se llegaron a crear. No cierres esta pantalla: pulsa «Continuar» y te decimos si se crearon o no. A nadie se le cobra dos veces.',
      seSabeQueNoSeCreo: false,
    };
  }
  const texto = status === 402 ? `No se creó nada. ${dicho || 'Tu colegio no tiene un plan activo.'}`
    : status === 403 ? 'No se creó nada: no tienes permiso para crear cargos. Pídeselo a un administrador de tu colegio.'
    : status === 401 ? 'No se creó nada: tu sesión se cerró. Entra otra vez y repite el cobro.'
    : esDelCobro ? 'No se creó nada: ese cobro ya no existe en tu colegio. Vuelve al paso 1 y elige otro.'
    : esDelMes ? 'No se creó nada: ese mes no es de este año escolar. Vuelve al paso 1 y elige otro mes.'
    : 'No se creó nada. Recarga la página y vuelve a intentarlo.';
  return { texto, seSabeQueNoSeCreo: true };
}
