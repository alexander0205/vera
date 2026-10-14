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
 * Lo que sale en cada cuota según qué es el cobro. Es la regla de
 * `armarPlanDeCobro`: la colegiatura cobra la tarifa entera en cada cuota; lo
 * demás toma la tarifa como el total del año y la reparte.
 */
export function montosPorCuota(
  tipoDeConcepto: string,
  montoCentavos: number,
  pesos: number[],
): number[] {
  return tipoDeConcepto === 'mensualidad'
    ? pesos.map(() => montoCentavos)
    : repartir(montoCentavos, pesos);
}
