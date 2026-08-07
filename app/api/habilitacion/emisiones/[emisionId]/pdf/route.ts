/**
 * GET /api/habilitacion/emisiones/[emisionId]/pdf?runId=...
 *
 * Proxy de descarga del PDF de representación impresa de una emisión del
 * paso 4 (Simulación). Usado en el paso 5 (Representación Impresa).
 *
 * `emisionesGlobal.pdf(emisionId)` NO está acotado por team en ecf-api (ver
 * lib/ecf-api/client.ts) — a diferencia de la versión admin, aquí hace falta
 * verificar dueño antes de proxear el PDF. La cadena de verificación:
 *   teamId → codigoPublico (ensureContribuyente, propio del team)
 *   → runId debe pertenecer a ese codigoPublico (simulacion.getRun(cp, runId))
 *   → emisionId debe aparecer entre los `rows` de ESE run
 * Solo si las 3 se cumplen se proxea el PDF.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';
import { simulacion, emisionesGlobal, EcfApiError } from '@/lib/ecf-api/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ emisionId: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

  const { emisionId } = await params;
  const runId = new URL(request.url).searchParams.get('runId');
  if (!runId) return NextResponse.json({ error: 'Falta runId' }, { status: 400 });

  try {
    const cp = await ensureContribuyente(teamId);
    const run = await simulacion.getRun(cp, runId);
    const pertenece = (run.rows ?? []).some(r => r.emisionId === emisionId);
    if (!pertenece) {
      return NextResponse.json({ error: 'Emisión no encontrada' }, { status: 404 });
    }

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
    if (err instanceof ContribuyenteCamposFaltantesError) {
      return NextResponse.json({ error: 'Empresa sin contribuyente vinculado.' }, { status: 422 });
    }
    if (err instanceof EcfApiError) {
      return NextResponse.json(
        { error: err.humanMessage || 'Error al descargar el PDF', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[habilitacion/emisiones/pdf] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
