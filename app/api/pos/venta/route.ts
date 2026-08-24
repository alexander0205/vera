/**
 * POST /api/pos/venta — cobro POS con monedero del estudiante (saga atómica).
 *
 * Endurece el cobro con saldo: en vez de "emitir y luego descontar" (con riesgo
 * de venta sin cobro si el segundo paso falla), hace:
 *   1) consumir (descuenta saldo, valida saldo y límite) — transaccional.
 *   2) emite la venta reusando /api/ecf/emitir (server-to-server, sesión reenviada).
 *   3) si la venta falla → reversa el consumo (refund). Si la venta entra → enlaza
 *      el movimiento de consumo con la factura.
 *
 * Solo para pagos con método 'cuenta-estudiante'. El resto de cobros del POS van
 * directo a /api/ecf/emitir.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { consumir, reversar, actualizarReferenciaConsumo, escolarHabilitado } from '@/lib/pos/monedero';

interface Body {
  monederoId: number;
  emitPayload: {
    pagos?: { metodo: string; valor: number }[];
    [k: string]: unknown;
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  if (!(await escolarHabilitado(teamId))) {
    return NextResponse.json({ error: 'Capa escolar no habilitada' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.monederoId || !body.emitPayload) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const pagos = body.emitPayload.pagos ?? [];
  const montoMonedero = pagos
    .filter((p) => p.metodo === 'cuenta-estudiante')
    .reduce((s, p) => s + p.valor, 0);
  if (montoMonedero <= 0) {
    return NextResponse.json({ error: 'La venta no usa el monedero' }, { status: 400 });
  }
  const montoCentavos = Math.round(montoMonedero * 100);

  // 1) Descontar el saldo (valida saldo + límite atómicamente).
  let consumo: { saldoCentavos: number; movimientoId: number };
  try {
    consumo = await consumir({ teamId, monederoId: body.monederoId, montoCentavos, createdBy: user.id });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al descontar el saldo' }, { status: 400 });
  }

  // 2) Emitir la venta reusando el motor existente (sesión reenviada).
  // `docId` viaja cuando la emisión falló pero el e-NCF quedó reservado en un
  // borrador: hay que propagarlo para que el reintento reuse ese mismo número.
  let emitJson: { ok?: boolean; documentoId?: number; error?: string; docId?: number; encf?: string };
  let emitOk = false;
  try {
    const emitRes = await fetch(`${req.nextUrl.origin}/api/ecf/emitir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify(body.emitPayload),
    });
    emitJson = await emitRes.json().catch(() => ({}));
    emitOk = emitRes.ok && !!emitJson.ok;
  } catch (e: unknown) {
    emitJson = { error: e instanceof Error ? e.message : 'Error al emitir la venta' };
  }

  // 3a) Falló la venta → reversar el consumo (refund) y reportar.
  if (!emitOk) {
    try {
      await reversar({ teamId, monederoId: body.monederoId, montoCentavos, createdBy: user.id });
    } catch (e) {
      console.error('[pos/venta] reversa falló tras emisión fallida', e);
    }
    return NextResponse.json(
      {
        error: emitJson.error ?? 'No se pudo completar la venta; se revirtió el saldo.',
        // Si el e-NCF quedó reservado en un borrador, propagarlo: el reintento
        // debe reusar ese número en vez de consumir el siguiente.
        ...(typeof emitJson.docId === 'number' ? { docId: emitJson.docId, encf: emitJson.encf } : {}),
      },
      { status: 400 },
    );
  }

  // 3b) Venta OK → enlazar el consumo con la factura.
  if (emitJson.documentoId) {
    await actualizarReferenciaConsumo(teamId, consumo.movimientoId, emitJson.documentoId).catch(() => {});
  }

  logAudit({
    teamId, userId: user.id, actor: user.email, action: 'MONEDERO_CONSUMO',
    resource: `monedero:${body.monederoId}`, ip: getIp(req),
    meta: { montoCts: montoCentavos, ecfDocumentId: emitJson.documentoId ?? null, via: 'venta-saga' },
  });

  return NextResponse.json({ ok: true, documentoId: emitJson.documentoId, saldoCentavos: consumo.saldoCentavos });
}
