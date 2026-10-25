/**
 * Reparto de un monto entre cuotas, sin base de datos.
 *
 * Vive aparte de `plan-cobro.ts` porque aquel importa la conexión a la base, y
 * el diálogo de Tarifas necesita el mismo cálculo en el navegador para decir
 * cuánto sale cada cuota. Pruebas en `tests/unit/evaluaciones-precio.test.ts`.
 */

/** Reparte un monto entre cuotas sin perder ni un centavo por redondeo. */
export function repartir(
  montoCentavos: number,
  pesos: number[],
): number[] {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (suma <= 0) return pesos.map(() => 0);
  // Tercios guardados como 33.334/33.333/33.333 representan cuotas iguales.
  // Si el total se divide exacto, no crear centavos artificiales (200,02 y
  // 199,99 para tres evaluaciones de RD$200).
  if (pesos.length > 0 && montoCentavos % pesos.length === 0
    && Math.max(...pesos) - Math.min(...pesos) <= 1) {
    return pesos.map(() => montoCentavos / pesos.length);
  }
  const partes = pesos.map((p) => Math.floor((montoCentavos * p) / suma));
  // Lo que se perdió al truncar se le da a la primera cuota, en vez de dejar
  // que el total de las cuotas no cuadre con la tarifa. Un colegio que cobra
  // 45.000 en tres partes tiene que ver 15.000 tres veces, no 14.999.
  const resto = montoCentavos - partes.reduce((a, b) => a + b, 0);
  if (partes.length > 0) partes[0] += resto;
  return partes;
}

/**
 * Lo que se cobra en partes: el número de Tarifas es el TOTAL y se reparte entre
 * las cuotas («inscripción 3,500 en dos pagos», la evaluación trimestral).
 */
const SE_REPARTE = new Set(['inscripcion', 'actividad', 'uniforme']);

/**
 * Si el número de Tarifas es lo de CADA cuota (true) o el total que se reparte
 * entre ellas (false).
 *
 * Lo que se repite —colegiatura, almuerzo, transporte, horario extendido, las
 * categorías propias del colegio— cobra el precio en cada cuota: así lo piensa
 * el colegio («el almuerzo son 5,000 al mes»). Antes solo la colegiatura lo
 * hacía, y un almuerzo de 5,000 en 11 cuotas salía a 455. Inscripción,
 * actividades y uniformes siguen repartiendo el total.
 *
 * `precioPorCuota` del concepto, si alguien lo fijó, manda sobre la regla. No
 * tiene pantalla: la elección confundía más de lo que ayudaba.
 */
export function precioEsPorCuota(concepto: { tipo: string; precioPorCuota?: boolean | null }): boolean {
  return concepto.precioPorCuota ?? !SE_REPARTE.has(concepto.tipo);
}

/**
 * Las cuotas del calendario que cobra una tarifa: las primeras `n`, o todas.
 * Maternal e Infantes pagan 11 meses y los demás grados 10 con el mismo
 * concepto: el calendario tiene 11 y la tarifa de esos grados dice 10.
 */
export function cuotasDeLaTarifa<T>(cuotas: T[], n: number | null | undefined): T[] {
  return n != null && n > 0 && n < cuotas.length ? cuotas.slice(0, n) : cuotas;
}

/**
 * Lo que sale en cada cuota. Es la regla de `armarPlanDeCobro`: si el precio es
 * por cuota, se cobra entero en cada una; si es el total del año, se reparte.
 * `precioPorCuota` es lo que dijo el colegio en el concepto; sin él, decide el
 * tipo (`precioEsPorCuota`).
 */
export function montosPorCuota(
  tipoDeConcepto: string,
  montoCentavos: number,
  pesos: number[],
  precioPorCuota?: boolean | null,
): number[] {
  return precioEsPorCuota({ tipo: tipoDeConcepto, precioPorCuota })
    ? pesos.map(() => montoCentavos)
    : repartir(montoCentavos, pesos);
}
