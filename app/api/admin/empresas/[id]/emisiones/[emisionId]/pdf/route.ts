/**
 * GET /api/admin/empresas/[id]/emisiones/[emisionId]/pdf
 *
 * Proxy de descarga del PDF de representación impresa de una emisión.
 * Usado en el paso 5 (Representación Impresa) para bajar el PDF por tipo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { emisionesGlobal, EcfApiError } from '@/lib/ecf-api/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; emisionId: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') {
    return NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 });
  }

  const { emisionId } = await params;

  try {
    const upstream = await emisionesGlobal.pdf(emisionId);
    const buf = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="representacion-${emisionId}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof EcfApiError) {
      return NextResponse.json(
        { error: err.humanMessage || 'Error al descargar el PDF', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[admin/emisiones/pdf] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
