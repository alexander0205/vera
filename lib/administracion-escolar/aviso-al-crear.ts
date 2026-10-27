import { sumarDias } from './calendario';

/**
 * El aviso de «cobro nuevo» de «Cobrar a un grupo»: qué día sale.
 *
 * No sale en la misma petición que crea los cargos. Lo manda el cron de avisos
 * (`app/api/cron/escolar-avisos`), que corre cada cuarto de hora entre las 8:00
 * y las 11:45 de la mañana (hora RD) y ya sabe repartir la tanda, respetar la
 * cuota de WhatsApp y SMS del colegio, reintentar lo que falla y no repetirle
 * nada a nadie. Mandarlo desde la petición era saltarse todo eso: un cobro al
 * colegio entero son cientos de mensajes, y la petición se corta antes.
 *
 * Así que el cargo guarda el DÍA en que sale. Si se cobra por la mañana con
 * tiempo para la última tanda, sale hoy; si no, mañana a las 8:00. Nunca de
 * noche: un SMS de cobro a las 9 p. m. no es un recordatorio, es una molestia.
 */

/** La última tanda del cron sale a las 11:45 RD. Lo que llega después, mañana. */
export const CORTE_AVISO_AL_CREAR = { hora: 11, minuto: 30 } as const;

/** La República Dominicana es UTC−4 todo el año (sin horario de verano). */
const DESFASE_RD_MS = 4 * 60 * 60 * 1000;

/** Lo que se le dice a quien cobró, al terminar: cuándo se enteran las familias. */
export function fraseDelAvisoAlCrear(dia: string, hoy: string): string {
  if (dia === hoy) return 'Las familias reciben el aviso hoy, en la tanda de avisos de la mañana.';
  if (dia === sumarDias(hoy, 1)) return 'Las familias reciben el aviso mañana desde las 8:00 a. m.';
  return `Las familias reciben el aviso el ${dia}.`;
}

/** El día (`YYYY-MM-DD`, hora RD) en que sale el aviso de un cargo creado `ahora`. */
export function diaDelAvisoAlCrear(ahora: Date): string {
  const rd = new Date(ahora.getTime() - DESFASE_RD_MS);
  const hoy = rd.toISOString().slice(0, 10);
  const minutos = rd.getUTCHours() * 60 + rd.getUTCMinutes();
  const corte = CORTE_AVISO_AL_CREAR.hora * 60 + CORTE_AVISO_AL_CREAR.minuto;
  return minutos < corte ? hoy : sumarDias(hoy, 1);
}
