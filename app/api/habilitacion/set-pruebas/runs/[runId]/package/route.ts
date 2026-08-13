/**
 * GET /api/habilitacion/set-pruebas/runs/[runId]/package?pdfOnly=true
 *
 * Proxy de descarga: ZIP completo (xml/ + pdf/ + manifest.json) de todos
 * los casos emitidos vía API. Stream binario. Con `pdfOnly=true` filtra los
 * .xml antes de servir (Paso 5 — Representación Impresa solo necesita PDF).
 *
 * Versión team-scoped de .../admin/empresas/[id]/.../package.
 * Ownership de runId verificado — ver lib/habilitacion/ownership.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import AdmZip from 'adm-zip';
import { setPruebas, EcfApiError } from '@/lib/ecf-api/client';
import { ownsRun } from '@/lib/habilitacion/ownership';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  // Habilitación e-CF toca el ambiente fiscal de la empresa: mismo permiso
  // con el que el nav ya gatea la pantalla. Sin esto, cualquier miembro con
  // sesión podía arrancarla por API aunque no viera el enlace.
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const { runId } = await params;
  if (!(await ownsRun(teamId, runId))) {
    return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });
  }

  const pdfOnly = new URL(request.url).searchParams.get('pdfOnly') === 'true';

  try {
    const upstream = await setPruebas.package(runId);
    let buf = Buffer.from(await upstream.arrayBuffer());

    if (pdfOnly) {
      const zip = new AdmZip(buf);
      for (const entry of zip.getEntries()) {
        if (entry.entryName.toLowerCase().endsWith('.xml')) zip.deleteFile(entry.entryName);
      }
      buf = zip.toBuffer();
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="set-pruebas-${runId}_package${pdfOnly ? '_pdf' : ''}.zip"`,
      },
    });
  } catch (err) {
    if (err instanceof EcfApiError) {
      return NextResponse.json(
        { error: err.humanMessage || 'Error al descargar el paquete', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[habilitacion/set-pruebas package] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
