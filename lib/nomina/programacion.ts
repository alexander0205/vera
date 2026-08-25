/**
 * programacion.ts — lógica pura de la programación automática de nómina.
 *
 * Dada la config de una empresa y una fecha, decide QUÉ corridas nacen hoy. Sin
 * BD a propósito: la ruta cron lee la config y llama a esto, y así la decisión
 * de "hoy toca pagar" se prueba sola, sin reloj ni base.
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
}

/** Una corrida que debe nacer hoy. */
export interface CorridaProgramada {
  /** tipo de corrida: 'mensual' | 'quincenal-1' | 'quincenal-2'. */
  tipo: string;
  /** Período contable 'YYYY-MM'. */
  periodo: string;
  /** Descripción legible para la corrida. */
  descripcion: string;
  /** frecuencia_pago del empleado que entra en esta corrida. */
  frecuenciaEmpleado: 'mensual' | 'quincenal';
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
 * Las corridas que deben crearse en `fechaYMD` según la config. Vacío si la
 * programación está apagada o si hoy no cae ningún día de pago.
 */
export function corridasDelDia(cfg: ConfigProgramacion, fechaYMD: string): CorridaProgramada[] {
  if (!cfg.activa) return [];
  const [y, m] = fechaYMD.split('-').map(Number);
  if (!y || !m) return [];
  const periodo = `${y}-${String(m).padStart(2, '0')}`;
  const mesNombre = MESES[m - 1] ?? '';
  const out: CorridaProgramada[] = [];

  if (cfg.mensualActiva && esDiaDePago(fechaYMD, cfg.mensualDia)) {
    out.push({
      tipo: 'mensual',
      periodo,
      descripcion: `Nómina mensual · ${cap(mesNombre)} ${y}`,
      frecuenciaEmpleado: 'mensual',
    });
  }

  if (cfg.quincenalActiva) {
    if (esDiaDePago(fechaYMD, cfg.quincenalDia1)) {
      out.push({
        tipo: 'quincenal-1',
        periodo,
        descripcion: `Nómina 1ra quincena · ${cap(mesNombre)} ${y}`,
        frecuenciaEmpleado: 'quincenal',
      });
    }
    // Si ambos días coinciden (config rara), no dupliques la 2da sobre la 1ra.
    if (cfg.quincenalDia2 !== cfg.quincenalDia1 && esDiaDePago(fechaYMD, cfg.quincenalDia2)) {
      out.push({
        tipo: 'quincenal-2',
        periodo,
        descripcion: `Nómina 2da quincena · ${cap(mesNombre)} ${y}`,
        frecuenciaEmpleado: 'quincenal',
      });
    }
  }

  return out;
}
