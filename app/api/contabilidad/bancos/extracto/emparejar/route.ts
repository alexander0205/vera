import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { emparejarExtracto, ConciliacionError } from '@/lib/contabilidad/conciliacion';

export const dynamic = 'force-dynamic';

/**
 * POST /api/contabilidad/bancos/extracto/emparejar  { cuentaId }
 * Vuelve a emparejar lo pendiente del estado de cuenta con el libro (por
 * ejemplo después de registrar un pago que faltaba). Solo toca lo pendiente.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as { cuentaId?: unknown } | null;
  const cuentaId = Number(body?.cuentaId);
  if (!Number.isSafeInteger(cuentaId) || cuentaId <= 0) return NextResponse.json({ error: 'Elige una cuenta' }, { status: 400 });
  try {
    return NextResponse.json(await emparejarExtracto(auth.teamId, auth.user.id, cuentaId));
  } catch (e) {
    if (e instanceof ConciliacionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
