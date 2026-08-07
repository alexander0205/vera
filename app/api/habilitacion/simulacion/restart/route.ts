/**
 * POST /api/habilitacion/simulacion/restart
 * Re-inicia el set de simulación con NCFs auto-bumpeados. Body: { ncfBump? }.
 *
 * Versión team-scoped de app/api/admin/empresas/[id]/simulacion/restart.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';
import { simulacion, EcfApiError } from '@/lib/ecf-api/client';

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const ncfBump = typeof body.ncfBump === 'number' ? body.ncfBump : undefined;

  try {
    const cp = await ensureContribuyente(teamId);
    const result = await simulacion.restart(cp, { ncfBump });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ContribuyenteCamposFaltantesError) {
      return NextResponse.json({ error: 'Empresa sin contribuyente vinculado.' }, { status: 422 });
    }
    if (err instanceof EcfApiError) {
      console.error('[habilitacion/simulacion/restart POST]', err.status, err.humanMessage);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al reiniciar la simulación', code: err.code },
        { status: err.status === 404 || err.status === 422 ? err.status : 502 },
      );
    }
    console.error('[habilitacion/simulacion/restart POST] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
