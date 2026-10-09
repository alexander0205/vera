import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { getConfig, guardarConfig } from '@/lib/contabilidad/config';
import { opcionesCuentaSalida, validarCuentaSalida } from '@/lib/nomina/cuenta-pago-db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nomina/cuentas-pago — las cajas y bancos entre los que se puede
 * elegir y cuáles están como por defecto para los pagos de nómina.
 * Lo ve quien puede pagar la nómina: lo necesita el diálogo de pago.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('nomina', 'nomina:pagar');
  if (!auth.ok) return auth.response;

  const [cfg, cuentas] = await Promise.all([getConfig(auth.teamId), opcionesCuentaSalida(auth.teamId)]);
  return NextResponse.json({
    cuentas,
    efectivoId: cfg.cuentaNominaPagoEfectivoId,
    bancoId: cfg.cuentaNominaPagoBancoId,
  });
}

/**
 * PUT /api/nomina/cuentas-pago — fija las cuentas por defecto: `efectivoId` (caja
 * de donde sale un pago en efectivo) y `bancoId` (banco de una transferencia o
 * cheque). `null` la deja sin elegir.
 */
export async function PUT(req: Request) {
  const auth = await requireModuleAndPermission('nomina', 'nomina:configurar');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  if (!('efectivoId' in body) && !('bancoId' in body)) {
    return NextResponse.json({ error: 'Indica efectivoId o bancoId' }, { status: 400 });
  }

  const cambios: { cuentaNominaPagoEfectivoId?: number | null; cuentaNominaPagoBancoId?: number | null } = {};
  for (const [campo, clave] of [['efectivoId', 'cuentaNominaPagoEfectivoId'], ['bancoId', 'cuentaNominaPagoBancoId']] as const) {
    if (!(campo in body)) continue;
    const v = await validarCuentaSalida(auth.teamId, body[campo]);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    cambios[clave] = v.id;
  }

  const cfg = await guardarConfig(auth.teamId, cambios, auth.user.id);
  return NextResponse.json({ efectivoId: cfg.cuentaNominaPagoEfectivoId, bancoId: cfg.cuentaNominaPagoBancoId });
}
