/**
 * GET /api/habilitacion/set-pruebas/runs/[runId]/manual-upload/zip
 *
 * Proxy de descarga: ZIP con SOLO los XMLs <RD$250K para subir manual al
 * portal DGII ("Facturas de consumo < 250Mil"). Stream binario.
 *
 * ecf-api devuelve XML+PDF pese a su nombre — se filtran los .pdf aquí
 * antes de servir el ZIP (el portal DGII solo acepta el XML).
 *
 * Versión team-scoped de .../admin/empresas/[id]/.../manual-upload/zip.
 * Ownership de runId verificado — ver lib/habilitacion/ownership.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { setPruebas, EcfApiError } from '@/lib/ecf-api/client';
import { ownsRun } from '@/lib/habilitacion/ownership';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

  const { runId } = await params;
  if (!(await ownsRun(teamId, runId))) {
    return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });
  }

  try {
    const upstream = await setPruebas.manualUploadZip(runId);
    const buf = Buffer.from(await upstream.arrayBuffer());

    const zip = new AdmZip(buf);
    for (const entry of zip.getEntries()) {
      if (entry.entryName.toLowerCase().endsWith('.pdf')) zip.deleteFile(entry.entryName);
    }
    const filtered = zip.toBuffer();

    return new NextResponse(filtered, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="set-pruebas-${runId}_manual-upload.zip"`,
      },
    });
  } catch (err) {
    if (err instanceof EcfApiError) {
      return NextResponse.json(
        { error: err.humanMessage || 'Error al descargar el ZIP', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[habilitacion/set-pruebas manual-upload/zip] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
