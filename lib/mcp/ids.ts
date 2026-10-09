/**
 * Un id de tabla que viene de fuera (ruta o query), o null si no lo es.
 *
 * Hacen falta dos cosas que `parseInt`/`Number` no dan:
 *
 *  1. `parseInt` lee mientras entiende y devuelve lo que llevaba:
 *     `parseInt('1e+21')` es 1. Como `1e21` sí es un entero válido para zod,
 *     `get_client({id: 1e21})` llegaba a la ruta como la cadena "1e+21" y
 *     terminaba devolviendo el cliente número 1. No rompe el aislamiento por
 *     empresa —el `teamId` sale de la key— pero devuelve un registro que nadie
 *     pidió, y eso a una IA que va a repetirlo en voz alta le sobra.
 *
 *  2. `Number` no trunca, pero deja pasar `NaN` y números fuera del `int4` de
 *     Postgres. Los dos revientan la consulta: `?clientId=abc` y
 *     `?clientId=99999999999` daban 500 (comprobado), que es un error no
 *     controlado y un 500 gratis para quien quiera ensuciar los logs.
 *
 * Los ids de estas tablas son `serial`: dígitos, positivos y dentro del rango.
 */

/** Tope de `integer` en Postgres. Un id mayor no existe, no hace falta consultar. */
const MAX_INT4 = 2_147_483_647;

export function idValido(valor: string): number | null {
  if (!/^\d+$/.test(valor)) return null;
  const n = Number(valor);
  if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_INT4) return null;
  return n;
}

/**
 * Una fecha de filtro, o null si no lo es.
 *
 * Mismo motivo que `idValido`: `new Date('abc')` devuelve Invalid Date sin
 * quejarse, y esa fecha metida en la consulta daba 500. Aquí se corta antes.
 */
export function fechaValida(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}
