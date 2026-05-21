/**
 * POST /api/admin/empresas/[id]/simulacion/restart
 * Re-inicia el set de simulación con NCFs auto-bumpeados. Body: { ncfBump? }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { ensureContribuyente, ContribuyenteCamposFaltantesError } from '@/lib/ecf-api/contribuyente';
import { simulacion, EcfApiError } from '@/lib/ecf-api/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (user.platformRole !== 'admin') {
    return NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 });
  }

  const { id } = await params;
  const teamId = parseInt(id, 10);
  if (isNaN(teamId)) return NextResponse.json({ error: 'teamId inválido' }, { status: 400 });

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
      console.error('[admin/simulacion/restart POST]', err.status, err.humanMessage);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al reiniciar la simulación', code: err.code },
        { status: err.status === 404 || err.status === 422 ? err.status : 502 },
      );
    }
    console.error('[admin/simulacion/restart POST] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
