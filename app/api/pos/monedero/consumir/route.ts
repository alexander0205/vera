/**
 * POST /api/pos/monedero/consumir — descuenta del saldo tras una venta POS.
 * Body { monederoId, monto, ecfDocumentId? }. Valida saldo y límite diario.
 * Requiere pos:vender. Lo llama el POS justo después de emitir la venta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { consumir, escolarHabilitado } from '@/lib/pos/monedero';

const schema = z.object({
  monederoId:    z.number().int().positive(),
  monto:         z.number().positive(),   // pesos
  ecfDocumentId: z.number().int().positive().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission('pos:vender');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;
  if (!(await escolarHabilitado(teamId))) return NextResponse.json({ error: 'Capa escolar no habilitada' }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

  try {
    const { saldoCentavos } = await consumir({
      teamId, monederoId: parsed.data.monederoId,
      montoCentavos: Math.round(parsed.data.monto * 100),
      ecfDocumentId: parsed.data.ecfDocumentId ?? null, createdBy: user.id,
    });
    logAudit({
      teamId, userId: user.id, actor: user.email, action: 'MONEDERO_CONSUMO',
      resource: `monedero:${parsed.data.monederoId}`, ip: getIp(req),
      meta: { montoCts: Math.round(parsed.data.monto * 100), ecfDocumentId: parsed.data.ecfDocumentId ?? null },
    });
    return NextResponse.json({ ok: true, saldoCentavos });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al consumir' }, { status: 400 });
  }
}
