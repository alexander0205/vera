/**
 * GET /api/suscripcion/estado — en qué punto está la suscripción de la empresa.
 *
 * Lo consume el banner del shell. Es una sola lectura de `teams` sin llamar a
 * Stripe: las fechas del ciclo de vida se guardan en el webhook justo para
 * esto (ver migración 0133). Solo en los últimos días de la prueba se pregunta a
 * Stripe, con caché, para no pedirle la tarjeta a quien ya la puso.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { cachearPorTag } from '@/lib/cache/escolar';
import { db } from '@/lib/db/drizzle';
import { getTeamIdForUser } from '@/lib/db/queries';
import { teams } from '@/lib/db/schema';
import { estadoDelMetodoDePago } from '@/lib/payments/stripe';
import { avisoDePruebaSegunMetodo } from '@/lib/suscripcion/estado';
import { getSuscripcion } from '@/lib/suscripcion/queries';
import { estadoDelTramo } from '@/lib/suscripcion/tramo';

/** Lo bastante corto para que el aviso se vaya pronto después de poner la tarjeta. */
const SEGUNDOS_METODO_DE_PAGO = 300;

async function metodoDePagoDe(teamId: number) {
  const [team] = await db
    .select({ cliente: teams.stripeCustomerId, suscripcion: teams.stripeSubscriptionId })
    .from(teams).where(eq(teams.id, teamId)).limit(1);
  // Sin cliente en Stripe no hay tarjeta posible: eso sí se sabe.
  if (!team?.cliente) return 'ninguno' as const;
  return cachearPorTag(
    () => estadoDelMetodoDePago(team.cliente, team.suscripcion),
    ['suscripcion-metodo-de-pago', String(teamId)],
    [`suscripcion-metodo-de-pago-${teamId}`],
    SEGUNDOS_METODO_DE_PAGO,
  )();
}

export async function GET() {
  const teamId = await getTeamIdForUser();

  // Sin empresa activa no hay nada que avisar: quien está eligiendo empresa o
  // acaba de entrar no debe ver un banner de cobro.
  if (!teamId) {
    return NextResponse.json({ estado: 'sin-billing', avisar: false, mensaje: null });
  }

  const [crudo, tramo] = await Promise.all([
    getSuscripcion(teamId),
    // Devuelve null salvo que sea un colegio con tramo: así ninguna otra
    // empresa paga un COUNT sobre la tabla de estudiantes en cada carga.
    estadoDelTramo(teamId),
  ]);

  const sus = crudo.estado === 'prueba-por-vencer'
    ? avisoDePruebaSegunMetodo(crudo, await metodoDePagoDe(teamId))
    : crudo;

  // Si la suscripción ya tiene algo que decir, manda ella: «se te venció la
  // tarjeta» es más urgente que «creciste de tramo», y dos franjas apiladas
  // no las lee nadie.
  if (!sus.avisar && tramo?.avisar) {
    return NextResponse.json({
      ...sus,
      avisar: true,
      mensaje: tramo.mensaje,
      motivo: 'tramo',
    });
  }

  return NextResponse.json({ ...sus, tramo });
}
