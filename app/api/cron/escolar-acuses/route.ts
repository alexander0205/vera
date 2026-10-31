/**
 * Pregunta durante el día si los WhatsApp de los últimos días ya se leyeron.
 *
 * El cron de los avisos solo corre por la mañana: quien lee por la tarde se veía
 * como «Entregado». No suelta lo que falló (`soltar: false`): a esa hora ya no
 * hay otra corrida de avisos que lo reintente.
 *
 * Protegido con el mismo patrón que los demás: Authorization: Bearer ${CRON_SECRET}
 */
import { NextRequest, NextResponse } from 'next/server';
import { colegiosConAcusesPendientes, reconciliarEntregas } from '@/lib/administracion-escolar/entregas';
import { llamadaDeCronValida } from '@/lib/seguridad/cron';

export const maxDuration = 300;

/** Lo que se le dedica a una corrida; lo que falte sale en la de la hora siguiente. */
const PRESUPUESTO_MS = 240_000;
/** Entre teléfonos: el CRM corta a 60 peticiones por minuto. */
const PAUSA_MS = 1100;

export async function GET(req: NextRequest) {
  if (!llamadaDeCronValida(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const limite = Date.now() + PRESUPUESTO_MS;
  let revisados = 0, colegios = 0;
  for (const teamId of await colegiosConAcusesPendientes()) {
    if (Date.now() > limite) break;
    try {
      revisados += (await reconciliarEntregas(teamId, { soltar: false, pausaMs: PAUSA_MS })).revisados;
      colegios++;
    } catch (e) {
      console.error('[cron.escolar-acuses] colegio', teamId, e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ colegios, revisados });
}
