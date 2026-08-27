/**
 * Provisiones laborales (RD) — función pura, sin BD y en centavos enteros.
 *
 * Calcula lo que la empresa acumula CADA MES por empleado para regalía pascual,
 * vacaciones y cesantía. Todas son lineales en el salario del período, así que
 * se calculan sobre el bruto del período (mensual o prorrateado): la suma de las
 * provisiones de las dos quincenas de un mes ≈ la del mes completo (puede diferir
 * ±1 centavo por redondeo; es una acumulación estimada, no una liquidación).
 *
 * No es una liquidación: es la acumulación contable del costo. Ver los supuestos
 * y la base legal en lib/config/nomina-provisiones.ts.
 */

import type { TasasProvisiones } from '@/lib/config/nomina-provisiones';
import { PROVISIONES_DEFAULT } from '@/lib/config/nomina-provisiones';

const redondear = (n: number) => Math.round(n);

export interface DesgloseProvisiones {
  /** Regalía pascual (13.º sueldo): bruto ÷ 12. */
  regaliaCents: number;
  /** Vacaciones: (días × salario diario) ÷ 12. */
  vacacionesCents: number;
  /** Cesantía provisionada: (días/año × salario diario) ÷ 12. */
  cesantiaCents: number;
  /** Suma de las tres. */
  totalCents: number;
}

export interface ParametrosProvision {
  /** Salario del período en centavos (bruto mensual, o su porción prorrateada). */
  brutoPeriodoCents: number;
  params?: TasasProvisiones;
  /** Días de vacaciones del empleado, si difieren del default (de su ficha). */
  diasVacacionesEmpleado?: number | null;
}

/**
 * Provisión del período para UN empleado. El salario diario ordinario sale de
 * dividir el bruto del período entre el divisor de días laborables — así la
 * proración se respeta sin lógica extra (el bruto ya viene prorrateado).
 */
export function calcularProvisiones(p: ParametrosProvision): DesgloseProvisiones {
  const bruto = Math.max(0, redondear(p.brutoPeriodoCents));
  const t = p.params ?? PROVISIONES_DEFAULT;
  const diasVac = p.diasVacacionesEmpleado != null && p.diasVacacionesEmpleado >= 0
    ? p.diasVacacionesEmpleado
    : t.diasVacaciones;

  const salarioDiario = t.divisorSalarioDiario > 0 ? bruto / t.divisorSalarioDiario : 0;

  const regalia = redondear(bruto / 12);
  const vacaciones = redondear((diasVac * salarioDiario) / 12);
  const cesantia = redondear((t.diasCesantiaPorAnio * salarioDiario) / 12);

  return {
    regaliaCents: regalia,
    vacacionesCents: vacaciones,
    cesantiaCents: cesantia,
    totalCents: regalia + vacaciones + cesantia,
  };
}

/** Lo mínimo de una línea para provisionar. */
export interface LineaParaProvision {
  brutoCents: number;
  diasVacaciones?: number | null;
}

/** Suma las provisiones de varias líneas (una corrida completa). */
export function provisionesDeLineas(
  lineas: LineaParaProvision[],
  params: TasasProvisiones = PROVISIONES_DEFAULT,
): DesgloseProvisiones {
  return lineas.reduce<DesgloseProvisiones>((acc, l) => {
    const d = calcularProvisiones({
      brutoPeriodoCents: l.brutoCents,
      params,
      diasVacacionesEmpleado: l.diasVacaciones,
    });
    return {
      regaliaCents: acc.regaliaCents + d.regaliaCents,
      vacacionesCents: acc.vacacionesCents + d.vacacionesCents,
      cesantiaCents: acc.cesantiaCents + d.cesantiaCents,
      totalCents: acc.totalCents + d.totalCents,
    };
  }, { regaliaCents: 0, vacacionesCents: 0, cesantiaCents: 0, totalCents: 0 });
}
