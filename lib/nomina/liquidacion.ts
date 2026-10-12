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

import { diasCesantiaGanados, diasVacacionesDeLey, mesesDeServicio } from '@/lib/nomina/provisiones';
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
export function diasVacacionesProporcionales(mesesTotales: number): number {
  if (mesesTotales < 5) return 0;
  if (mesesTotales < 12) return DIAS_VACACIONES_PRIMER_ANIO[mesesTotales] ?? 0;
  const mesesDelPeriodo = mesesTotales % 12;
  const diasAnio = diasVacacionesDeLey(mesesTotales);
  return Math.round(((diasAnio * mesesDelPeriodo) / 12) * 100) / 100;
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
        clave: 'preaviso', nombre: 'Preaviso omitido', dias: dPre, montoCents: redondear(dPre * salarioDiario), cotiza: false,
        detalle: `${dPre} días de salario por ${meses} mes${meses === 1 ? '' : 'es'} de servicio (art. 76)`,
      });
    }
    const dCes = Math.round(diasCesantiaGanados(meses) * 100) / 100;
    if (dCes > 0) {
      componentes.push({
        clave: 'cesantia', nombre: 'Cesantía', dias: dCes, montoCents: redondear(dCes * salarioDiario), cotiza: false,
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
    : diasVacacionesProporcionales(meses);
  if (diasVac > 0) {
    componentes.push({
      clave: 'vacaciones', nombre: 'Vacaciones no disfrutadas', dias: diasVac, montoCents: redondear(diasVac * salarioDiario), cotiza: true,
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
