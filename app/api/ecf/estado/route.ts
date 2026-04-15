/**
 * GET /api/ecf/estado?trackId=xxx&docId=yyy
 * Consulta el estado de un e-CF en la DGII y actualiza el documento en BD.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
import { DgiiClient, type DgiiEnvironment } from '@/lib/dgii/client';

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const trackId = searchParams.get('trackId');
  const docIdStr = searchParams.get('docId');

  if (!trackId || !docIdStr) {
    return NextResponse.json({ error: 'trackId y docId son requeridos' }, { status: 400 });
  }

  const docId = parseInt(docIdStr);
  if (isNaN(docId)) return NextResponse.json({ error: 'docId inválido' }, { status: 400 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  // Cargar documento y equipo juntos
  const [row] = await db
    .select({ doc: ecfDocuments, team: teams })
    .from(ecfDocuments)
    .innerJoin(teams, eq(teams.id, ecfDocuments.teamId))
    .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

  const { doc, team } = row;

  if (!doc.trackId) {
    return NextResponse.json({ error: 'Este documento no tiene trackId de seguimiento' }, { status: 422 });
  }

  // Consultar DGII
  const client = new DgiiClient((team.dgiiEnvironment as DgiiEnvironment) ?? 'TesteCF');

  // Autenticar si el equipo tiene token vigente
  if (team.dgiiToken && team.dgiiTokenExpiresAt && new Date() < team.dgiiTokenExpiresAt) {
    client.setToken(team.dgiiToken, team.dgiiTokenExpiresAt);
  }

  let estadoDgii: string;
  let mensajes: unknown;

  try {
    const respuesta = await client.consultarEstado(doc.trackId);
    estadoDgii = respuesta.estado ?? 'EN_PROCESO';
    mensajes   = respuesta.mensajes ?? null;
  } catch (err) {
    console.error('[ecf/estado] Error consultando DGII:', err);
    return NextResponse.json(
      { error: 'No se pudo consultar la DGII. Intenta más tarde.' },
      { status: 502 }
    );
  }

  // Mapear estado DGII → estado interno
  const MAPA_ESTADOS: Record<string, string> = {
    'Aceptado':             'ACEPTADO',
    'AceptadoCondicional':  'ACEPTADO_CONDICIONAL',
    'Rechazado':            'RECHAZADO',
    'EnProceso':            'EN_PROCESO',
  };

  const estadoNuevo = MAPA_ESTADOS[estadoDgii] ?? doc.estado;

  // Actualizar BD si el estado cambió
  if (estadoNuevo !== doc.estado) {
    await db
      .update(ecfDocuments)
      .set({
        estado:       estadoNuevo,
        mensajesDgii: mensajes ? JSON.stringify(mensajes) : null,
        updatedAt:    new Date(),
      })
      .where(eq(ecfDocuments.id, docId));
  }

  return NextResponse.json({
    ok: true,
    docId,
    trackId: doc.trackId,
    estadoAnterior: doc.estado,
    estadoActual:   estadoNuevo,
    actualizado:    estadoNuevo !== doc.estado,
    mensajes,
  });
}
