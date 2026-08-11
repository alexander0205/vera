/**
 * GET    /api/habilitacion/set-pruebas/runs/[runId]  → estado + counters + casos
 * DELETE /api/habilitacion/set-pruebas/runs/[runId]  → borrar corrida
 *
 * Versión team-scoped de app/api/admin/empresas/[id]/set-pruebas/runs/[runId].
 * A diferencia de la versión admin, aquí SÍ hace falta verificar dueño del
 * runId (ver lib/habilitacion/ownership.ts) — ecf-api no acota este endpoint
 * por team, y un usuario normal no tiene la confianza global que sí tiene un
 * platform-admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { setPruebas, EcfApiError } from '@/lib/ecf-api/client';
import { ownsRun } from '@/lib/habilitacion/ownership';

async function requireOwnRun(runId: string) {
  // Habilitación e-CF toca el ambiente fiscal de la empresa: mismo permiso con
  // el que el nav ya gatea la pantalla.
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return { error: auth.response };
  const teamId = auth.teamId;

  if (!(await ownsRun(teamId, runId))) {
    return { error: NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 }) };
  }
  return { teamId };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const auth = await requireOwnRun(runId);
  if ('error' in auth) return auth.error;

  try {
    const status = await setPruebas.getRun(runId);
    console.log(`[set-pruebas] poll ${runId}: status=${status.status} total=${status.total ?? '?'} ok=${status.ok ?? '?'} failed=${status.failed ?? '?'}`);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof EcfApiError) {
      console.error('[habilitacion/set-pruebas/runs GET]', err.status, err.humanMessage);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al consultar la corrida', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[habilitacion/set-pruebas/runs GET] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const auth = await requireOwnRun(runId);
  if ('error' in auth) return auth.error;

  const purge = new URL(request.url).searchParams.get('purgeEmisiones') === 'true';

  console.log(`[set-pruebas] DELETE ${runId} purgeEmisiones=${purge}`);

  try {
    const result = await setPruebas.deleteRun(runId, purge);
    console.log(`[set-pruebas] DELETE ${runId} ok:`, JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EcfApiError) {
      console.error(`[habilitacion/set-pruebas/runs DELETE] ${runId} status=${err.status} code=${err.code} humanMessage=${err.humanMessage} raw=${JSON.stringify(err.body ?? err.message)}`);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al borrar la corrida', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[habilitacion/set-pruebas/runs DELETE] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
