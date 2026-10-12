/**
 * Horario semanal del empleado — lógica pura.
 *
 * Código de Trabajo: la jornada no pasa de 8 horas al día ni de 44 a la semana
 * (art. 147); la semana típica es de lunes a viernes 8 horas y el sábado medio
 * día. Lo que pase de 44 son horas extra, con un aumento de al menos 35 % hasta 68
 * horas y de 100 % desde ahí (art. 203). Hay que dar 36 horas seguidas de
 * descanso a la semana (art. 163).
 */

export const DIAS_SEMANA = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];
export type HorarioSemanal = Record<DiaSemana, number>;

export const LABEL_DIA: Record<DiaSemana, string> = {
  lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo',
};

export const JORNADA_MAX_DIA = 8;
export const JORNADA_MAX_SEMANA = 44;
export const HORAS_EXTRA_100 = 68;

/** Lunes a viernes 8 horas y sábado medio día: las 44 de ley. */
export const HORARIO_LUNES_A_SABADO: HorarioSemanal = { lun: 8, mar: 8, mie: 8, jue: 8, vie: 8, sab: 4, dom: 0 };
/** Lunes a viernes 8 horas: 40, sin sábado. */
export const HORARIO_LUNES_A_VIERNES: HorarioSemanal = { lun: 8, mar: 8, mie: 8, jue: 8, vie: 8, sab: 0, dom: 0 };

/** ¿Es un horario válido? Siete días, cada uno de 0 a 24 horas en medias horas. */
export function esHorario(v: unknown): v is HorarioSemanal {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return DIAS_SEMANA.every((d) => {
    const n = o[d];
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 24 && Number.isInteger(n * 2);
  });
}

export const horasSemana = (h: HorarioSemanal) => DIAS_SEMANA.reduce((s, d) => s + h[d], 0);

/** «Domingo», «Sábado y domingo», «Miércoles, sábado y domingo». */
export function diasLibresDe(h: HorarioSemanal): string {
  const libres = DIAS_SEMANA.filter((d) => h[d] === 0).map((d) => LABEL_DIA[d]);
  if (libres.length === 0) return '';
  const texto = libres.length === 1 ? libres[0] : `${libres.slice(0, -1).join(', ')} y ${libres[libres.length - 1].toLowerCase()}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

/** Lo que no cuadra con la jornada de ley, redactado para enseñarlo tal cual. */
export function avisosHorario(h: HorarioSemanal): string[] {
  const avisos: string[] = [];
  const total = horasSemana(h);
  if (total > JORNADA_MAX_SEMANA) {
    const extra = total - JORNADA_MAX_SEMANA;
    avisos.push(
      `Son ${total} horas a la semana: pasan de las 44 de la jornada legal. Las ${extra} de más son horas extra, ` +
      `con al menos 35 % de aumento${total > HORAS_EXTRA_100 ? ' (100 % las que pasan de 68)' : ''}.`,
    );
  }
  for (const d of DIAS_SEMANA) {
    if (h[d] > JORNADA_MAX_DIA) avisos.push(`El ${LABEL_DIA[d].toLowerCase()} tiene ${h[d]} horas: la jornada no pasa de 8 al día.`);
  }
  if (DIAS_SEMANA.every((d) => h[d] > 0)) {
    avisos.push('No tiene ningún día libre: la ley exige 36 horas seguidas de descanso a la semana.');
  }
  return avisos;
}

/**
 * Valor de una hora ordinaria: el salario del mes llevado a semanas (× 12 ÷ 52)
 * entre las horas de la semana. Con 44 horas coincide con el salario diario de
 * 23.83 días entre 8 horas que usa el Ministerio de Trabajo.
 */
export function valorHoraCents(salarioMensualCents: number, h: HorarioSemanal): number {
  const horas = horasSemana(h);
  if (horas <= 0) return 0;
  return Math.round((salarioMensualCents * 12) / 52 / horas);
}
