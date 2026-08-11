/**
 * POST /api/habilitacion/set-pruebas/alertar-error
 *
 * El frontend avisa que una corrida del Set de Pruebas terminó con casos
 * rechazados. Body: { runId }.
 *
 * El texto de la alerta se arma AQUÍ, leyendo el estado real de la corrida en
 * ecf-api. Antes venía en el body: cualquier cliente con sesión podía empujar
 * texto arbitrario y sin límite de largo al canal de Slack del equipo y a los
 * correos internos. El cliente ahora solo dice CUÁL corrida falló; qué se
 * escribe lo decide el servidor.
 *
 * El webhook de Slack nunca se expone al browser.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { ownsRun } from '@/lib/habilitacion/ownership';
import { setPruebas, EcfApiError } from '@/lib/ecf-api/client';
import { rateLimitDb } from '@/lib/rate-limit';
import { enviarAlertaSlack } from '@/lib/slack';
import { enviarAlertaEmail } from '@/lib/email';

/** Un run que falla dispara una alerta, no cien. */
const ALERTAS_POR_MINUTO = 5;

export async function POST(request: NextRequest) {
  // Habilitación e-CF toca el ambiente fiscal de la empresa: mismo permiso
  // con el que el nav ya gatea la pantalla.
  const auth = await requirePermission('configuracion:gestionar');
  if (!auth.ok) return auth.response;
  const teamId = auth.teamId;

  const rl = await rateLimitDb(`habilitacion-alerta:${teamId}`, ALERTAS_POR_MINUTO, 60_000);
  if (!rl.allowed) {
    // El aviso es best-effort: si se pasa del techo, se descarta en silencio en
    // vez de romperle el wizard a quien está habilitando.
    return NextResponse.json({ ok: true, omitida: 'limite' });
  }

  const body  = await request.json().catch(() => ({}));
  const runId = typeof body.runId === 'string' ? body.runId.trim() : '';
  if (!runId || runId.length > 100) {
    return NextResponse.json({ error: 'runId inválido' }, { status: 400 });
  }

  // La corrida tiene que ser de esta empresa: si no, se podría usar el endpoint
  // para sondear qué runIds existen.
  if (!(await ownsRun(teamId, runId))) {
    return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });
  }

  let resumen: string;
  try {
    const s = await setPruebas.getRun(runId);
    resumen = `estado=${s.status ?? '?'} · total=${s.total ?? '?'} · ok=${s.ok ?? '?'} · fallidos=${s.failed ?? '?'}`;
  } catch (err) {
    if (err instanceof EcfApiError) {
      resumen = `no se pudo leer el estado (${err.status})`;
    } else {
      console.error('[habilitacion/alertar-error] getRun', err);
      resumen = 'no se pudo leer el estado';
    }
  }

  const mensaje = `⚠️ Set de Pruebas con errores — empresa ${teamId}, corrida ${runId}\n${resumen}`;

  // Slack y email son independientes — si uno falla, el otro igual se intenta.
  await Promise.allSettled([
    enviarAlertaSlack(mensaje),
    enviarAlertaEmail('⚠️ Set de Pruebas con errores — Habilitación e-CF', mensaje),
  ]);

  return NextResponse.json({ ok: true });
}
