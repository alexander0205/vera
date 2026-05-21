/**
 * GET /api/admin/empresas/[id]/simulacion/runs/[runId]
 * Estado del run de simulación con auto-refresh DGII por trackId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';
import { simulacion, EcfApiError } from '@/lib/ecf-api/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') {
    return NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 });
  }

  const { id, runId } = await params;
  const teamId = parseInt(id, 10);
  if (isNaN(teamId)) return NextResponse.json({ error: 'teamId inválido' }, { status: 400 });

  try {
    const cp = await ensureContribuyente(teamId);
    const result = await simulacion.getRun(cp, runId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ContribuyenteCamposFaltantesError) {
      return NextResponse.json({ error: 'Empresa sin contribuyente vinculado.' }, { status: 422 });
    }
    if (err instanceof EcfApiError) {
      return NextResponse.json(
        { error: err.humanMessage || 'Error al consultar el run', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[admin/simulacion/runs GET] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
