/**
 * Refresca el estado de los e-CF que siguen «En proceso».
 *
 * Nada en Zero preguntaba por el veredicto de la DGII salvo el botón
 * «Consultar»: una nota de débito/crédito (E33/E34) o cualquier e-CF con
 * trackId podía quedarse «En proceso» para siempre aunque la DGII ya lo
 * hubiera aceptado. Cada corrida revisa los más antiguos, de a uno, con un
 * tope de tiempo; lo que falte sale en la siguiente.
 *
 * Solo de día (vercel.json: cada 30 min, 7:00 a 19:30 hora de RD, UTC-4): no
 * hay poller nocturno para que Neon pueda dormir. Además cada pantalla que
 * muestra un «En proceso» lo consulta sola (lib/ecf-api/auto-consulta.ts).
 *
 * Protegido con el mismo patrón que los demás: Authorization: Bearer ${CRON_SECRET}
 */
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, isNotNull, lt, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { emision } from '@/lib/ecf-api/client';
import { ESTADO_PENDIENTE_DGII, estadoZeroDesdeEcfApi } from '@/lib/ecf-api/estado-dgii';
import { llamadaDeCronValida } from '@/lib/seguridad/cron';

export const maxDuration = 120;

const PRESUPUESTO_MS = 90_000;
const MAX_POR_CORRIDA = 40;
/** Da tiempo a que la DGII procese antes del primer intento. */
const ESPERA_MINIMA_MS = 60_000;

export async function GET(req: NextRequest) {
  if (!llamadaDeCronValida(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const limite = Date.now() + PRESUPUESTO_MS;
  const pendientes = await db
    .select({
      id: ecfDocuments.id,
      estado: ecfDocuments.estado,
      ecfApiEmisionId: ecfDocuments.ecfApiEmisionId,
    })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.estado, ESTADO_PENDIENTE_DGII),
      isNotNull(ecfDocuments.ecfApiEmisionId),
      ne(ecfDocuments.trackId, ''),
      lt(ecfDocuments.updatedAt, new Date(Date.now() - ESPERA_MINIMA_MS)),
    ))
    .orderBy(asc(ecfDocuments.updatedAt))
    .limit(MAX_POR_CORRIDA);

  let revisados = 0, actualizados = 0, fallidos = 0;
  for (const p of pendientes) {
    if (Date.now() > limite) break;
    revisados++;
    try {
      const r = await emision.consultarEstado(p.ecfApiEmisionId!);
      const nuevo = estadoZeroDesdeEcfApi(r.estado, p.estado);
      // Siempre se toca updatedAt: los que siguen en proceso pasan al final de la fila.
      await db
        .update(ecfDocuments)
        .set({
          estado: nuevo,
          ...(nuevo !== p.estado ? { mensajesDgii: r.mensajesDgii ? JSON.stringify(r.mensajesDgii) : null } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(ecfDocuments.id, p.id), eq(ecfDocuments.estado, p.estado)));
      if (nuevo !== p.estado) actualizados++;
    } catch (e) {
      fallidos++;
      console.error('[cron.ecf-estados] doc', p.id, e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ revisados, actualizados, fallidos });
}
