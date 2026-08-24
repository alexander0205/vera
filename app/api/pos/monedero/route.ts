/**
 * GET   /api/pos/monedero?dependienteId=N — saldo, límite y gasto del día.
 * PATCH /api/pos/monedero — { dependienteId, limiteDiario } fija/quita el límite (pos:configurar).
 * Requiere capa escolar activa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { getMonederoView, setLimiteDiario, escolarHabilitado } from '@/lib/pos/monedero';

export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  if (!(await escolarHabilitado(teamId))) return NextResponse.json({ error: 'Capa escolar no habilitada' }, { status: 403 });

  const dependienteId = Number(req.nextUrl.searchParams.get('dependienteId'));
  if (!Number.isInteger(dependienteId) || dependienteId <= 0) {
    return NextResponse.json({ error: 'dependienteId requerido' }, { status: 400 });
  }
  try {
    return NextResponse.json({ monedero: await getMonederoView(teamId, dependienteId) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 404 });
  }
}

const limiteSchema = z.object({
  dependienteId: z.number().int().positive(),
  // En pesos; null = sin límite.
  limiteDiario:  z.number().min(0).nullable(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireModuleAndPermission('pos', 'pos:configurar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;
  if (!(await escolarHabilitado(teamId))) return NextResponse.json({ error: 'Capa escolar no habilitada' }, { status: 403 });

  const parsed = limiteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const limiteCts = parsed.data.limiteDiario == null ? null : Math.round(parsed.data.limiteDiario * 100);
  try {
    await setLimiteDiario(teamId, parsed.data.dependienteId, limiteCts);
    logAudit({
      teamId, userId: user.id, actor: user.email, action: 'MONEDERO_LIMITE',
      resource: `dependiente:${parsed.data.dependienteId}`, ip: getIp(req), meta: { limiteCts },
    });
    return NextResponse.json({ ok: true, monedero: await getMonederoView(teamId, parsed.data.dependienteId) });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 400 });
  }
}
