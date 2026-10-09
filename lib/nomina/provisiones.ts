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
import { sumarDiasYMD } from '@/lib/nomina/periodos';

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

// ─── Provisión según antigüedad ───────────────────────────────────────────────

/**
 * Meses completos de servicio entre el ingreso y un día (ambos trabajados). Del
 * 10 de enero al 9 de abril son 3 meses; al 8 de abril, 2.
 */
export function mesesDeServicio(fechaIngreso: string, hasta: string): number {
  if (hasta < fechaIngreso) return 0;
  const [y1, m1, d1] = fechaIngreso.split('-').map(Number);
  const [y2, m2, d2] = sumarDiasYMD(hasta, 1).split('-').map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

/**
 * Días de cesantía que ya tiene ganados alguien con esos meses de servicio (art. 80
 * del Código de Trabajo): menos de 3 meses, 0; de 3 a 6, 6 días; de 6 a 12, 13;
 * de 1 a 5 años, 21 por año; desde 5 años, 23 por año. La fracción de año cuenta
 * por meses completos, como la calculadora del Ministerio de Trabajo.
 */
export function diasCesantiaGanados(meses: number): number {
  if (meses < 3) return 0;
  if (meses < 6) return 6;
  if (meses < 12) return 13;
  return (meses < 60 ? 21 : 23) * (meses / 12);
}

/** Días de vacaciones al año por ley (art. 177): 14 hasta los 5 años, 18 desde ahí. */
export const diasVacacionesDeLey = (meses: number) => (meses >= 60 ? 18 : 14);

export interface ParametrosProvisionPeriodo {
  /** Lo devengado en el período. */
  brutoPeriodoCents: number;
  /** El salario mensual completo, base del salario diario de la cesantía. */
  salarioMensualCents: number;
  /** Null = sin fecha de ingreso: se usa la estimación lineal de antes. */
  fechaIngreso: string | null;
  /** Rango del período. Quien salió dentro de él cuenta hasta su salida. */
  inicio: string;
  fin: string;
  fechaSalida?: string | null;
  /** Días de vacaciones de su ficha; si son menos que los de ley, mandan los de ley. */
  diasVacacionesEmpleado?: number | null;
  /** Tope anual de la regalía (5 salarios mínimos, art. 219). Null = sin tope. */
  topeRegaliaAnualCents?: number | null;
  params?: TasasProvisiones;
}

export interface DesgloseProvisionPeriodo extends DesgloseProvisiones {
  salarioDiarioCents: number;
  diasVacacionesAnio: number;
  /** Días de cesantía ganados antes y al final del período. */
  diasCesantiaAntes: number;
  diasCesantiaDespues: number;
  mesesServicio: number | null;
  regaliaTopada: boolean;
}

/**
 * Lo que la empresa tiene que apartar en un período por un empleado:
 *
 *   · Regalía: 1/12 de lo devengado, sin pasar de 1/12 del tope anual (en la
 *     proporción del período).
 *   · Vacaciones: días del año (14 o 18 según antigüedad, o los de su ficha si
 *     son más) × salario diario del período ÷ 12.
 *   · Cesantía: lo que suben en el período los días de cesantía ganados, por el
 *     salario diario. Así la provisión acumulada es siempre la cesantía que se
 *     pagaría si se le desahuciara ese día: 0 los primeros 3 meses y un salto de
 *     6 días al cumplirlos.
 */
export function calcularProvisionesPeriodo(p: ParametrosProvisionPeriodo): DesgloseProvisionPeriodo {
  const t = p.params ?? PROVISIONES_DEFAULT;
  const bruto = Math.max(0, redondear(p.brutoPeriodoCents));
  const salarioMensual = Math.max(0, redondear(p.salarioMensualCents));
  const divisor = t.divisorSalarioDiario > 0 ? t.divisorSalarioDiario : 23.83;
  const salarioDiario = salarioMensual / divisor;

  // Regalía con tope en la proporción del período.
  let regalia = bruto / 12;
  let regaliaTopada = false;
  if (p.topeRegaliaAnualCents && p.topeRegaliaAnualCents > 0 && salarioMensual > 0) {
    const topePeriodo = (p.topeRegaliaAnualCents / 12) * (bruto / salarioMensual);
    if (regalia > topePeriodo) { regalia = topePeriodo; regaliaTopada = true; }
  }

  const hasta = p.fechaSalida && p.fechaSalida < p.fin ? p.fechaSalida : p.fin;
  const meses = p.fechaIngreso ? mesesDeServicio(p.fechaIngreso, hasta) : null;

  const diasLey = diasVacacionesDeLey(meses ?? 12);
  const diasVac = Math.max(diasLey, p.diasVacacionesEmpleado ?? 0);
  const vacaciones = (diasVac * (bruto / divisor)) / 12;

  let cesantia: number;
  let antes = 0;
  let despues = 0;
  if (meses === null || !p.fechaIngreso) {
    // Sin fecha de ingreso no hay antigüedad: la estimación lineal de 21 días al año.
    cesantia = (t.diasCesantiaPorAnio * (bruto / divisor)) / 12;
  } else {
    const diaAnterior = sumarDiasYMD(p.inicio, -1);
    antes = diaAnterior < p.fechaIngreso ? 0 : diasCesantiaGanados(mesesDeServicio(p.fechaIngreso, diaAnterior));
    despues = diasCesantiaGanados(meses);
    cesantia = Math.max(0, despues - antes) * salarioDiario;
  }

  const regaliaCents = redondear(regalia);
  const vacacionesCents = redondear(vacaciones);
  const cesantiaCents = redondear(cesantia);
  return {
    regaliaCents,
    vacacionesCents,
    cesantiaCents,
    totalCents: regaliaCents + vacacionesCents + cesantiaCents,
    salarioDiarioCents: redondear(salarioDiario),
    diasVacacionesAnio: diasVac,
    diasCesantiaAntes: antes,
    diasCesantiaDespues: despues,
    mesesServicio: meses,
    regaliaTopada,
  };
}

/** Lo mínimo de una línea para provisionar. */
export interface LineaParaProvision {
  brutoCents: number;
  diasVacaciones?: number | null;
  /** Lo que guardó la corrida según antigüedad. Null en corridas viejas. */
  provisionRegaliaCents?: number | null;
  provisionVacacionesCents?: number | null;
  provisionCesantiaCents?: number | null;
}

/** Suma las provisiones de varias líneas (una corrida completa). */
export function provisionesDeLineas(
  lineas: LineaParaProvision[],
  params: TasasProvisiones = PROVISIONES_DEFAULT,
): DesgloseProvisiones {
  return lineas.reduce<DesgloseProvisiones>((acc, l) => {
    // Las corridas nuevas guardan la provisión según antigüedad; las viejas no.
    const guardada = l.provisionRegaliaCents != null && l.provisionVacacionesCents != null && l.provisionCesantiaCents != null;
    const d = guardada
      ? {
          regaliaCents: Number(l.provisionRegaliaCents),
          vacacionesCents: Number(l.provisionVacacionesCents),
          cesantiaCents: Number(l.provisionCesantiaCents),
          totalCents: Number(l.provisionRegaliaCents) + Number(l.provisionVacacionesCents) + Number(l.provisionCesantiaCents),
        }
      : calcularProvisiones({
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
