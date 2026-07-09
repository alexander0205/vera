/**
 * POST /api/admin/empresas/[id]/set-pruebas/runs/[runId]/emitir-todos
 *   → re-emite (sincrónico) todos los casos de una corrida existente SIN
 *     borrarla ni re-subir el Excel. Alternativa al borrar+reintentar cuando
 *     el Excel ya fue importado: reusa la corrida y vuelve a emitir sus casos.
 *
 * El [id] del path se usa solo para auth admin. La corrida se identifica por runId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { setPruebas, EcfApiError } from '@/lib/ecf-api/client';

async function requireAdmin() {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  if (user.platformRole !== 'admin') {
    return { error: NextResponse.json({ error: 'Acceso restringido a administradores' }, { status: 403 }) };
  }
  return { user };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { runId } = await params;

  try {
    const status = await setPruebas.emitirTodos(runId);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof EcfApiError) {
      console.error('[admin/set-pruebas/emitir-todos POST]', err.status, err.humanMessage);
      return NextResponse.json(
        { error: err.humanMessage || 'Error al re-emitir la corrida', code: err.code },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    console.error('[admin/set-pruebas/emitir-todos POST] unexpected', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
