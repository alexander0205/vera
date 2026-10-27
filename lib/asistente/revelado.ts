/**
 * Cómo se va mostrando una respuesta que acaba de llegar: por bloques
 * completos (párrafos, tablas, gráficos, tarjetas), nunca a media frase ni a
 * media tabla, para que lo que se ve en cada paso es markdown válido.
 *
 * No acelera la respuesta (ya llegó); hace que se lea de arriba hacia abajo en
 * vez de aparecer de golpe. Con movimiento reducido o en una respuesta corta se
 * muestra entera.
 */

/** Parte el texto en bloques que se pueden mostrar por separado. */
export function bloquesDeRevelado(texto: string): string[] {
  const bloques: string[] = [];
  let actual: string[] = [];
  let dentroDeValla = false;
  for (const linea of texto.split('\n')) {
    if (/^\s*```/.test(linea)) dentroDeValla = !dentroDeValla;
    if (!dentroDeValla && linea.trim() === '' && actual.length) {
      bloques.push(actual.join('\n'));
      actual = [];
      continue;
    }
    if (linea.trim() !== '' || dentroDeValla) actual.push(linea);
  }
  if (actual.length) bloques.push(actual.join('\n'));
  return bloques;
}

/** Cuánto esperar entre bloque y bloque: entero en ~0.9 s como máximo. */
export function pasoDeRevelado(totalBloques: number): number {
  if (totalBloques <= 1) return 0;
  return Math.max(60, Math.min(220, Math.floor(900 / totalBloques)));
}

/** ¿Vale la pena revelar por partes? Muy cortas o de un solo bloque, no; con más de 14 bloques tardaría de más, tampoco. */
export function conviene(texto: string): boolean {
  const n = bloquesDeRevelado(texto).length;
  return texto.length > 220 && n >= 3 && n <= 14;
}
