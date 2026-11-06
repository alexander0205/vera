import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { registrarPagoProveedor, PagoProveedorError } from '@/lib/contabilidad/cuentas-por-pagar';
import { METODO_PAGO_VALUES } from '@/lib/pagos/metodos';
import { fechaRazonable, parseMontoPesos } from '@/lib/contabilidad/montos';

export const dynamic = 'force-dynamic';

const error = (m: string, status = 400) => NextResponse.json({ error: m }, { status });

/**
 * POST /api/contabilidad/cuentas-por-pagar/[id]/pagos
 *   { montoDOP, metodo, fechaPago, referencia?, notas?, cuentaSalidaId? }
 * Registra un pago (parcial o total) a una compra a crédito.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!a.ok) return a.response;
  const idRaw = (await params).id;
  if (!/^\d{1,9}$/.test(idRaw)) return error('ID inválido');
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return error('Cuerpo inválido');

  const monto = parseMontoPesos(b.montoDOP);
  if (!monto.ok) return error(monto.error);
  if (typeof b.metodo !== 'string' || !(METODO_PAGO_VALUES as readonly string[]).includes(b.metodo)) return error('Método de pago inválido');
  if (!fechaRazonable(b.fechaPago)) return error('La fecha de pago no es válida');
  let cuentaSalidaId: number | null = null;
  if (b.cuentaSalidaId !== undefined && b.cuentaSalidaId !== null) {
    if (typeof b.cuentaSalidaId !== 'number' || !Number.isSafeInteger(b.cuentaSalidaId) || b.cuentaSalidaId <= 0) return error('Cuenta de salida inválida');
    cuentaSalidaId = b.cuentaSalidaId;
  }
  const limpio = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F‪-‮⁦-⁩]/g, '').trim().slice(0, max) || undefined : undefined;

  try {
    return NextResponse.json({
      ok: true,
      ...await registrarPagoProveedor({
        teamId: a.teamId, compraId: Number(idRaw), montoCents: monto.cents, metodo: b.metodo, fechaPago: b.fechaPago,
        referencia: limpio(b.referencia, 100), notas: limpio(b.notas, 500), cuentaSalidaId, userId: a.user.id,
      }),
    });
  } catch (e) {
    if (e instanceof PagoProveedorError) return error(e.message, 422);
    console.error('[cxp] pago falló', e);
    return error('No se pudo registrar el pago. Inténtalo de nuevo.', 500);
  }
}
