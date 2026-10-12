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

/** Por qué el ISR de un mes da lo que da, para enseñarlo en pantalla. */
export interface ExplicacionIsr {
  /** Base del mes × 12. */
  baseAnualCents: number;
  /** Hasta dónde no se paga ISR en el año. */
  exentoHastaCents: number;
  /** El tramo aplicado, o null si la renta no pasa del exento. */
  tramo: TramoISR | null;
  impuestoAnualCents: number;
}

export function explicarIsr(baseImponibleMensualCents: number, escala: TramoISR[]): ExplicacionIsr {
  const baseAnual = Math.max(0, baseImponibleMensualCents) * 12;
  const exentoHasta = escala.find((t) => t.tasa > 0)?.desdeCents ?? 0;
  let tramo: TramoISR | null = null;
  for (const t of escala) {
    if (t.tasa > 0 && baseAnual > t.desdeCents) tramo = t;
  }
  const impuesto = tramo ? tramo.fijoCents + (baseAnual - tramo.desdeCents) * tramo.tasa : 0;
  return { baseAnualCents: baseAnual, exentoHastaCents: exentoHasta, tramo, impuestoAnualCents: Math.round(impuesto) };
}

export interface DesgloseNomina {
  brutoCents: number;
  /**
   * Base con la que se cotizó a la TSS, antes de topes: el bruto, o el salario
   * mínimo del sector si el bruto no llega y no hay dispensa. Es la columna
   * «salario cotizable» de la autodeterminación.
   */
  salarioCotizableCents: number;
  // Deducciones del empleado
  afpEmpleadoCents: number;
  sfsEmpleadoCents: number;
  isrCents: number;
  /** Dependientes adicionales cobrados (no se reparte entre períodos). */
  dependientesAdicionales: number;
  /** Cápita de esos dependientes (per cápita + FONAMAT): la TSS la factura. */
  dependientesAdicionalesCents: number;
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
  /**
   * Piso de la base cotizable: el salario mínimo del sector. La TSS no admite
   * cotizar por debajo sin dispensa (Res. CNSS 471-02). Omitido o 0 = sin piso.
   */
  pisoCotizableCents?: number;
  /** Tasa SRL de la empresa (1.10–1.30 % según su riesgo). Omitida = la del año. */
  srlTasa?: number;
  /** Dependientes adicionales registrados en el SFS. */
  dependientesAdicionales?: number;
  /** Cápita mensual por dependiente adicional (per cápita + FONAMAT), en centavos. */
  capitaDependienteCents?: number;
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

  // La base cotizable no baja del salario mínimo del sector. Solo sube la BASE de
  // la TSS: lo que se paga y la base del ISR siguen siendo el salario real. Sin
  // salario no hay piso: una ficha en cero todavía no cobra ni cotiza.
  const piso = Math.max(0, redondear(p.pisoCotizableCents ?? 0));
  const baseCotizable = bruto > 0 ? Math.max(bruto, piso) : 0;

  const cotizableAfp = salarioCotizable(baseCotizable, t.salarioMinimoCotizableCents, t.topeAfpEnSalarios);
  const cotizableSfs = salarioCotizable(baseCotizable, t.salarioMinimoCotizableCents, t.topeSfsEnSalarios);
  const cotizableSrl = salarioCotizable(baseCotizable, t.salarioMinimoCotizableCents, t.topeSrlEnSalarios);

  // Deducciones del empleado
  const afpEmpleado = redondear(cotizableAfp * t.afpEmpleado);
  const sfsEmpleado = redondear(cotizableSfs * t.sfsEmpleado);
  const baseIsr = bruto - afpEmpleado - sfsEmpleado;
  const isr = isrMensualCents(baseIsr, t.isrEscala);
  // La cápita de dependientes es un monto fijo por dependiente, no un % del
  // salario. No se resta de la base del ISR: no hay fuente que diga que sea
  // deducible, y descontarlo sin ella sería retener de menos.
  const dependientes = Math.max(0, Math.trunc(p.dependientesAdicionales ?? 0));
  const dependientesCents = dependientes * Math.max(0, redondear(p.capitaDependienteCents ?? 0));
  const totalDeducciones = afpEmpleado + sfsEmpleado + isr + dependientesCents + otras;

  // Aportes patronales. INFOTEP va sobre el salario real: su base («salario
  // INFOTEP» en la TSS) es ordinario + comisiones, sin piso ni tope.
  const afpPatronal = redondear(cotizableAfp * t.afpPatronal);
  const sfsPatronal = redondear(cotizableSfs * t.sfsPatronal);
  const srlPatronal = redondear(cotizableSrl * (p.srlTasa ?? t.srlPatronal));
  const infotepPatronal = redondear(bruto * t.infotepPatronal);
  const totalPatronal = afpPatronal + sfsPatronal + srlPatronal + infotepPatronal;

  return {
    brutoCents: bruto,
    salarioCotizableCents: baseCotizable,
    afpEmpleadoCents: afpEmpleado,
    sfsEmpleadoCents: sfsEmpleado,
    isrCents: isr,
    dependientesAdicionales: dependientes,
    dependientesAdicionalesCents: dependientesCents,
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
 * Reparte un desglose MENSUAL y devuelve el pedazo que pesa `propio`, después de
 * los pedazos que suman `antes`, de un total `total` (pesos en cualquier unidad:
 * bruto de cada tramo, días…). Con redondeo ACUMULADO, como `pedazoPeriodo`: los
 * pedazos consecutivos de un mismo total suman el desglose al centavo.
 *
 * Clave: los topes de TSS y la escala progresiva del ISR YA se aplicaron sobre
 * el salario del mes en `calcularNominaEmpleado`; aquí solo se REPARTE el
 * resultado. Prorratear la base antes de calcular distorsionaría el ISR (la
 * escala es anual) y los topes — por eso se calcula el mes y luego se divide.
 *
 * Los totales se recomponen de las partes ya repartidas para que sigan cuadrando
 * dentro del período (total = Σ partes; neto = bruto − deducciones). La cantidad
 * de dependientes no se reparte: cada pedazo dice cuántos cobra.
 */
export function repartirDesglose(d: DesgloseNomina, antes: number, propio: number, total: number): DesgloseNomina {
  if (total <= 0 || (antes <= 0 && propio >= total)) return d;
  const desde = antes / total;
  const hasta = (antes + propio) / total;
  const p = (n: number) => Math.round(n * hasta) - Math.round(n * desde);

  const brutoCents = p(d.brutoCents);
  const afpEmpleadoCents = p(d.afpEmpleadoCents);
  const sfsEmpleadoCents = p(d.sfsEmpleadoCents);
  const isrCents = p(d.isrCents);
  const dependientesAdicionalesCents = p(d.dependientesAdicionalesCents);
  const otrasDeduccionesCents = p(d.otrasDeduccionesCents);
  const afpPatronalCents = p(d.afpPatronalCents);
  const sfsPatronalCents = p(d.sfsPatronalCents);
  const srlPatronalCents = p(d.srlPatronalCents);
  const infotepPatronalCents = p(d.infotepPatronalCents);

  const totalDeduccionesCents =
    afpEmpleadoCents + sfsEmpleadoCents + isrCents + dependientesAdicionalesCents + otrasDeduccionesCents;
  const totalPatronalCents = afpPatronalCents + sfsPatronalCents + srlPatronalCents + infotepPatronalCents;

  return {
    brutoCents,
    salarioCotizableCents: p(d.salarioCotizableCents),
    afpEmpleadoCents,
    sfsEmpleadoCents,
    isrCents,
    dependientesAdicionales: d.dependientesAdicionales,
    dependientesAdicionalesCents,
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
