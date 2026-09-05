/**
 * Motor de cálculo de nómina (RD) — función pura, sin base de datos.
 *
 * Dado el salario mensual de un empleado y las tasas del año, devuelve el
 * desglose completo: deducciones del empleado (AFP, SFS, ISR), aportes
 * patronales (AFP, SFS, SRL, INFOTEP) y el neto a pagar. Todo en CENTAVOS
 * enteros: nunca flotantes de peso, para que sumar mil recibos cuadre al
 * centavo con la contabilidad.
 *
 * No trae ningún número de ley quemado — los lee de lib/config/nomina-tasas.ts.
 *
 * Alcance actual (Fase 2): calcula sobre el salario MENSUAL. La conversión de
 * quincenal/semanal a base mensual la hace la corrida (Fase 3) antes de llamar
 * aquí. Provisiones (regalía, vacaciones, cesantía) son de fase posterior.
 */

import type { TasasNomina, TramoISR } from '@/lib/config/nomina-tasas';

const redondear = (n: number) => Math.round(n);

/**
 * Salario sobre el que se cotiza a un régimen, tras aplicar su tope. Un tope
 * de 0 (SMC aún sin confirmar) se trata como SIN tope: preferimos no capar a
 * capar mal. Devuelve el salario íntegro en ese caso.
 */
function salarioCotizable(salarioCents: number, smcCents: number, topeEnSalarios: number): number {
  if (smcCents <= 0) return salarioCents;
  const tope = smcCents * topeEnSalarios;
  return Math.min(salarioCents, tope);
}

/**
 * ISR mensual a retener, en centavos, para una renta imponible MENSUAL.
 *
 * La escala del ISR es ANUAL: se anualiza (×12) la base, se ubica el tramo, se
 * calcula el impuesto del año y se divide entre 12. Base ≤ 0 → no hay ISR.
 */
export function isrMensualCents(baseImponibleMensualCents: number, escala: TramoISR[]): number {
  if (baseImponibleMensualCents <= 0) return 0;
  const anual = baseImponibleMensualCents * 12;

  // El tramo aplicable es el de mayor `desdeCents` que no supere la renta.
  let tramo: TramoISR = escala[0];
  for (const t of escala) {
    if (anual >= t.desdeCents) tramo = t;
    else break;
  }

  const impuestoAnual = tramo.fijoCents + (anual - tramo.desdeCents) * tramo.tasa;
  return redondear(impuestoAnual / 12);
}

export interface DesgloseNomina {
  brutoCents: number;
  // Deducciones del empleado
  afpEmpleadoCents: number;
  sfsEmpleadoCents: number;
  isrCents: number;
  otrasDeduccionesCents: number;
  totalDeduccionesCents: number;
  // Aportes patronales (los paga la empresa, no salen del sueldo)
  afpPatronalCents: number;
  sfsPatronalCents: number;
  srlPatronalCents: number;
  infotepPatronalCents: number;
  totalPatronalCents: number;
  // Resultado
  netoCents: number;
  /** Base sobre la que se calculó el ISR (bruto − AFP − SFS del empleado). */
  baseIsrMensualCents: number;
}

export interface ParametrosNomina {
  /** Salario mensual (base de cálculo), en centavos. */
  salarioMensualCents: number;
  tasas: TasasNomina;
  /** Otras deducciones del empleado (préstamos, avances…), en centavos. */
  otrasDeduccionesCents?: number;
}

/**
 * Calcula la nómina de UN empleado para un mes. Pura y determinista: mismas
 * entradas, mismas salidas. AFP y SFS del empleado bajan la base del ISR
 * (son deducibles). El neto es bruto menos todo lo que le descuentan.
 */
export function calcularNominaEmpleado(p: ParametrosNomina): DesgloseNomina {
  const bruto = Math.max(0, redondear(p.salarioMensualCents));
  const t = p.tasas;
  const otras = Math.max(0, redondear(p.otrasDeduccionesCents ?? 0));

  const cotizableAfp = salarioCotizable(bruto, t.salarioMinimoCotizableCents, t.topeAfpEnSalarios);
  const cotizableSfs = salarioCotizable(bruto, t.salarioMinimoCotizableCents, t.topeSfsEnSalarios);
  const cotizableSrl = salarioCotizable(bruto, t.salarioMinimoCotizableCents, t.topeSrlEnSalarios);

  // Deducciones del empleado
  const afpEmpleado = redondear(cotizableAfp * t.afpEmpleado);
  const sfsEmpleado = redondear(cotizableSfs * t.sfsEmpleado);
  const baseIsr = bruto - afpEmpleado - sfsEmpleado;
  const isr = isrMensualCents(baseIsr, t.isrEscala);
  const totalDeducciones = afpEmpleado + sfsEmpleado + isr + otras;

  // Aportes patronales (INFOTEP va sobre el salario íntegro, sin tope)
  const afpPatronal = redondear(cotizableAfp * t.afpPatronal);
  const sfsPatronal = redondear(cotizableSfs * t.sfsPatronal);
  const srlPatronal = redondear(cotizableSrl * t.srlPatronal);
  const infotepPatronal = redondear(bruto * t.infotepPatronal);
  const totalPatronal = afpPatronal + sfsPatronal + srlPatronal + infotepPatronal;

  return {
    brutoCents: bruto,
    afpEmpleadoCents: afpEmpleado,
    sfsEmpleadoCents: sfsEmpleado,
    isrCents: isr,
    otrasDeduccionesCents: otras,
    totalDeduccionesCents: totalDeducciones,
    afpPatronalCents: afpPatronal,
    sfsPatronalCents: sfsPatronal,
    srlPatronalCents: srlPatronal,
    infotepPatronalCents: infotepPatronal,
    totalPatronalCents: totalPatronal,
    netoCents: bruto - totalDeducciones,
    baseIsrMensualCents: baseIsr,
  };
}

/**
 * Reparte un total MENSUAL entre `deTotal` períodos y devuelve el pedazo del
 * período `indice` (1..deTotal), con redondeo ACUMULADO: la suma de los pedazos
 * es exactamente el total, sin perder ni inventar un centavo.
 *
 *   pedazo(k) = round(total·k/N) − round(total·(k−1)/N)
 *
 * Telescopea: Σ pedazo(k) = round(total) − round(0) = total. Así dos quincenas
 * suman el mes al centavo, y la declaración mensual de TSS/DGII cuadra.
 */
export function pedazoPeriodo(totalCents: number, indice: number, deTotal: number): number {
  if (deTotal <= 1 || indice <= 0) return totalCents;
  const hasta = Math.round((totalCents * indice) / deTotal);
  const antes = Math.round((totalCents * (indice - 1)) / deTotal);
  return hasta - antes;
}

/**
 * Prorratea un desglose MENSUAL al período (indice de deTotal).
 *
 * Clave: los topes de TSS y la escala progresiva del ISR YA se aplicaron sobre
 * el salario del mes en `calcularNominaEmpleado`; aquí solo se REPARTE el
 * resultado. Prorratear la base antes de calcular distorsionaría el ISR (la
 * escala es anual) y los topes — por eso se calcula mensual y luego se divide.
 *
 * Los totales se recomponen de las partes ya repartidas para que sigan cuadrando
 * dentro del período (total = Σ partes; neto = bruto − deducciones).
 */
export function prorratearDesglose(d: DesgloseNomina, indice: number, deTotal: number): DesgloseNomina {
  if (deTotal <= 1) return d;
  const p = (n: number) => pedazoPeriodo(n, indice, deTotal);

  const brutoCents = p(d.brutoCents);
  const afpEmpleadoCents = p(d.afpEmpleadoCents);
  const sfsEmpleadoCents = p(d.sfsEmpleadoCents);
  const isrCents = p(d.isrCents);
  const otrasDeduccionesCents = p(d.otrasDeduccionesCents);
  const afpPatronalCents = p(d.afpPatronalCents);
  const sfsPatronalCents = p(d.sfsPatronalCents);
  const srlPatronalCents = p(d.srlPatronalCents);
  const infotepPatronalCents = p(d.infotepPatronalCents);

  const totalDeduccionesCents = afpEmpleadoCents + sfsEmpleadoCents + isrCents + otrasDeduccionesCents;
  const totalPatronalCents = afpPatronalCents + sfsPatronalCents + srlPatronalCents + infotepPatronalCents;

  return {
    brutoCents,
    afpEmpleadoCents,
    sfsEmpleadoCents,
    isrCents,
    otrasDeduccionesCents,
    totalDeduccionesCents,
    afpPatronalCents,
    sfsPatronalCents,
    srlPatronalCents,
    infotepPatronalCents,
    totalPatronalCents,
    netoCents: brutoCents - totalDeduccionesCents,
    baseIsrMensualCents: p(d.baseIsrMensualCents),
  };
}
