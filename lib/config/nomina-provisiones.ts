/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Parámetros de PROVISIONES laborales (RD)                         ║
 * ║                                                                  ║
 * ║  Lo que la empresa va acumulando mes a mes para poder pagar los  ║
 * ║  derechos del empleado cuando toquen: regalía pascual (13.º),    ║
 * ║  vacaciones y la reserva por cesantía. NO se le descuenta al     ║
 * ║  empleado; es costo del empleador que se devenga con el tiempo.  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Base legal (Código de Trabajo RD):
 *   · Regalía pascual (Art. 219): 1/12 del salario ordinario devengado en el
 *     año calendario. Provisión mensual = salario del mes ÷ 12.
 *   · Vacaciones (Art. 177): 14 días de salario tras 1 año (sube con la
 *     antigüedad). Provisión mensual = (días × salario diario) ÷ 12.
 *   · Cesantía (Art. 80): se paga al desahucio; muchas empresas la PROVISIONAN.
 *     Estimación: 21 días de salario por año trabajado (tramo ≥ 1 año).
 *     Provisión mensual = (días × salario diario) ÷ 12.
 *
 * ⚠️ Es una ESTIMACIÓN contable, no un cálculo definitivo de liquidación: la
 *    regalía tiene tope y corte anual, las vacaciones y la cesantía dependen de
 *    la antigüedad exacta y del motivo de salida. Los días y el divisor quedan
 *    parametrizados para ajustarlos por empresa cuando se confirmen (relacionado
 *    con la validación legal pendiente del contrato).
 */

export interface TasasProvisiones {
  /** Días de vacaciones al año que se provisionan (default de ley: 14). */
  diasVacaciones: number;
  /** Días de cesantía provisionados por año trabajado (estimación: 21). */
  diasCesantiaPorAnio: number;
  /**
   * Divisor para pasar el salario MENSUAL a salario DIARIO ordinario. En RD se
   * usa 23.83 (promedio de días laborables al mes) para vacaciones y cesantía.
   */
  divisorSalarioDiario: number;
}

export const PROVISIONES_DEFAULT: TasasProvisiones = {
  diasVacaciones: 14,
  diasCesantiaPorAnio: 21,
  divisorSalarioDiario: 23.83,
};
