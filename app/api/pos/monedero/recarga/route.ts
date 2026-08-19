/**
 * POST /api/pos/monedero/recarga — recarga saldo al estudiante.
 * Body { dependienteId, monto, motivo? }. Requiere pos:vender (recepción/cajero).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { recargar, getMonederoView, escolarHabilitado } from '@/lib/pos/monedero';

const schema = z.object({
  dependienteId: z.number().int().positive(),
  monto:         z.number().positive(),   // pesos
  motivo:        z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;
  if (!(await escolarHabilitado(teamId))) return NextResponse.json({ error: 'Capa escolar no habilitada' }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

  try {
    const { saldoCentavos } = await recargar({
      teamId, dependienteId: parsed.data.dependienteId,
      montoCentavos: Math.round(parsed.data.monto * 100),
      createdBy: user.id, motivo: parsed.data.motivo ?? null,
    });
    logAudit({
      teamId, userId: user.id, actor: user.email, action: 'MONEDERO_RECARGA',
      resource: `dependiente:${parsed.data.dependienteId}`, ip: getIp(req),
      meta: { montoCts: Math.round(parsed.data.monto * 100) },
    });
    return NextResponse.json({ ok: true, saldoCentavos, monedero: await getMonederoView(teamId, parsed.data.dependienteId) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al recargar' }, { status: 400 });
  }
}
