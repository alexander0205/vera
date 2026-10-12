/**
 * Regalía pascual (salario de Navidad) — funciones puras, sin BD.
 *
 * Código de Trabajo, art. 219: la duodécima parte del salario ordinario
 * devengado por el trabajador durante el año calendario, proporcional al tiempo
 * trabajado; se paga a más tardar el 20 de diciembre.
 *
 *   regalía = (lo devengado en el año) ÷ 12
 *
 * «Lo devengado» sale de las nóminas aprobadas del año. Los meses que trabajó
 * pero no tienen nómina en Zero (la empresa empezó a usarlo a mitad de año) se
 * estiman con su salario de la ficha y los días que trabajó de ese mes, y se
 * avisa cuáles fueron.
 *
 * No cotiza a la TSS. Está exenta de ISR hasta 5 salarios mínimos: lo que pase
 * de ese tope se grava con la renta del año (no como si fuera mensual).
 */

import { isrAnualCents, type DesgloseNomina } from '@/lib/nomina/calculo';
import type { TramoISR } from '@/lib/config/nomina-tasas';
import { diasDelRango, rangoDelMes } from '@/lib/nomina/periodos';

export interface EntradaRegalia {
  anio: number;
  /** Salario mensual de la ficha: base para estimar los meses sin nómina. */
  salarioMensualCents: number;
  fechaIngreso: string | null;
  fechaSalida: string | null;
  /** Lo devengado por mes ('YYYY-MM') según las nóminas aprobadas de ese año. */
  devengadoPorMes: Readonly<Record<string, number>>;
  /** Tope exento: 5 salarios mínimos del sector. Null = no se sabe cuál es (no se grava nada). */
  topeExentoCents: number | null;
}

export interface ResultadoRegalia {
  /** Meses con nómina, sumados. */
  devengadoRealCents: number;
  /** Meses trabajados sin nómina, estimados con la ficha. */
  devengadoEstimadoCents: number;
  /** Los meses 'YYYY-MM' que se estimaron, para avisar. */
  mesesEstimados: string[];
  /** Meses trabajados en el año (con fracciones por ingreso o salida a mitad de mes). */
  mesesTrabajados: number;
  regaliaCents: number;
  exentoCents: number;
  gravadoCents: number;
}

const MESES = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

/** La fracción de un mes que estuvo contratado (0 a 1), por días. */
export function fraccionDelMes(anio: number, mes: string, ingreso: string | null, salida: string | null): number {
  const { inicio, fin } = rangoDelMes(`${anio}-${mes}`);
  const desde = ingreso && ingreso > inicio ? ingreso : inicio;
  const hasta = salida && salida < fin ? salida : fin;
  if (hasta < desde) return 0;
  return diasDelRango({ inicio: desde, fin: hasta }) / diasDelRango({ inicio, fin });
}

export function calcularRegalia(e: EntradaRegalia): ResultadoRegalia {
  let real = 0;
  let estimado = 0;
  let meses = 0;
  const mesesEstimados: string[] = [];

  for (const m of MESES) {
    const clave = `${e.anio}-${m}`;
    const fraccion = fraccionDelMes(e.anio, m, e.fechaIngreso, e.fechaSalida);
    const nomina = e.devengadoPorMes[clave] ?? 0;
    if (nomina > 0) {
      real += nomina;
      meses += fraccion > 0 ? fraccion : 1;
    } else if (fraccion > 0) {
      meses += fraccion;
      const parte = Math.round(Math.max(0, e.salarioMensualCents) * fraccion);
      if (parte > 0) { estimado += parte; mesesEstimados.push(clave); }
    }
  }

  const regaliaCents = Math.round((real + estimado) / 12);
  const exentoCents = e.topeExentoCents === null ? regaliaCents : Math.min(regaliaCents, Math.max(0, e.topeExentoCents));
  return {
    devengadoRealCents: real, devengadoEstimadoCents: estimado, mesesEstimados,
    mesesTrabajados: Math.round(meses * 100) / 100,
    regaliaCents, exentoCents, gravadoCents: regaliaCents - exentoCents,
  };
}

/**
 * ISR de lo gravado de la regalía: el impuesto del año con la regalía menos el del
 * año sin ella. `baseIsrMensualCents` es la base mensual del empleado (bruto − AFP
 * − SFS); la renta del año se aproxima ×12. Sin nada gravado, cero.
 */
export function isrDeRegalia(gravadoCents: number, baseIsrMensualCents: number, escala: TramoISR[]): number {
  if (gravadoCents <= 0) return 0;
  const rentaAnual = Math.max(0, baseIsrMensualCents) * 12;
  return Math.max(0, Math.round(isrAnualCents(rentaAnual + gravadoCents, escala) - isrAnualCents(rentaAnual, escala)));
}

/** La línea de nómina de una regalía: solo ISR, sin TSS ni aportes patronales. */
export function desgloseDeRegalia(regaliaCents: number, isrCents: number): DesgloseNomina {
  const isr = Math.min(isrCents, regaliaCents);
  return {
    brutoCents: regaliaCents, salarioCotizableCents: 0,
    afpEmpleadoCents: 0, sfsEmpleadoCents: 0, isrCents: isr,
    dependientesAdicionales: 0, dependientesAdicionalesCents: 0, otrasDeduccionesCents: 0,
    totalDeduccionesCents: isr,
    afpPatronalCents: 0, sfsPatronalCents: 0, srlPatronalCents: 0, infotepPatronalCents: 0, totalPatronalCents: 0,
    netoCents: regaliaCents - isr, baseIsrMensualCents: 0,
  };
}
