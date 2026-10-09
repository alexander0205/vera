import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { MovimientoBancarioError, registrarMovimiento, type MovimientoBancario } from '@/lib/contabilidad/bancos';
import { parseMontoPesos } from '@/lib/nomina/conceptos';
import { hoyRD } from '@/lib/utils/format';
import { logAudit, getIp } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const id = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : NaN);

/**
 * POST /api/contabilidad/bancos/movimientos — registra una transferencia entre
 * cuentas propias, un cargo bancario, un depósito o un retiro.
 *   { kind: 'transferencia', fecha, cuentaOrigenId, cuentaDestinoId, monto, referencia? }
 *   { kind: 'cargo', fecha, cuentaId, cuentaGastoId, monto, concepto? }
 *   { kind: 'deposito' | 'retiro', fecha, cuentaId, contrapartidaId, monto, concepto? }
 * `monto` en pesos. Cada uno es un asiento que cuadra por construcción.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const monto = parseMontoPesos(body.monto);
  if (!monto.ok) return NextResponse.json({ error: monto.error }, { status: 400 });
  const fecha = typeof body.fecha === 'string' ? body.fecha : '';

  let m: MovimientoBancario;
  switch (body.kind) {
    case 'transferencia':
      m = { kind: 'transferencia', fecha, cuentaOrigenId: id(body.cuentaOrigenId), cuentaDestinoId: id(body.cuentaDestinoId), montoCents: monto.cents, referencia: typeof body.referencia === 'string' ? body.referencia : null };
      break;
    case 'cargo':
      m = { kind: 'cargo', fecha, cuentaId: id(body.cuentaId), cuentaGastoId: id(body.cuentaGastoId), montoCents: monto.cents, concepto: typeof body.concepto === 'string' ? body.concepto : null };
      break;
    case 'deposito':
    case 'retiro':
      m = { kind: body.kind, fecha, cuentaId: id(body.cuentaId), contrapartidaId: id(body.contrapartidaId), montoCents: monto.cents, concepto: typeof body.concepto === 'string' ? body.concepto : null };
      break;
    default:
      return NextResponse.json({ error: 'kind debe ser transferencia, cargo, deposito o retiro' }, { status: 400 });
  }

  try {
    const { asientoId } = await registrarMovimiento(auth.teamId, auth.user.id, m, hoyRD());
    logAudit({
      teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'CONTABILIDAD_MOVIMIENTO_BANCARIO',
      ip: getIp(req), meta: { kind: m.kind, montoCents: m.montoCents, asientoId },
    });
    return NextResponse.json({ ok: true, asientoId }, { status: 201 });
  } catch (e) {
    if (e instanceof MovimientoBancarioError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
