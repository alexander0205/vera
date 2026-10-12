/**
 * Pago por horas — lógica pura.
 *
 * Las horas de cada semana (de lunes a domingo) se acumulan en orden de fecha:
 * hasta 44 son ordinarias; de 44 a 68, extra con 35 % de aumento; desde 68, extra
 * con 100 % (art. 203 del Código de Trabajo). Las horas nocturnas llevan un
 * recargo de 15 % y las de un día feriado se pagan dobles. Para clasificar bien
 * la primera semana de una corrida hacen falta también las horas de esa semana
 * que caen antes de la corrida: cuentan para el acumulado, pero no se pagan aquí.
 */

import { esFechaYMD, lunesDeLaSemana, sumarDiasYMD, type Rango } from '@/lib/nomina/periodos';
import { DIAS_SEMANA, type HorarioSemanal } from '@/lib/nomina/jornada';

export const HORAS_ORDINARIAS_SEMANA = 44;
export const HORAS_EXTRA_100_DESDE = 68;
export const RECARGO_EXTRA_35 = 0.35;
export const RECARGO_NOCTURNO = 0.15;

export interface RegistroHoras {
  fecha: string;
  horas: number;
  horasNocturnas: number;
  feriado: boolean;
}

export interface ResumenHoras {
  horas: number;
  ordinarias: number;
  extra35: number;
  extra100: number;
  nocturnas: number;
  feriado: number;
  dias: number;
  tarifaHoraCents: number;
  brutoCents: number;
}

/** Horas y bruto del rango, con las extra, el nocturno y el feriado. */
export function clasificarHoras(registros: RegistroHoras[], tarifaHoraCents: number, rango: Rango): ResumenHoras {
  const r: ResumenHoras = {
    horas: 0, ordinarias: 0, extra35: 0, extra100: 0, nocturnas: 0, feriado: 0, dias: 0,
    tarifaHoraCents: Math.max(0, Math.round(tarifaHoraCents)), brutoCents: 0,
  };

  const acumuladoPorSemana = new Map<string, number>();
  const ordenados = [...registros].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const reg of ordenados) {
    const semana = lunesDeLaSemana(reg.fecha);
    const antes = acumuladoPorSemana.get(semana) ?? 0;
    const despues = antes + reg.horas;
    acumuladoPorSemana.set(semana, despues);

    if (reg.fecha < rango.inicio || reg.fecha > rango.fin) continue;
    r.horas += reg.horas;
    r.ordinarias += Math.max(0, Math.min(despues, HORAS_ORDINARIAS_SEMANA) - Math.min(antes, HORAS_ORDINARIAS_SEMANA));
    r.extra35 += Math.max(0, Math.min(despues, HORAS_EXTRA_100_DESDE) - Math.max(antes, HORAS_ORDINARIAS_SEMANA));
    r.extra100 += Math.max(0, despues - Math.max(antes, HORAS_EXTRA_100_DESDE));
    r.nocturnas += Math.min(reg.horasNocturnas, reg.horas);
    if (reg.feriado) r.feriado += reg.horas;
    r.dias += 1;
  }

  const t = r.tarifaHoraCents;
  r.brutoCents = Math.round(
    t * r.ordinarias
    + t * (1 + RECARGO_EXTRA_35) * r.extra35
    + t * 2 * r.extra100
    + t * RECARGO_NOCTURNO * r.nocturnas
    + t * r.feriado,
  );
  return r;
}

/** Horas con hasta dos decimales, sin ceros de más: 44, 7.5. */
const numeroHoras = (x: number) => String(Math.round(x * 100) / 100);

/**
 * El desglose de las horas en palabras, para la corrida y el volante. Las
 * ordinarias solo se nombran si hay extra: «40 h» ya dice que todas lo son.
 */
export function partesDeHoras(h: ResumenHoras): string[] {
  const hayExtra = h.extra35 > 0 || h.extra100 > 0;
  return [
    hayExtra ? `${numeroHoras(h.ordinarias)} ordinarias` : null,
    h.extra35 > 0 ? `${numeroHoras(h.extra35)} extra al 35 %` : null,
    h.extra100 > 0 ? `${numeroHoras(h.extra100)} extra al 100 %` : null,
    h.nocturnas > 0 ? `${numeroHoras(h.nocturnas)} nocturnas (+15 %)` : null,
    h.feriado > 0 ? `${numeroHoras(h.feriado)} en feriado (dobles)` : null,
  ].filter((x): x is string => x !== null);
}

/** Total de horas del resumen, para enseñarlo: «44». */
export const totalHorasTexto = (h: ResumenHoras) => numeroHoras(h.horas);

/**
 * Lo que ganaría en una semana de su horario, con el MISMO clasificador de la
 * corrida (las de más de 44 salen como extra). Sirve para estimar antes de que
 * haya horas registradas; la corrida paga las aprobadas.
 */
export function semanaDeHorario(horario: HorarioSemanal, tarifaHoraCents: number): ResumenHoras {
  const lunes = '2026-01-05';
  const registros = DIAS_SEMANA
    .map((d, i) => ({ fecha: sumarDiasYMD(lunes, i), horas: horario[d] ?? 0, horasNocturnas: 0, feriado: false }))
    .filter((r) => r.horas > 0);
  return clasificarHoras(registros, tarifaHoraCents, { inicio: lunes, fin: sumarDiasYMD(lunes, 6) });
}

/** Desde qué día hay que leer horas para clasificar bien un rango: el lunes de su primera semana. */
export const inicioLecturaHoras = (rango: Rango) => lunesDeLaSemana(rango.inicio);
/** Hasta qué día hay que leer: el propio fin (lo de después no afecta al acumulado). */
export const finLecturaHoras = (rango: Rango) => rango.fin;

/** Cuántos días atrás puede el empleado registrar horas desde su enlace. */
export const DIAS_ATRAS_EMPLEADO = 45;

export type DatosRegistroHoras = RegistroHoras & { nota: string | null };

/**
 * Valida un registro de horas. El empleado solo puede cargar de hoy hacia atrás
 * y hasta 45 días; la empresa, cualquier fecha pasada.
 */
export function validarRegistroHoras(
  body: Record<string, unknown>,
  hoy: string,
  origen: 'empleado' | 'empresa',
): { ok: true; datos: DatosRegistroHoras } | { ok: false; error: string } {
  if (!esFechaYMD(body.fecha)) return { ok: false, error: 'Elige la fecha' };
  if (body.fecha > hoy) return { ok: false, error: 'No se pueden registrar horas de días que no han pasado' };
  if (origen === 'empleado' && body.fecha < sumarDiasYMD(hoy, -DIAS_ATRAS_EMPLEADO)) {
    return { ok: false, error: `Solo se pueden registrar horas de los últimos ${DIAS_ATRAS_EMPLEADO} días` };
  }
  const horas = Number(String(body.horas ?? '').replace(',', '.'));
  if (!Number.isFinite(horas) || horas <= 0 || horas > 24 || !Number.isInteger(horas * 2)) {
    return { ok: false, error: 'Las horas van de 0.5 a 24, en medias horas' };
  }
  const nocturnasTexto = String(body.horasNocturnas ?? '').trim();
  const nocturnas = nocturnasTexto === '' ? 0 : Number(nocturnasTexto.replace(',', '.'));
  if (!Number.isFinite(nocturnas) || nocturnas < 0 || nocturnas > horas || !Number.isInteger(nocturnas * 2)) {
    return { ok: false, error: 'Las horas nocturnas no pueden pasar de las horas del día' };
  }
  const nota = String(body.nota ?? '').trim().slice(0, 300) || null;
  return { ok: true, datos: { fecha: body.fecha, horas, horasNocturnas: nocturnas, feriado: body.feriado === true, nota } };
}
