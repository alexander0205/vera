/**
 * Nómina → contabilidad (capa con BD). Los asientos se arman en
 * `lib/contabilidad/asientos.ts`; aquí va lo que hace falta alrededor para que
 * se generen en orden y quede apuntado en la nómina.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { nominaCorridas } from '@/lib/db/schema';
import { generarAsientoNomina, type ResultadoGeneracion } from '@/lib/contabilidad/asientos';

/**
 * Deja asentado el devengo de una corrida antes de asentar un pago suyo. Si la
 * corrida se aprobó con la contabilidad apagada, el pago saldaría un pasivo que
 * nunca se abrió. Idempotente: si ya tiene asiento no hace nada.
 */
export async function asegurarDevengoCorrida(
  teamId: number,
  corridaId: number,
  userId: number | null,
): Promise<ResultadoGeneracion> {
  const r = await generarAsientoNomina(teamId, corridaId, userId);
  if (r.creado && r.asientoId) {
    await db
      .update(nominaCorridas)
      .set({ asientoId: r.asientoId })
      .where(and(eq(nominaCorridas.id, corridaId), eq(nominaCorridas.teamId, teamId)));
  }
  return r;
}
