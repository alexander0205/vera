/**
 * El corte de los procesos que corren SOLOS.
 *
 * Esconderle el menú a quien canceló no es cancelar. Tres cosas siguen
 * ocurriendo por su cuenta después de que el cliente se va:
 *
 *   · las facturas recurrentes se emiten cada mes,
 *   · los avisos de cobro salen por WhatsApp y SMS —y nos los facturan—,
 *   · el portal de las familias sigue abierto recibiendo documentos.
 *
 * Las dos primeras cuestan dinero nuestro. La tercera es peor que el dinero:
 * son mensajes y trámites a nombre de una empresa que ya no es cliente.
 *
 * Se resuelve PREGUNTANDO, no apagándoles la configuración. Poner
 * `avisosActivos = false` en sus conceptos cortaría los envíos, sí, y el día
 * que vuelvan habría que acordarse de restaurar exactamente lo que cada uno
 * tenía. Aquí no se toca nada suyo: el proceso mira si la suscripción está
 * viva antes de correr, y al reactivar todo vuelve solo.
 */

import 'server-only';
import { cache } from 'react';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { evaluarSuscripcion } from '@/lib/suscripcion/estado';
import { AL_CANCELAR } from '@/lib/config/suscripcion';

/**
 * De una lista de empresas, cuáles pueden seguir consumiendo procesos
 * automáticos. Una sola consulta para toda la tanda del cron: preguntar
 * empresa por empresa dentro del bucle serían decenas de viajes a la base
 * antes de mandar el primer mensaje.
 */
export async function equiposConProcesosVivos(
  teamIds: number[],
  ahora = new Date(),
): Promise<Set<number>> {
  if (teamIds.length === 0) return new Set();

  const filas = await db
    .select({
      id:                 teams.id,
      planName:           teams.planName,
      subscriptionStatus: teams.subscriptionStatus,
      trialEnd:           teams.trialEnd,
      periodoFin:         teams.periodoFin,
      morosoDesde:        teams.morosoDesde,
      cancelarAlFin:      teams.cancelarAlFin,
    })
    .from(teams)
    .where(inArray(teams.id, [...new Set(teamIds)]));

  const vivos = new Set<number>();
  for (const t of filas) {
    if (evaluarSuscripcion(t, ahora).puedeEscribir) vivos.add(t.id);
  }
  return vivos;
}

/**
 * ¿Le corren los procesos automáticos a esta empresa?
 *
 * Para el caso de una sola. Memoizado por request: el portal de padres lo
 * pregunta una vez por carga y no debe pagar una consulta por cada documento
 * que la familia mire.
 */
export const procesosVivos = cache(async (teamId: number): Promise<boolean> => {
  const vivos = await equiposConProcesosVivos([teamId]);
  return vivos.has(teamId);
});

/**
 * ¿Sigue abierto el portal de las familias de este colegio?
 *
 * Separado de `procesosVivos` aunque hoy respondan igual: son dos decisiones
 * distintas del negocio y la perilla las separa. Un colegio en solo-lectura
 * quizá deba seguir recibiendo el acta de nacimiento que una madre ya empezó
 * a subir, aunque no pueda emitir facturas.
 */
export async function portalFamiliasAbierto(teamId: number): Promise<boolean> {
  if (!AL_CANCELAR.cerrarPortalPadres) return true;
  return procesosVivos(teamId);
}
