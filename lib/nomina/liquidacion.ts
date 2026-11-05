/**
 * Liquidación de un empleado que sale — funciones puras, sin BD.
 *
 * Lo que se le debe al terminar la relación de trabajo (Código de Trabajo de RD,
 * Ley 16-92), según por qué termina:
 *
 *   · Preaviso (art. 76): 7 días con 3 a 6 meses de servicio, 14 con 6 a 12 meses
 *     y 28 desde el año. Se paga (omitido) cuando la empresa desahucia.
 *   · Cesantía (art. 80): 6 días con 3 a 6 meses, 13 con 6 a 12, 21 por año de 1 a
 *     5 años y 23 por año desde los 5. Solo con desahucio, despido injustificado o
 *     dimisión justificada.
 *   · Vacaciones no disfrutadas (art. 177-180): lo proporcional del año en curso
 *     (6 días a los 5 meses, 12 a los 11; desde el año, 14 días por año —18 desde
 *     los 5 años— en proporción a los meses del período).
 *   · Regalía proporcional del año (art. 219): ver `./regalia`.
 *
 * El sueldo de los días trabajados del último período NO va aquí: lo paga la
 * nómina regular, que ya corta en la fecha de salida.
 *
 * Preaviso y cesantía son indemnizaciones: no cotizan a la TSS ni pagan ISR. Las
 * vacaciones son salario: cotizan y pagan ISR. La regalía sigue su propia regla.
 * El salario diario es el mensual ÷ 23.83, el divisor que usa Trabajo.
 */

import { diasCesantiaLey, diasVacacionesDeLey, mesesDeServicio } from '@/lib/nomina/provisiones';
import { PROVISIONES_DEFAULT } from '@/lib/config/nomina-provisiones';
import type { ResultadoRegalia } from '@/lib/nomina/regalia';

export const MOTIVOS_SALIDA = [
  'desahucio', 'despido_injustificado', 'dimision_justificada',
  'despido_justificado', 'renuncia', 'mutuo_acuerdo',
] as const;
export type MotivoSalida = (typeof MOTIVOS_SALIDA)[number];

export const LABEL_MOTIVO: Record<MotivoSalida, string> = {
  desahucio: 'Desahucio (la empresa termina el contrato)',
  despido_injustificado: 'Despido sin causa justificada',
  dimision_justificada: 'Dimisión justificada (el empleado se va por culpa de la empresa)',
  despido_justificado: 'Despido con causa justificada',
  renuncia: 'Renuncia o abandono (el empleado se va por su decisión)',
  mutuo_acuerdo: 'Mutuo acuerdo',
};

/** Con estos motivos se le debe preaviso y cesantía al empleado. */
export const MOTIVOS_CON_INDEMNIZACION: readonly MotivoSalida[] = ['desahucio', 'despido_injustificado', 'dimision_justificada'];

export const esMotivoSalida = (v: unknown): v is MotivoSalida => (MOTIVOS_SALIDA as readonly unknown[]).includes(v);
export const llevaIndemnizacion = (m: MotivoSalida) => MOTIVOS_CON_INDEMNIZACION.includes(m);

/** Días de preaviso (art. 76) según los meses completos de servicio. */
export function diasPreaviso(meses: number): number {
  if (meses < 3) return 0;
  if (meses < 6) return 7;
  if (meses < 12) return 14;
  return 28;
}

/** Vacaciones proporcionales de quien aún no cumple el año (art. 180): de 5 a 11 meses, 6 a 12 días. */
export const DIAS_VACACIONES_PRIMER_ANIO: Record<number, number> = { 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11, 11: 12 };

/**
 * Días de vacaciones que corresponden por el período en curso: lo que ha
 * trabajado desde el último aniversario (o desde que entró, el primer año).
 */
export function diasVacacionesProporcionales(mesesTotales: number, base = 14, masDe5Anios = 18): number {
  if (mesesTotales < 5) return 0;
  if (mesesTotales < 12) return DIAS_VACACIONES_PRIMER_ANIO[mesesTotales] ?? 0;
  // Después del primer año, la fracción desde el último aniversario sigue la misma escala del art. 180:
  // nada con menos de 5 meses y, de 5 a 11 meses, 6 a 12 días (escala de 14 días al año). Con 18 días al
  // año (más de 5 años) la escala se amplía en proporción.
  const mesesDelPeriodo = mesesTotales % 12;
  const diasAnio = diasVacacionesDeLey(mesesTotales, base, masDe5Anios);
  const dias = DIAS_VACACIONES_PRIMER_ANIO[mesesDelPeriodo] ?? 0;
  return Math.round(((dias * diasAnio) / base) * 100) / 100;
}

export type ClaveComponente = 'preaviso' | 'cesantia' | 'vacaciones' | 'regalia';

export interface ComponenteLiquidacion {
  clave: ClaveComponente;
  nombre: string;
  /** Días de salario que se pagan; null en la regalía (se paga por lo devengado). */
  dias: number | null;
  montoCents: number;
  /** Cotiza a la TSS y entra al ISR como salario (vacaciones). Preaviso y cesantía no. */
  cotiza: boolean;
  detalle: string;
}

export interface EntradaLiquidacion {
  fechaIngreso: string;
  fechaSalida: string;
  motivo: MotivoSalida;
  salarioMensualCents: number;
  /** Días de vacaciones que aún no ha disfrutado; undefined = lo proporcional del período en curso. */
  diasVacacionesPendientes?: number | null;
  /** La regalía proporcional del año de salida (calculada aparte), o null si no aplica. */
  regalia: ResultadoRegalia | null;
  divisorSalarioDiario?: number;
  /** Días de vacaciones al año (de 1 a 5 años) y desde los 5 años; por defecto los de ley (14 y 18). */
  diasVacaciones?: number;
  diasVacacionesMas5Anios?: number;
}

export interface ResultadoLiquidacion {
  mesesServicio: number;
  aniosServicio: number;
  salarioDiarioCents: number;
  componentes: ComponenteLiquidacion[];
  totalCents: number;
  avisos: string[];
}

const redondear = (n: number) => Math.round(n);
/** Días × salario ÷ divisor, redondeando una sola vez al final (no el salario diario primero). */
const montoDias = (dias: number, salarioMensualCents: number, divisor: number) =>
  redondear((dias * Math.max(0, salarioMensualCents)) / divisor);
const pesos = (c: number) => `RD$${(c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function calcularLiquidacion(e: EntradaLiquidacion): ResultadoLiquidacion {
  const divisor = e.divisorSalarioDiario ?? PROVISIONES_DEFAULT.divisorSalarioDiario;
  const meses = mesesDeServicio(e.fechaIngreso, e.fechaSalida);
  const salarioDiario = redondear(Math.max(0, e.salarioMensualCents) / divisor);
  const avisos: string[] = [];
  const componentes: ComponenteLiquidacion[] = [];

  if (llevaIndemnizacion(e.motivo)) {
    const dPre = diasPreaviso(meses);
    if (dPre > 0) {
      componentes.push({
        clave: 'preaviso', nombre: 'Preaviso omitido', dias: dPre, montoCents: montoDias(dPre, e.salarioMensualCents, divisor), cotiza: false,
        detalle: `${dPre} días de salario por ${meses} mes${meses === 1 ? '' : 'es'} de servicio (art. 76)`,
      });
    }
    const dCes = diasCesantiaLey(meses);
    if (dCes > 0) {
      componentes.push({
        clave: 'cesantia', nombre: 'Cesantía', dias: dCes, montoCents: montoDias(dCes, e.salarioMensualCents, divisor), cotiza: false,
        detalle: `${dCes} días de salario por ${meses} mes${meses === 1 ? '' : 'es'} de servicio (art. 80)`,
      });
    }
    if (dPre === 0 && dCes === 0) avisos.push('Con menos de 3 meses de servicio no corresponde preaviso ni cesantía.');
    if (e.motivo === 'despido_injustificado') {
      avisos.push('Un despido sin causa justificada puede generar además la indemnización del art. 95 (salarios hasta la sentencia). No está incluida: consúltalo con tu abogado.');
    }
  } else if (e.motivo === 'renuncia') {
    avisos.push('Si el empleado no dio el preaviso a tiempo, la empresa puede descontarle el preaviso omitido (art. 76): no se aplica solo.');
  }

  const diasVac = e.diasVacacionesPendientes != null && e.diasVacacionesPendientes >= 0
    ? Math.round(e.diasVacacionesPendientes * 100) / 100
    : diasVacacionesProporcionales(meses, e.diasVacaciones, e.diasVacacionesMas5Anios);
  if (e.diasVacacionesPendientes == null && meses >= 12 && meses % 12 === 0) {
    avisos.push(`Cumple ${meses / 12} año${meses === 12 ? '' : 's'} exacto${meses === 12 ? '' : 's'} de servicio y no se indicaron días de vacaciones pendientes: se dieron por 0. Si no ha tomado sus vacaciones de ese período, indica los días que le quedan (14 con menos de 5 años, 18 desde los 5).`);
  }
  if (e.diasVacacionesPendientes == null && meses >= 60 && diasVac > 0) {
    avisos.push('Las vacaciones proporcionales de quien pasa de 5 años se calculan con la escala del art. 180 ampliada en proporción a sus 18 días al año (18/14). Es un criterio más favorable al empleado que la ley, que no lo dice así: confírmalo con tu contable o indica los días pendientes.');
  }
  if (diasVac > 0) {
    componentes.push({
      clave: 'vacaciones', nombre: 'Vacaciones no disfrutadas', dias: diasVac, montoCents: montoDias(diasVac, e.salarioMensualCents, divisor), cotiza: true,
      detalle: e.diasVacacionesPendientes != null
        ? `${diasVac} días pendientes indicados`
        : `${diasVac} días proporcionales al período en curso (art. 180)`,
    });
  }

  if (e.regalia && e.regalia.regaliaCents > 0) {
    componentes.push({
      clave: 'regalia', nombre: `Regalía pascual ${e.fechaSalida.slice(0, 4)} (proporcional)`, dias: null, montoCents: e.regalia.regaliaCents, cotiza: false,
      detalle: `${e.regalia.mesesTrabajados} meses trabajados del año, 1/12 de lo devengado (art. 219)`,
    });
    if (e.regalia.mesesEstimados.length > 0) {
      avisos.push(`${e.regalia.mesesEstimados.length} mes(es) del año sin nómina en Zero se estimaron con el salario de la ficha para la regalía.`);
    }
  }

  if (meses < 3) avisos.push('Tiene menos de 3 meses de servicio.');
  if (e.salarioMensualCents <= 0) avisos.push('El salario es cero: la liquidación sale en cero.');
  avisos.push('El sueldo de los días trabajados del último período lo paga la nómina regular, que ya corta en la fecha de salida.');

  const totalCents = componentes.reduce((s, c) => s + c.montoCents, 0);
  if (totalCents > 0) avisos.push(`Total a liquidar: ${pesos(totalCents)}.`);
  return { mesesServicio: meses, aniosServicio: Math.floor(meses / 12), salarioDiarioCents: salarioDiario, componentes, totalCents, avisos };
}

/**
 * Salario mensual promedio de los últimos 12 meses con nómina aprobada (hasta el mes de la salida
 * inclusive), a partir de lo devengado por mes ('YYYY-MM'). Un mes pagado a medias (una sola quincena, o
 * el mes en que entró) no cuenta como un mes completo: se promedia por la parte del mes que de verdad se
 * pagó (`fraccionPorMes`, 0 a 1; sin dato, 1). Null si no hay ningún mes con nómina: entonces se usa el
 * salario de la ficha. El salario diario de la liquidación sale de aquí.
 */
export function promedioUltimosMeses(
  devengadoPorMes: Readonly<Record<string, number>>,
  fechaSalida: string,
  fraccionPorMes: Readonly<Record<string, number>> = {},
): { promedioCents: number; meses: number } | null {
  const hasta = fechaSalida.slice(0, 7);
  const [a, m] = hasta.split('-').map(Number);
  const desde = new Date(Date.UTC(a, m - 1 - 11, 1)).toISOString().slice(0, 7);
  const validos = Object.entries(devengadoPorMes).filter(([mes, v]) => mes >= desde && mes <= hasta && v > 0);
  if (validos.length === 0) return null;
  const fraccion = (mes: string) => {
    const f = fraccionPorMes[mes];
    return f !== undefined && f > 0 ? Math.min(1, f) : 1;
  };
  const meses = validos.reduce((t, [mes]) => t + fraccion(mes), 0);
  return { promedioCents: Math.round(validos.reduce((t, [, v]) => t + v, 0) / meses), meses: validos.length };
}

/**
 * La regalía proporcional de una liquidación menos lo que el empleado ya cobró (o está por cobrar) de la
 * regalía de ese año en una corrida aprobada: no se paga dos veces.
 */
export function regaliaNetaDeLoPagado<T extends { regaliaCents: number; exentoCents: number; gravadoCents: number }>(regalia: T, yaPagadoCents: number): T {
  const neta = Math.max(0, regalia.regaliaCents - Math.max(0, yaPagadoCents));
  return { ...regalia, regaliaCents: neta, exentoCents: Math.min(regalia.exentoCents, neta), gravadoCents: Math.min(regalia.gravadoCents, neta) };
}

/**
 * Lo que se puede descontar de la liquidación por deudas del empleado: el neto sin la regalía. El art. 222
 * del Código de Trabajo prohíbe compensar la regalía (`isrDeLaRegaliaCents` es el ISR que ella misma lleva).
 */
export function disponibleParaDeudas(netoCents: number, regaliaCents: number, isrDeLaRegaliaCents: number): number {
  return Math.max(0, Math.min(netoCents, netoCents - (regaliaCents - isrDeLaRegaliaCents)));
}

const pesosTxt = (c: number) => `RD$${(c / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Avisos de una liquidación cuando el empleado ya está en una regalía APROBADA (pagada o por pagar) del año:
 *   · lo que ya está en esa regalía se descuenta de la proporcional de la liquidación;
 *   · la regalía aprobada se estimó hasta el 31-dic: si el empleado sale antes, le sobra la diferencia. No se
 *     descuenta sola (el art. 222 lo complica): se avisa el monto exacto para ajustarlo con el contable.
 */
export function avisosRegaliaAprobada(calculadaCents: number, enRegaliaAprobadaCents: number, anio: number): string[] {
  const avisos = [`Ya está en la regalía aprobada de ${anio} (pagada o por pagar) con ${pesosTxt(enRegaliaAprobadaCents)}: se descontó de la regalía proporcional de esta liquidación.`];
  const sobra = enRegaliaAprobadaCents - calculadaCents;
  if (sobra > 0) {
    avisos.push(`La regalía aprobada (${pesosTxt(enRegaliaAprobadaCents)}) cubre todo el año y le corresponden ${pesosTxt(calculadaCents)} hasta su salida: se le paga ${pesosTxt(sobra)} de más. No se descuenta sola (art. 222 del Código de Trabajo): ajústalo con tu contable.`);
  }
  return avisos;
}
