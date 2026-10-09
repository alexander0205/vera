/**
 * Cuántas partes (y por lo tanto cuánto dinero) va a costar un texto.
 *
 * Un SMS no se mide en caracteres sino en la codificación que obliga su
 * contenido, y eso en español es el detalle caro:
 *
 *   - GSM-7 (alfabeto estándar):  160 caracteres si va solo, 153 por parte si
 *     se concatena (7 caracteres se van en la cabecera que une las partes).
 *   - UCS-2 (Unicode):             70 y 67 respectivamente.
 *
 * El alfabeto GSM-7 trae `é ñ ü à ì ò ù`, pero **no** trae `á í ó ú`. O sea que
 * un "está" o un "matrícula" en el texto tumba el mensaje entero a UCS-2 y le
 * corta la capacidad a menos de la mitad: el mismo aviso pasa de 1 parte a 3.
 * Por eso existe `aGsm7()` — para que quien redacta el aviso pueda decidir, a
 * ojos vistas, si prefiere el acento o el precio.
 *
 * Nada de esto trunca ni reescribe por su cuenta: solo informa. Truncar un
 * aviso de cobro en silencio es peor que mandarlo en tres partes.
 *
 * Funciones puras: sin DB, sin red, sin AWS.
 */

export type CodificacionSms = 'GSM-7' | 'UCS-2';

/** Alfabeto básico GSM 03.38: cada carácter ocupa 1 septeto. */
const GSM7_BASICO =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/** Tabla de extensión: existen en GSM-7 pero cuestan 2 septetos cada uno. */
const GSM7_EXTENDIDO = '\f^{}\\[~]|€';

const SET_BASICO = new Set(GSM7_BASICO);
const SET_EXTENDIDO = new Set(GSM7_EXTENDIDO);

export const LIMITE_GSM7_SIMPLE = 160;
export const LIMITE_GSM7_PARTE = 153;
export const LIMITE_UCS2_SIMPLE = 70;
export const LIMITE_UCS2_PARTE = 67;

/** ¿Todo el texto cabe en el alfabeto GSM-7? (`á` dice que no, `é` que sí.) */
export function esGsm7(texto: string): boolean {
  for (const c of texto) {
    if (!SET_BASICO.has(c) && !SET_EXTENDIDO.has(c)) return false;
  }
  return true;
}

export interface ConteoSms {
  codificacion: CodificacionSms;
  /** Septetos si es GSM-7, unidades UTF-16 si es UCS-2. No son "caracteres". */
  unidades: number;
  /** Partes facturables. Es lo que multiplica el costo. */
  partes: number;
  /** Capacidad por parte con esta codificación, ya contando la concatenación. */
  limitePorParte: number;
}

/**
 * Desglosa el costo de un texto: codificación, tamaño y partes facturables.
 *
 * El conteo de partes en GSM-7 puede quedar corto por una parte en el caso raro
 * de que un carácter de la tabla de extensión (`{`, `€`, `~`…) caiga justo en
 * el borde entre dos partes: los 2 septetos no se pueden partir y el operador
 * empuja el carácter completo a la parte siguiente. No lo modelamos porque esos
 * caracteres no aparecen en un aviso de cobro; si algún día aparecen, este es
 * el comentario que hay que leer.
 */
export function analizarSms(texto: string): ConteoSms {
  if (esGsm7(texto)) {
    let septetos = 0;
    for (const c of texto) septetos += SET_EXTENDIDO.has(c) ? 2 : 1;
    return {
      codificacion: 'GSM-7',
      unidades: septetos,
      partes: septetos <= LIMITE_GSM7_SIMPLE ? 1 : Math.ceil(septetos / LIMITE_GSM7_PARTE),
      limitePorParte: LIMITE_GSM7_PARTE,
    };
  }

  // UCS-2 se mide en unidades UTF-16, no en caracteres: un emoji fuera del BMP
  // ocupa 2. `texto.length` ya cuenta así, que es justo lo que necesitamos.
  const unidades = texto.length;
  return {
    codificacion: 'UCS-2',
    unidades,
    partes: unidades <= LIMITE_UCS2_SIMPLE ? 1 : Math.ceil(unidades / LIMITE_UCS2_PARTE),
    limitePorParte: LIMITE_UCS2_PARTE,
  };
}

/** En cuántas partes facturables va a salir el texto. Un SMS "de 160" es 1. */
export function contarPartes(texto: string): number {
  return analizarSms(texto).partes;
}

/**
 * Acentos y símbolos que el alfabeto GSM-7 no tiene, con su reemplazo. Solo
 * están los que aparecen en español (y las comillas/guiones tipográficos que
 * mete cualquier editor de texto sin avisar).
 */
const REEMPLAZOS_GSM7: Record<string, string> = {
  á: 'a', í: 'i', ó: 'o', ú: 'u',
  // `É` no está: sí existe en GSM-7, cambiarla sería quitarle un acento al texto
  // sin que eso ahorre un solo centavo.
  Á: 'A', Í: 'I', Ó: 'O', Ú: 'U',
  â: 'a', ê: 'e', î: 'i', ô: 'o', û: 'u',
  ã: 'a', õ: 'o', ç: 'c',
  '‘': "'", '’': "'", '“': '"', '”': '"',
  '–': '-', '—': '-', '…': '...', ' ': ' ',
};

/**
 * Convierte a GSM-7 lo que se pueda, quitando solo los acentos que el alfabeto
 * no soporta ("matrícula" → "matricula", pero "señor" y "José" quedan intactos
 * porque `ñ` y `é` sí existen en GSM-7).
 *
 * **Es opcional a propósito.** No se aplica sola dentro de `enviarSms`: cambiar
 * el texto de un aviso sin que el que lo escribió lo sepa es exactamente el tipo
 * de sorpresa que no queremos. El llamador decide, ve el resultado y lo vuelve a
 * medir con `analizarSms()`.
 */
export function aGsm7(texto: string): string {
  let salida = '';
  for (const c of texto) salida += REEMPLAZOS_GSM7[c] ?? c;
  return salida;
}
