import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import {
  asignarDeposito, candidatosManuales, desemparejar, emparejarManual, ignorarLinea,
  registrarDepositoSinIdentificar, ConciliacionError,
} from '@/lib/contabilidad/conciliacion';

export const dynamic = 'force-dynamic';

const idDe = (v: string) => {
  const x = Number(v);
  return Number.isSafeInteger(x) && x > 0 ? x : null;
};

/** GET — los apuntes del libro, sin conciliar, con el mismo monto: candidatos para emparejar a mano. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('contabilidad:ver');
  if (!auth.ok) return auth.response;
  const id = idDe((await params).id);
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  try {
    return NextResponse.json({ candidatos: await candidatosManuales(auth.teamId, id) });
  } catch (e) {
    if (e instanceof ConciliacionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

/**
 * POST — una acción sobre una línea del estado de cuenta:
 *   { accion: 'emparejar', lineaId }            con un apunte del libro del mismo monto
 *   { accion: 'desemparejar' }
 *   { accion: 'ignorar' } · { accion: 'restaurar' }
 *   { accion: 'registrar-deposito' }            asienta el depósito como «por identificar»
 *   { accion: 'asignar', clienteId, cargoReferencia?, nota? }   lo identifica
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = idDe((await params).id);
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  const { teamId, user } = auth;
  try {
    switch (body.accion) {
      case 'emparejar': {
        const lineaId = Number(body.lineaId);
        if (!Number.isSafeInteger(lineaId) || lineaId <= 0) return NextResponse.json({ error: 'Elige el apunte del libro' }, { status: 400 });
        await emparejarManual(teamId, user.id, id, lineaId);
        return NextResponse.json({ ok: true });
      }
      case 'desemparejar':
        await desemparejar(teamId, id);
        return NextResponse.json({ ok: true });
      case 'ignorar':
        await ignorarLinea(teamId, user.id, id, true);
        return NextResponse.json({ ok: true });
      case 'restaurar':
        await ignorarLinea(teamId, user.id, id, false);
        return NextResponse.json({ ok: true });
      case 'registrar-deposito': {
        const r = await registrarDepositoSinIdentificar(teamId, user.id, id);
        logAudit({ teamId, userId: user.id, actor: user.email, action: 'CONTABILIDAD_MOVIMIENTO_BANCARIO', resource: `deposito-sin-identificar:${id}`, ip: getIp(req), meta: r });
        return NextResponse.json({ ok: true, ...r });
      }
      case 'asignar': {
        const clienteId = Number(body.clienteId);
        if (!Number.isSafeInteger(clienteId) || clienteId <= 0) return NextResponse.json({ error: 'Elige el cliente' }, { status: 400 });
        const r = await asignarDeposito(teamId, user.id, id, {
          clienteId,
          cargoReferencia: typeof body.cargoReferencia === 'string' ? body.cargoReferencia : null,
          nota: typeof body.nota === 'string' ? body.nota : null,
        });
        logAudit({ teamId, userId: user.id, actor: user.email, action: 'CONTABILIDAD_MOVIMIENTO_BANCARIO', resource: `deposito-asignado:${id}`, ip: getIp(req), meta: { ...r, clienteId } });
        return NextResponse.json({ ok: true, ...r });
      }
      default:
        return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof ConciliacionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
