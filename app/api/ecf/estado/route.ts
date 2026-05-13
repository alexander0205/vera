/**
 * GET /api/ecf/estado?docId=yyy
 *
 * Consulta el estado actual de un e-CF directamente en ecf-api
 * (que a su vez consulta la DGII). Actualiza el documento en BD si cambió.
 *
 * Reemplaza la auth local DGII (cert P12 + token) por delegación a ecf-api,
 * que es donde vive el certificado del contribuyente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments, teams } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
import { emision, EcfApiError } from '@/lib/ecf-api/client';

// ecf-api estado → emitedo estado
const MAPA_ESTADOS: Record<string, string> = {
  ACEPTADO:             'ACEPTADO',
  ACEPTADO_CONDICIONAL: 'ACEPTADO_CONDICIONAL',
  ENVIADO:              'EN_PROCESO',
  PENDIENTE:            'EN_PROCESO',
  RECHAZADO:            'RECHAZADO',
  ERROR:                'RECHAZADO',
};

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const docIdStr = new URL(req.url).searchParams.get('docId');
  const docId = docIdStr ? parseInt(docIdStr) : NaN;
  if (isNaN(docId)) return NextResponse.json({ error: 'docId inválido' }, { status: 400 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  // Cargar documento y verificar membership
  const [row] = await db
    .select({ doc: ecfDocuments, team: teams })
    .from(ecfDocuments)
    .innerJoin(teams, eq(teams.id, ecfDocuments.teamId))
    .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

  const { doc } = row;
  if (!doc.ecfApiEmisionId) {
    return NextResponse.json(
      { error: 'Documento sin ID de ecf-api (probable borrador)' },
      { status: 422 },
    );
  }

  // Consultar estado via ecf-api (delega a DGII)
  let resultado;
  try {
    resultado = await emision.consultarEstado(doc.ecfApiEmisionId);
  } catch (err) {
    if (err instanceof EcfApiError) {
      console.error('[ecf/estado] ecf-api error:', err.status, err.message);
      return NextResponse.json(
        { error: `ecf-api: ${err.message.slice(0, 200)}` },
        { status: 502 },
      );
    }
    console.error('[ecf/estado] error:', err);
    return NextResponse.json({ error: 'No se pudo consultar el estado.' }, { status: 502 });
  }

  const estadoUpper = String(resultado.estado ?? '').toUpperCase();
  const estadoNuevo = MAPA_ESTADOS[estadoUpper] ?? doc.estado;

  // Actualizar BD si el estado cambió
  if (estadoNuevo !== doc.estado || resultado.mensajesDgii) {
    await db
      .update(ecfDocuments)
      .set({
        estado:       estadoNuevo,
        mensajesDgii: resultado.mensajesDgii ? JSON.stringify(resultado.mensajesDgii) : null,
        updatedAt:    new Date(),
      })
      .where(eq(ecfDocuments.id, docId));
  }

  return NextResponse.json({
    ok:             true,
    docId,
    trackId:        doc.trackId,
    estadoAnterior: doc.estado,
    estadoActual:   estadoNuevo,
    actualizado:    estadoNuevo !== doc.estado,
    mensajes:       resultado.mensajesDgii ?? null,
  });
}
