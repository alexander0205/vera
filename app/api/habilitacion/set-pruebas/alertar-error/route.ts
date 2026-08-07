/**
 * POST /api/habilitacion/set-pruebas/alertar-error
 *
 * El frontend llama esto cuando el Set de Pruebas termina con casos
 * rechazados/error. Envía la alerta a Slack server-side (el webhook nunca
 * se expone al browser). Body: { runId, teamId?, detalle }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { enviarAlertaSlack } from '@/lib/slack';

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const runId = typeof body.runId === 'string' ? body.runId : 'desconocido';
  const detalle = typeof body.detalle === 'string' ? body.detalle : 'sin detalle';

  await enviarAlertaSlack(
    `⚠️ Set de Pruebas con errores — team ${teamId}, corrida ${runId}\n${detalle}`,
  );

  return NextResponse.json({ ok: true });
}
