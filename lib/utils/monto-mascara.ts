/**
 * Máscara de montos en pesos para los inputs: «1234567.5» se ve «1,234,567.5».
 *
 * El valor que viaja (estado del formulario, API) es siempre el CRUDO —solo
 * dígitos y un punto, hasta 2 decimales—, así el código que ya lo interpreta con
 * Number() o parseMontoPesos() no cambia. La máscara es solo lo que se ve.
 */

/** Dígitos enteros máximos: RD$ 999,999,999,999 sobra para cualquier monto real. */
export const MONTO_ENTEROS_MAX = 12;

/**
 * Lo que se escribió o se pegó → valor crudo. Quita comas, símbolos y letras;
 * deja un solo punto y 2 decimales; sin ceros a la izquierda («007» → «7»).
 */
export function limpiarMonto(texto: string): string {
  const soloNumero = texto.replace(/[^\d.]/g, '');
  const punto = soloNumero.indexOf('.');
  let enteros = punto === -1 ? soloNumero : soloNumero.slice(0, punto);
  const decimales = punto === -1 ? null : soloNumero.slice(punto + 1).replace(/\./g, '').slice(0, 2);
  enteros = enteros.replace(/^0+(?=\d)/, '').slice(0, MONTO_ENTEROS_MAX);
  if (decimales === null) return enteros;
  return `${enteros === '' ? '0' : enteros}.${decimales}`;
}

/** Valor crudo → lo que se muestra, con comas de miles. */
export function mascaraMonto(crudo: string): string {
  const limpio = limpiarMonto(crudo);
  const punto = limpio.indexOf('.');
  const enteros = punto === -1 ? limpio : limpio.slice(0, punto);
  const agrupados = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return punto === -1 ? agrupados : `${agrupados}.${limpio.slice(punto + 1)}`;
}

/** Cuántos caracteres «significativos» (dígitos y punto) hay antes de la posición del cursor. */
export function significativosAntes(texto: string, posicion: number): number {
  return texto.slice(0, posicion).replace(/[^\d.]/g, '').length;
}

/** Posición en el texto enmascarado que deja `n` caracteres significativos antes del cursor. */
export function posicionTrasMascara(enmascarado: string, n: number): number {
  if (n <= 0) return 0;
  let cuenta = 0;
  for (let i = 0; i < enmascarado.length; i++) {
    if (/[\d.]/.test(enmascarado[i])) cuenta++;
    if (cuenta === n) return i + 1;
  }
  return enmascarado.length;
}
