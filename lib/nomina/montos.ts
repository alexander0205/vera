/**
 * Pesos escritos por una persona → centavos, o null si no es un monto.
 *
 * Acepta lo que se escribe en República Dominicana: «35000», «35,000»,
 * «35,000.50», «RD$ 35,000». Rechaza lo que no es un número en vez de
 * convertirlo en cero: antes «35,000» y «1000-» se guardaban como un salario de
 * RD$0 sin avisar, y la corrida le pagaba cero a esa persona.
 *
 * La coma solo vale como separador de miles en grupos de tres («35,000»), y el
 * punto como decimal con hasta dos cifras. «35.000,50» se rechaza: es ambiguo,
 * y adivinar un salario es peor que pedir que se escriba de nuevo.
 */
export function pesosACentavos(texto: unknown): number | null {
  if (typeof texto === 'number') {
    return Number.isFinite(texto) && texto >= 0 ? Math.round(texto * 100) : null;
  }
  const s = String(texto ?? '').trim().replace(/^RD\$\s*/i, '').replace(/^\$\s*/, '');
  if (s === '') return null;
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
