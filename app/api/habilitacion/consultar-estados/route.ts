/**
 * POST /api/habilitacion/consultar-estados
 *
 * Consulta en batch el estado de los e-CF emitidos durante la Fase 1.
 * Usa ecf-api en lugar de ir a DGII directamente — no requiere P12 local.
 *
 * Body:  { trackIds: string[] }
 * Respuesta: { results: [{ trackId, estado, estadoInterno, mensajes }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { emision, EcfApiError } from '@/lib/ecf-api/client';

const bodySchema = z.object({
  trackIds: z.array(z.string()).min(1).max(50),
});

const MAPA_ESTADOS: Record<string, string> = {
  ACEPTADO:             'ACEPTADO',
  ACEPTADO_CONDICIONAL: 'ACEPTADO_CONDICIONAL',
  RECHAZADO:            'RECHAZADO',
  EN_PROCESO:           'EN_PROCESO',
  // Compatibilidad con respuestas legadas de DGII via ecf-api
  Aceptado:             'ACEPTADO',
  AceptadoCondicional:  'ACEPTADO_CONDICIONAL',
  Rechazado:            'RECHAZADO',
  'En Proceso':         'EN_PROCESO',
};

export async function POST(req: NextRequest) {
  // Habilitación e-CF toca el ambiente fiscal de la empresa: mismo permiso
  // con el que el nav ya gatea la pantalla, y el mismo que usan el resto de
  // las rutas de habilitación.
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'trackIds requerido' }, { status: 400 });
  }

  // Filtrar vacíos (RFCE síncronos no tienen trackId — ya tienen estado final)
  const trackIds = parsed.data.trackIds.filter(id => id.length > 0);
  if (trackIds.length === 0) {
    return NextResponse.json({ ok: true, results: [] });
  }

  // Buscar los documentos por trackId para obtener el ecfApiEmisionId
  const docs = await db
    .select({ trackId: ecfDocuments.trackId, ecfApiEmisionId: ecfDocuments.ecfApiEmisionId })
    .from(ecfDocuments)
    .where(and(
      eq(ecfDocuments.teamId, teamId),
      inArray(ecfDocuments.trackId, trackIds),
    ));

  const emisionIdByTrackId = Object.fromEntries(
    docs.map(d => [d.trackId!, d.ecfApiEmisionId]),
  );

  const results: object[] = [];

  await Promise.all(
    trackIds.map(async (trackId) => {
      const ecfApiEmisionId = emisionIdByTrackId[trackId];

      if (!ecfApiEmisionId) {
        results.push({ trackId, estado: 'En Proceso', estadoInterno: 'EN_PROCESO', mensajes: null });
        return;
      }

      try {
        const resp = await emision.consultarEstado(ecfApiEmisionId);
        const estadoInterno = MAPA_ESTADOS[resp.estado] ?? 'EN_PROCESO';

        await db
          .update(ecfDocuments)
          .set({ estado: estadoInterno, updatedAt: new Date() })
          .where(and(
            eq(ecfDocuments.teamId, teamId),
            eq(ecfDocuments.trackId, trackId),
          ));

        // Log para depuración — ver qué dice DGII cuando rechaza
        if (estadoInterno === 'RECHAZADO' || estadoInterno === 'ACEPTADO_CONDICIONAL') {
          console.warn(
            `[consultar-estados] DGII ${estadoInterno} | trackId=${trackId}`,
            '\nMensajes:', JSON.stringify(resp.mensajesDgii, null, 2),
          );
        } else {
          console.log(`[consultar-estados] DGII ${estadoInterno} | trackId=${trackId}`);
        }

        results.push({
          trackId,
          estado:        resp.estado,
          estadoInterno,
          mensajes:      resp.mensajesDgii ?? null,
        });
      } catch (err) {
        if (err instanceof EcfApiError && err.status === 400) {
          // ecf-api: emision sin trackId (RFCE síncrono) — ya tiene estado final
          results.push({ trackId, estado: 'Aceptado', estadoInterno: 'ACEPTADO', mensajes: null });
          return;
        }
        results.push({
          trackId,
          estado:        'En Proceso',
          estadoInterno: 'EN_PROCESO',
          mensajes:      null,
          error:         'Error consultando estado',
        });
      }
    }),
  );

  return NextResponse.json({ ok: true, results });
}
