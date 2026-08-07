/**
 * POST /api/habilitacion/set-pruebas/runs/[runId]/emitir-todos
 *   → re-emite (sincrónico) todos los casos de una corrida existente SIN
 *     borrarla ni re-subir el Excel.
 *
 * Versión team-scoped de .../admin/empresas/[id]/set-pruebas/runs/[runId]/emitir-todos.
 * Ownership de runId verificado — ver lib/habilitacion/ownership.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { setPruebas, EcfApiError } from '@/lib/ecf-api/client';
import { ownsRun } from '@/lib/habilitacion/ownership';

export async function POST(
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
    const status = await setPruebas.emitirTodos(runId);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof EcfApiError) {
      console.error('[habilitacion/set-pruebas/emitir-todos POST]', err.status, err.humanMessage);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al re-emitir la corrida', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[habilitacion/set-pruebas/emitir-todos POST] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
