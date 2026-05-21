/**
 * GET /api/admin/empresas/[id]/set-pruebas/runs/[runId]/package
 *
 * Proxy de descarga: ZIP completo (xml/ + pdf/ + manifest.json) de todos
 * los casos emitidos vía API. Stream binario.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { setPruebas, EcfApiError } from '@/lib/ecf-api/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') {
    return NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 });
  }

  const { runId } = await params;

  try {
    const upstream = await setPruebas.package(runId);
    const buf = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="set-pruebas-${runId}_package.zip"`,
      },
    });
  } catch (err) {
    if (err instanceof EcfApiError) {
      return NextResponse.json(
        { error: err.humanMessage || 'Error al descargar el paquete', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[admin/set-pruebas package] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
