import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { CONCILIAR_MAX, conciliar, cuentasBanco, textoLibre } from '@/lib/contabilidad/bancos';

export const dynamic = 'force-dynamic';

/**
 * POST /api/contabilidad/bancos/conciliar — marca (o desmarca) apuntes de una
 * cuenta como vistos en el estado de cuenta del banco.
 *   { cuentaId, lineaIds: number[], conciliada: boolean, referencia? }
 * No cambia el asiento ni el saldo: es una marca aparte.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const cuentaId = typeof body.cuentaId === 'number' ? body.cuentaId : NaN;
  if (!Number.isSafeInteger(cuentaId) || cuentaId <= 0) return NextResponse.json({ error: 'Elige una cuenta' }, { status: 400 });
  if (!Array.isArray(body.lineaIds) || body.lineaIds.length === 0) return NextResponse.json({ error: 'Marca al menos un movimiento' }, { status: 400 });
  if (body.lineaIds.length > CONCILIAR_MAX) return NextResponse.json({ error: `Máximo ${CONCILIAR_MAX} movimientos por vez` }, { status: 400 });
  const ids = body.lineaIds.filter((n): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0);
  if (ids.length !== body.lineaIds.length) return NextResponse.json({ error: 'Los movimientos no son válidos' }, { status: 400 });
  if (typeof body.conciliada !== 'boolean') return NextResponse.json({ error: 'Indica conciliada: true o false' }, { status: 400 });

  if (!(await cuentasBanco(auth.teamId)).some((c) => c.id === cuentaId)) {
    return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
  }

  const r = await conciliar(auth.teamId, auth.user.id, cuentaId, [...new Set(ids)], body.conciliada, textoLibre(body.referencia, 120));
  return NextResponse.json({ ok: true, ...r });
}
