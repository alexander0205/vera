/**
 * GET /api/ecf/xml?id={documentoId}
 *
 * Descarga el XML firmado (o el original si aún no se firmó) de un e-CF
 * que pertenezca al equipo activo del usuario autenticado.
 *
 * Uso principal: wizard de habilitación → botón "Descargar XML".
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';
import { logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    // 1. Autenticación
    const user = await getUser();
    if (!user) return new NextResponse('No autenticado', { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return new NextResponse('Sin empresa configurada', { status: 403 });

    // 2. Validar parámetro
    const rawId = request.nextUrl.searchParams.get('id');
    const docId = rawId ? parseInt(rawId, 10) : NaN;
    if (!rawId || isNaN(docId)) {
      return new NextResponse('Parámetro "id" inválido', { status: 400 });
    }

    // 3. Buscar documento verificando que pertenece al equipo
    const [doc] = await db
      .select({
        encf:        ecfDocuments.encf,
        tipoEcf:     ecfDocuments.tipoEcf,
        xmlFirmado:  ecfDocuments.xmlFirmado,
        xmlOriginal: ecfDocuments.xmlOriginal,
      })
      .from(ecfDocuments)
      .where(and(eq(ecfDocuments.id, docId), eq(ecfDocuments.teamId, teamId)))
      .limit(1);

    if (!doc) {
      return new NextResponse('Documento no encontrado', { status: 404 });
    }

    const xml = doc.xmlFirmado ?? doc.xmlOriginal ?? '';
    if (!xml) {
      return new NextResponse('Este documento no tiene XML almacenado', { status: 404 });
    }

    // 4. Devolver XML como descarga
    const filename = `${doc.encf ?? `ecf-${docId}`}.xml`;
    return new NextResponse(xml, {
      headers: {
        'Content-Type':        'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    logError({
      source:  '/api/ecf/xml',
      message: msg,
      details: { url: request.url },
    }).catch(() => {});
    return new NextResponse('Error interno del servidor', { status: 500 });
  }
}
