/**
 * POST /api/habilitacion/simulacion/start
 *
 * Paso 4: inicia un run de Pruebas de Simulación (29 e-CF sintéticos) para el
 * contribuyente del team del usuario autenticado. Síncrono. Body: { ncfStart?, runTag?, dryRun? }.
 * El ambiente lo decide ecf-api según el contribuyente (no se envía).
 *
 * Versión team-scoped de app/api/admin/empresas/[id]/simulacion/start —
 * misma lógica, auth por getTeamIdForUser() en vez de platformRole==='admin'.
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
  const ncfStart = typeof body.ncfStart === 'number' ? body.ncfStart : undefined;
  const dryRun   = body.dryRun === true;
  const runTag   = typeof body.runTag === 'string' ? body.runTag : undefined;

  try {
    const cp = await ensureContribuyente(teamId);
    console.log(`[simulacion] team ${teamId} iniciando (ncfStart=${ncfStart ?? 'default'})`);
    const result = await simulacion.start(cp, { ncfStart, dryRun, runTag });
    console.log(`[simulacion] team ${teamId} corrida iniciada: importId=${result.importId} status=${result.status}`);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ContribuyenteCamposFaltantesError) {
      return NextResponse.json(
        { error: 'Completa el perfil de la empresa antes de correr la simulación.', camposFaltantes: err.faltantes },
        { status: 422 },
      );
    }
    if (err instanceof EcfApiError) {
      console.error('[habilitacion/simulacion/start POST]', err.status, err.humanMessage);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al iniciar la simulación', code: err.code },
        { status: err.status === 404 || err.status === 422 ? err.status : 502 },
      );
    }
    console.error('[habilitacion/simulacion/start POST] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
