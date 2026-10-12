/**
 * La suscripción de una empresa, leída de la base.
 *
 * Memoizado con React.cache: el banner del shell, el guard de una ruta y la
 * pantalla de plan preguntan lo mismo dentro del mismo request y se hace UNA
 * consulta. Sin esto, cada guard pagaría su propio SELECT.
 */

import 'server-only';
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { evaluarSuscripcion, type Suscripcion } from '@/lib/suscripcion/estado';

/** Qué le toca a esta empresa hoy. Team inexistente → tratado como sin plan. */
export const getSuscripcion = cache(async (teamId: number): Promise<Suscripcion> => {
  const [row] = await db
    .select({
      planName:           teams.planName,
      subscriptionStatus: teams.subscriptionStatus,
      trialEnd:           teams.trialEnd,
      periodoFin:         teams.periodoFin,
      morosoDesde:        teams.morosoDesde,
      cancelarAlFin:      teams.cancelarAlFin,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  return evaluarSuscripcion({
    planName:           row?.planName ?? null,
    subscriptionStatus: row?.subscriptionStatus ?? null,
    trialEnd:           row?.trialEnd ?? null,
    periodoFin:         row?.periodoFin ?? null,
    morosoDesde:        row?.morosoDesde ?? null,
    cancelarAlFin:      row?.cancelarAlFin ?? false,
  });
});

/** ¿Esta empresa puede crear cosas ahora mismo? */
export async function puedeEscribir(teamId: number): Promise<boolean> {
  return (await getSuscripcion(teamId)).puedeEscribir;
}
