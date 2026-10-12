/**
 * GET /api/suscripcion/estado — en qué punto está la suscripción de la empresa.
 *
 * Lo consume el banner del shell. Es una sola lectura de `teams` sin llamar a
 * Stripe: las fechas del ciclo de vida se guardan en el webhook justo para
 * esto (ver migración 0133).
 */

import { NextResponse } from 'next/server';
import { getTeamIdForUser } from '@/lib/db/queries';
import { getSuscripcion } from '@/lib/suscripcion/queries';
import { estadoDelTramo } from '@/lib/suscripcion/tramo';

export async function GET() {
  const teamId = await getTeamIdForUser();

  // Sin empresa activa no hay nada que avisar: quien está eligiendo empresa o
  // acaba de entrar no debe ver un banner de cobro.
  if (!teamId) {
    return NextResponse.json({ estado: 'sin-billing', avisar: false, mensaje: null });
  }

  const [sus, tramo] = await Promise.all([
    getSuscripcion(teamId),
    // Devuelve null salvo que sea un colegio con tramo: así ninguna otra
    // empresa paga un COUNT sobre la tabla de estudiantes en cada carga.
    estadoDelTramo(teamId),
  ]);

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
