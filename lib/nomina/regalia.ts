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

/** Los tramos de un mes que una nómina aprobada ya pagó. */
export interface CoberturaMes {
  q1: boolean;
  q2: boolean;
  /**
   * Días que cubren las corridas SEMANALES aprobadas del mes (7 por semana). Solo se mira cuando no hay
   * corrida mensual ni quincenal: un mes con una sola semana pagada no está cubierto, solo esa semana.
   */
  diasSemanales?: number;
}

/** Días de una semana de pago por mes: 7 × 52 ÷ 12. */
export const DIAS_SEMANALES_POR_MES = (7 * 52) / 12;

export interface EntradaRegalia {
  anio: number;
  /** Salario mensual de la ficha: base para estimar los meses sin nómina. */
  salarioMensualCents: number;
  fechaIngreso: string | null;
  fechaSalida: string | null;
  /** Quien salió y reingresó el mismo año: los días entre una cosa y otra no cuentan. */
  huecos?: readonly { desde: string; hasta: string }[];
  /** Lo devengado por mes ('YYYY-MM') según las nóminas aprobadas de ese año. */
  devengadoPorMes: Readonly<Record<string, number>>;
  /**
   * Qué tramos de cada mes ya tienen nómina, cuando se sabe. Un mes con una sola
   * quincena pagada solo cubre esa mitad: la otra se estima con la ficha. Sin dato
   * (o con una corrida mensual, semanal o de las viejas) el mes se da por cubierto.
   */
  coberturaPorMes?: Readonly<Record<string, CoberturaMes>>;
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
export function fraccionDelMes(
  anio: number, mes: string, ingreso: string | null, salida: string | null,
  /** Períodos en que NO trabajó dentro de ese rango (entre una salida y un reingreso), extremos incluidos. */
  huecos: readonly { desde: string; hasta: string }[] = [],
): number {
  const { inicio, fin } = rangoDelMes(`${anio}-${mes}`);
  const desde = ingreso && ingreso > inicio ? ingreso : inicio;
  const hasta = salida && salida < fin ? salida : fin;
  if (hasta < desde) return 0;
  let dias = diasDelRango({ inicio: desde, fin: hasta });
  for (const h of huecos) {
    const d = h.desde > desde ? h.desde : desde;
    const f = h.hasta < hasta ? h.hasta : hasta;
    if (f >= d) dias -= diasDelRango({ inicio: d, fin: f });
  }
  return Math.max(0, dias) / diasDelRango({ inicio, fin });
}

/** Días del tramo en que estuvo contratado. */
function diasTrabajadosEn(t: { inicio: string; fin: string }, ingreso: string | null, salida: string | null): number {
  const desde = ingreso && ingreso > t.inicio ? ingreso : t.inicio;
  const hasta = salida && salida < t.fin ? salida : t.fin;
  return hasta < desde ? 0 : diasDelRango({ inicio: desde, fin: hasta });
}

export function calcularRegalia(e: EntradaRegalia): ResultadoRegalia {
  let real = 0;
  let estimado = 0;
  let meses = 0;
  const mesesEstimados: string[] = [];
  let semanalCubierto = 0;
  let semanalEsperado = 0;
  let ultimoMesSemanal: string | null = null;

  for (const m of MESES) {
    const clave = `${e.anio}-${m}`;
    const fraccion = fraccionDelMes(e.anio, m, e.fechaIngreso, e.fechaSalida, e.huecos);
    const nomina = e.devengadoPorMes[clave] ?? 0;
    if (nomina > 0) {
      real += nomina;
      meses += fraccion > 0 ? fraccion : 1;
      // Mes pagado a medias (una sola quincena): lo que falta se estima con la ficha,
      // tramo por tramo, igual que lo calcula la nómina (mitad del sueldo × días trabajados / días del tramo).
      const cob = e.coberturaPorMes?.[clave];
      if (cob && !cob.q1 && !cob.q2 && cob.diasSemanales !== undefined) {
        // Quien cobra por semana: un mes trae 4 o 5 semanas (4.33 de promedio), así que un mes suelto no
        // dice nada. Se suma lo cubierto y lo esperado de todos esos meses y se estima solo la diferencia.
        semanalCubierto += cob.diasSemanales;
        semanalEsperado += fraccion * DIAS_SEMANALES_POR_MES;
        ultimoMesSemanal = clave;
      } else if (cob && cob.q1 !== cob.q2) {
        const { inicio, fin } = rangoDelMes(clave);
        const tramo = cob.q1 ? { inicio: `${clave}-16`, fin } : { inicio, fin: `${clave}-15` };
        const trabajados = diasTrabajadosEn(tramo, e.fechaIngreso, e.fechaSalida);
        const parte = Math.round((Math.max(0, e.salarioMensualCents) / 2) * trabajados / diasDelRango(tramo));
        if (parte > 0) { estimado += parte; mesesEstimados.push(clave); }
      }
    } else if (fraccion > 0) {
      meses += fraccion;
      const parte = Math.round(Math.max(0, e.salarioMensualCents) * fraccion);
      if (parte > 0) { estimado += parte; mesesEstimados.push(clave); }
    }
  }

  // Semanas que faltan por pagar (medio día de tolerancia por redondeo): el sueldo por día de un mes semanal.
  const faltanDias = semanalEsperado - semanalCubierto;
  if (faltanDias > 0.5 && ultimoMesSemanal) {
    const parte = Math.round(Math.max(0, e.salarioMensualCents) * (faltanDias / DIAS_SEMANALES_POR_MES));
    if (parte > 0) { estimado += parte; mesesEstimados.push(ultimoMesSemanal); }
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

/** Desde cuándo se puede generar la regalía del año en curso. */
export const MES_DIA_INICIO_REGALIA = '11-01';

/**
 * Año válido para una regalía: de 2000 en adelante. Los años anteriores se generan en
 * cualquier momento; el año en curso solo desde el 1 de noviembre (antes faltan demasiados
 * meses por devengar); el que viene, nunca.
 */
export function anioRegaliaValido(anio: unknown, hoy: string): anio is number {
  if (typeof anio !== 'number' || !Number.isInteger(anio) || anio < 2000) return false;
  const actual = Number(hoy.slice(0, 4));
  if (anio < actual) return true;
  return anio === actual && hoy.slice(5) >= MES_DIA_INICIO_REGALIA;
}

/** ¿Aún no termina el año? Los meses sin nómina que faltan se estiman con la ficha. */
export const anioEnCurso = (anio: number, hoy: string) => anio >= Number(hoy.slice(0, 4));

/**
 * ¿Entra este empleado a la corrida de regalía del año? Trabajó algún día del año, no se liquidó ese
 * año (ya cobró su regalía proporcional) y no está de baja sin fecha de salida (no se sabe hasta
 * cuándo trabajó; igual que en las nóminas de sueldo).
 */
export function esCandidatoRegalia(
  e: { estado: string; fechaIngreso: string | null; fechaSalida: string | null },
  anio: number,
  liquidado: boolean,
): boolean {
  if (liquidado) return false;
  if (e.estado !== 'activo' && !e.fechaSalida) return false;
  return (!e.fechaIngreso || e.fechaIngreso <= `${anio}-12-31`) && (!e.fechaSalida || e.fechaSalida >= `${anio}-01-01`);
}

/**
 * Qué parte de un mes representa lo que pagó una nómina, para promediar el salario de los últimos 12 meses.
 *   · Mensual y quincenal: días pagados ÷ días del mes (un mes pagado a medias pesa menos).
 *   · Semanal y por horas: lo pagado no dice cuánto del mes estaba contratado (una semana de 7 días o los
 *     días con horas no son «el mes»), así que pesa la parte del mes en que el empleado estuvo CONTRATADO.
 * Null = no se sabe (cuenta como mes completo).
 */
export function fraccionParaPromedio(x: {
  semanal: boolean; conHoras: boolean; diasPagados: number | null; mes: string; ingreso: string | null; salida: string | null;
}): number | null {
  if (x.semanal || x.conHoras) {
    const f = fraccionDelMes(Number(x.mes.slice(0, 4)), x.mes.slice(5, 7), x.ingreso, x.salida);
    return f > 0 ? f : null;
  }
  if (x.diasPagados === null) return null;
  const [a, m] = x.mes.split('-').map(Number);
  return Math.min(1, x.diasPagados / new Date(Date.UTC(a, m, 0)).getUTCDate());
}

/** ¿Reingresó después de la fecha de salida de su liquidación? Entonces sigue trabajando y sí cobra regalía. */
export const esReingreso = (e: { estado: string; fechaIngreso: string | null }, fechaSalidaLiquidacion: string) =>
  e.estado === 'activo' && !!e.fechaIngreso && e.fechaIngreso > fechaSalidaLiquidacion;
