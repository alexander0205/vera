/**
 * GET /api/habilitacion/simulacion/runs/[runId]
 * Estado del run de simulación con auto-refresh DGII por trackId.
 *
 * Versión team-scoped de app/api/admin/empresas/[id]/simulacion/runs/[runId].
 * Ya viene acotada por diseño: `cp` es el contribuyente del team propio,
 * y ecf-api resuelve el run bajo ese cp.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';
import { simulacion, EcfApiError } from '@/lib/ecf-api/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  // Habilitación e-CF toca el ambiente fiscal de la empresa: mismo permiso
  // con el que el nav ya gatea la pantalla. Sin esto, cualquier miembro con
  // sesión podía arrancarla por API aunque no viera el enlace.
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const { runId } = await params;

  try {
    const cp = await ensureContribuyente(teamId);
    const result = await simulacion.getRun(cp, runId) as unknown as { total?: number; byEstado?: Record<string, number> };
    console.log(`[simulacion] poll ${runId}: total=${result.total ?? '?'} byEstado=${JSON.stringify(result.byEstado ?? {})}`);
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
    console.error('[habilitacion/simulacion/runs GET] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
