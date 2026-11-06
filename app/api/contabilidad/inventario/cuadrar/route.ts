/**
 * POST /api/contabilidad/inventario/cuadrar — asienta la diferencia entre el valor
 * del inventario (existencia × costo promedio) y el saldo de la cuenta 1105.
 *
 * Es POST y exige `contabilidad:gestionar`. El cliente manda la diferencia que
 * vio; si ya cambió, se rechaza (409) en vez de asentar un número no aprobado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { AsientoManualError } from '@/lib/contabilidad/asientos';
import { cuadrarInventario } from '@/lib/contabilidad/inventario-valuacion';
import { getConfig } from '@/lib/contabilidad/config';

export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar');
  if (!auth.ok) return auth.response;

  let body: { diferenciaCents?: unknown; contrapartidaId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }); }

  const diferenciaCents = Number(body.diferenciaCents);
  const contrapartidaId = Number(body.contrapartidaId);
  if (!Number.isSafeInteger(diferenciaCents) || diferenciaCents === 0) {
    return NextResponse.json({ error: 'La diferencia no es válida' }, { status: 400 });
  }
  if (!Number.isSafeInteger(contrapartidaId) || contrapartidaId <= 0) {
    return NextResponse.json({ error: 'Elige la cuenta contra la que se ajusta' }, { status: 400 });
  }
  const cfg = await getConfig(auth.teamId);
  if (!cfg.activa) return NextResponse.json({ error: 'La contabilidad automática está apagada' }, { status: 409 });

  try {
    const r = await cuadrarInventario(auth.teamId, auth.user.id, { diferenciaEsperadaCents: diferenciaCents, contrapartidaId });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof AsientoManualError) {
      // «Ya cuadra» o «cambió» no son errores del cliente: son estado.
      const conflicto = /cambió|ya cuadra/.test(e.message);
      return NextResponse.json({ error: e.message }, { status: conflicto ? 409 : 400 });
    }
    throw e;
  }
}
