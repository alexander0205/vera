/**
 * programacion.ts — lógica pura de la programación automática de nómina.
 *
 * Dada la config de una empresa y una fecha, decide QUÉ corridas nacen hoy. Sin
 * BD a propósito: la ruta cron lee la config y llama a esto, y así la decisión
 * de "hoy toca pagar" se prueba sola, sin reloj ni base.
 *
 * La corrida NO nace el día de pago, sino unos días antes (anticipacionDias, por
 * defecto 5): así quien administra tiene tiempo de revisarla y aprobarla antes
 * de la fecha. El cron mira si HOY es (día de pago − anticipación); la corrida
 * lleva como fecha de pago la fecha REAL (hoy + anticipación), no la de hoy.
 *
 * El día de pago se guarda 1..31; si el mes es más corto (febrero, meses de 30),
 * un día ≥ fin de mes cae en el ÚLTIMO día del mes. Así "pagar el 30" también
 * paga el 28 de febrero en vez de nunca.
 */

/** Config de programación (subconjunto que necesita la lógica). */
export interface ConfigProgramacion {
  activa: boolean;
  mensualActiva: boolean;
  mensualDia: number;
  quincenalActiva: boolean;
  quincenalDia1: number;
  quincenalDia2: number;
  /** Días de antelación con que nace la corrida. Default 5 si falta o es inválido. */
  anticipacionDias?: number;
}

/** Una corrida que debe nacer hoy. */
export interface CorridaProgramada {
  /** tipo de corrida: 'mensual' | 'quincenal-1' | 'quincenal-2'. */
  tipo: string;
  /** Período contable 'YYYY-MM' (mes de la FECHA DE PAGO). */
  periodo: string;
  /** Descripción legible para la corrida. */
  descripcion: string;
  /** frecuencia_pago del empleado que entra en esta corrida. */
  frecuenciaEmpleado: 'mensual' | 'quincenal';
  /** Fecha de pago REAL 'YYYY-MM-DD' (hoy + anticipación). */
  fechaPago: string;
}

/** Anticipación efectiva: entero ≥ 0, o 5 por defecto. */
function anticipacionEfectiva(cfg: ConfigProgramacion): number {
  const n = cfg.anticipacionDias;
  return Number.isInteger(n) && (n as number) >= 0 ? (n as number) : 5;
}

/**
 * Suma `dias` a una fecha 'YYYY-MM-DD' y devuelve 'YYYY-MM-DD'. En UTC para que
 * no haya corrimientos por zona horaria ni horario de verano.
 */
export function sumarDias(fechaYMD: string, dias: number): string {
  const [y, m, d] = fechaYMD.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Capitaliza la primera letra (para la descripción). */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * ¿La fecha `fechaYMD` ('YYYY-MM-DD') es el día `dia` configurado, teniendo en
 * cuenta el ajuste a fin de mes? Días inválidos (0 o negativos) nunca disparan.
 */
export function esDiaDePago(fechaYMD: string, dia: number): boolean {
  if (!Number.isInteger(dia) || dia < 1) return false;
  const [y, m, d] = fechaYMD.split('-').map(Number);
  if (!y || !m || !d) return false;
  const ultimoDiaMes = new Date(y, m, 0).getDate(); // día 0 del mes siguiente
  const efectivo = Math.min(dia, ultimoDiaMes);
  return d === efectivo;
}

/**
 * Las corridas que deben crearse HOY (`fechaYMD`) según la config. Como la
 * corrida nace con anticipación, se evalúa contra la FECHA OBJETIVO de pago
 * (hoy + anticipación): si esa fecha objetivo es un día de pago, la corrida
 * nace hoy con esa fecha objetivo como fecha de pago. El período contable es el
 * mes de la fecha de pago. Vacío si la programación está apagada o si la fecha
 * objetivo no cae en ningún día de pago.
 */
export function corridasDelDia(cfg: ConfigProgramacion, fechaYMD: string): CorridaProgramada[] {
  if (!cfg.activa) return [];
  const objetivo = sumarDias(fechaYMD, anticipacionEfectiva(cfg));
  const [y, m] = objetivo.split('-').map(Number);
  if (!y || !m) return [];
  const periodo = `${y}-${String(m).padStart(2, '0')}`;
  const mesNombre = MESES[m - 1] ?? '';
  const out: CorridaProgramada[] = [];

  if (cfg.mensualActiva && esDiaDePago(objetivo, cfg.mensualDia)) {
    out.push({
      tipo: 'mensual',
      periodo,
      descripcion: `Nómina mensual · ${cap(mesNombre)} ${y}`,
      frecuenciaEmpleado: 'mensual',
      fechaPago: objetivo,
    });
  }

  if (cfg.quincenalActiva) {
    if (esDiaDePago(objetivo, cfg.quincenalDia1)) {
      out.push({
        tipo: 'quincenal-1',
        periodo,
        descripcion: `Nómina 1ra quincena · ${cap(mesNombre)} ${y}`,
        frecuenciaEmpleado: 'quincenal',
        fechaPago: objetivo,
      });
    }
    // Si ambos días coinciden (config rara), no dupliques la 2da sobre la 1ra.
    if (cfg.quincenalDia2 !== cfg.quincenalDia1 && esDiaDePago(objetivo, cfg.quincenalDia2)) {
      out.push({
        tipo: 'quincenal-2',
        periodo,
        descripcion: `Nómina 2da quincena · ${cap(mesNombre)} ${y}`,
        frecuenciaEmpleado: 'quincenal',
        fechaPago: objetivo,
      });
    }
  }

  return out;
}
