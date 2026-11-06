import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { ConciliacionError, emparejarManual } from '@/lib/contabilidad/conciliacion';
import { prellenarCargo, registrarCargoDeLinea } from '@/lib/contabilidad/conciliacion-ayuda';

export const dynamic = 'force-dynamic';

const id = (v: unknown) => {
  const x = Number(v);
  return Number.isSafeInteger(x) && x > 0 ? x : null;
};

/** GET ?lineaId= — el «Registrar cargo» ya lleno (fecha, monto, concepto, cuenta de gastos bancarios) para confirmar. */
export async function GET(req: NextRequest) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;
  const lineaId = id(new URL(req.url).searchParams.get('lineaId'));
  if (!lineaId) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  try {
    return NextResponse.json(await prellenarCargo(auth.teamId, lineaId));
  } catch (e) {
    if (e instanceof ConciliacionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

/**
 * POST — acepta una sugerencia de «Ayúdame a conciliar»:
 *   { tipo: 'gasto-bancario', lineaId, concepto?, cuentaGastoId?, origen? }   registra el cargo (por defecto en 6117) y vuelve a emparejar
 *   { tipo: 'emparejar', lineaId, libroLineaId, origen? }     empareja con el apunte del libro (mismo monto)
 * `origen` ('regla' | 'ia') solo se anota en la bitácora.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  const lineaId = id(body.lineaId);
  if (!lineaId) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  const origen = body.origen === 'ia' ? 'ia' : 'regla';
  const { teamId, user } = auth;

  try {
    if (body.tipo === 'gasto-bancario') {
      const r = await registrarCargoDeLinea(teamId, user.id, lineaId, typeof body.concepto === 'string' ? body.concepto : null, id(body.cuentaGastoId));
      logAudit({ teamId, userId: user.id, actor: user.email, action: 'CONTABILIDAD_MOVIMIENTO_BANCARIO', resource: `cargo-bancario:${lineaId}`, ip: getIp(req), meta: { ...r, metodo: origen === 'ia' ? 'ia' : 'regla' } });
      return NextResponse.json({ ok: true, ...r });
    }
    if (body.tipo === 'emparejar') {
      const libroLineaId = id(body.libroLineaId);
      if (!libroLineaId) return NextResponse.json({ error: 'Elige el apunte del libro' }, { status: 400 });
      await emparejarManual(teamId, user.id, lineaId, libroLineaId);
      logAudit({ teamId, userId: user.id, actor: user.email, action: 'CONTABILIDAD_MOVIMIENTO_BANCARIO', resource: `emparejar-sugerido:${lineaId}`, ip: getIp(req), meta: { libroLineaId, metodo: origen === 'ia' ? 'ia' : 'regla' } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'tipo debe ser gasto-bancario o emparejar' }, { status: 400 });
  } catch (e) {
    if (e instanceof ConciliacionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
