/**
 * GET    /api/admin/empresas/[id]/set-pruebas/runs/[runId]  → estado + counters + casos
 * DELETE /api/admin/empresas/[id]/set-pruebas/runs/[runId]  → borrar corrida
 *
 * El [id] del path se usa solo para auth admin. La corrida se identifica por runId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { setPruebas, EcfApiError } from '@/lib/ecf-api/client';

async function requireAdmin() {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  if (user.platformRole !== 'admin') {
    return { error: NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 }) };
  }
  return { user };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { runId } = await params;

  try {
    const status = await setPruebas.getRun(runId);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof EcfApiError) {
      console.error('[admin/set-pruebas/runs GET]', err.status, err.humanMessage);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al consultar la corrida', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[admin/set-pruebas/runs GET] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { runId } = await params;
  const purge = new URL(request.url).searchParams.get('purgeEmisiones') === 'true';

  try {
    const result = await setPruebas.deleteRun(runId, purge);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EcfApiError) {
      return NextResponse.json(
        { error: err.humanMessage || 'Error al borrar la corrida', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[admin/set-pruebas/runs DELETE] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
