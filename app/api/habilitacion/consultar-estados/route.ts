/**
 * POST /api/habilitacion/consultar-estados
 *
 * Consulta en batch el estado final de los e-CF enviados durante la Fase 1
 * (Set de Pruebas). Se autentica con DGII UNA sola vez y consulta cada trackId
 * contra `GET /consultaresultado/api/ConsultaResultado/TrackId/{trackId}`.
 *
 * El wizard de habilitación llama este endpoint cada ~5 segundos mientras
 * hay trackIds en estado "En Proceso".
 *
 * Body:
 *   { trackIds: string[] }
 *
 * Respuesta:
 *   { results: [{ trackId, estado, codigo, mensajes }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
import { getDgiiAuth as getDgiiToken } from '@/lib/dgii/auth';

// ─── Schema ───────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  // Acepta strings vacíos (RFCE síncronos) — los filtramos abajo antes de consultar DGII
  trackIds: z.array(z.string()).min(1).max(50),
});

// DGII → estado interno (mismo mapeo que /api/ecf/estado)
const MAPA_ESTADOS: Record<string, string> = {
  Aceptado:             'ACEPTADO',
  AceptadoCondicional:  'ACEPTADO_CONDICIONAL',
  Rechazado:            'RECHAZADO',
  EnProceso:            'EN_PROCESO',
  'En Proceso':         'EN_PROCESO',
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'trackIds requerido', detalles: parsed.error.flatten() }, { status: 400 });
  }

  // Filtrar trackIds vacíos — RFCE síncronos no tienen trackId
  const trackIds = parsed.data.trackIds.filter(id => id.length > 0);
  if (trackIds.length === 0) {
    return NextResponse.json({ ok: true, results: [] });
  }

  // Obtener cliente DGII autenticado — reutiliza token de DB o re-autentica y lo guarda
  let client: Awaited<ReturnType<typeof getDgiiToken>>['client'];
  try {
    ({ client } = await getDgiiToken(teamId));
  } catch (authErr) {
    console.error('[consultar-estados] auth error:', authErr);
    return NextResponse.json(
      { error: 'No se pudo autenticar contra la DGII.' },
      { status: 502 },
    );
  }

  // Consultar en lotes de 5 para no saturar la DGII con requests paralelas
  const BATCH_SIZE = 5;
  const results: object[] = [];

  for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
    const lote = trackIds.slice(i, i + BATCH_SIZE);

    const loteResults = await Promise.all(
      lote.map(async (trackId) => {
        try {
          const respuesta     = await client.consultarEstado(trackId);
          const estadoDgii    = respuesta.estado ?? 'En Proceso';
          const estadoInterno = MAPA_ESTADOS[estadoDgii] ?? 'EN_PROCESO';
          const mensajes      = respuesta.mensajes ?? null;

          // Actualizar el documento en BD si el estado cambió
          await db
            .update(ecfDocuments)
            .set({
              estado:       estadoInterno,
              mensajesDgii: mensajes ? JSON.stringify(mensajes) : null,
              updatedAt:    new Date(),
            })
            .where(and(
              eq(ecfDocuments.teamId, teamId),
              eq(ecfDocuments.trackId, trackId),
            ));

          return { trackId, estado: estadoDgii, estadoInterno, mensajes };
        } catch (err) {
          // Error puntual — no romper el batch, reportar el error
          return {
            trackId,
            estado:        'En Proceso',
            estadoInterno: 'EN_PROCESO',
            mensajes:      null,
            error:         err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    results.push(...loteResults);

    // Pequeña pausa entre lotes para respetar rate-limit de la DGII
    if (i + BATCH_SIZE < trackIds.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return NextResponse.json({ ok: true, results });
}
