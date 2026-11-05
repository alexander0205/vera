/**
 * POST /api/contabilidad/activos-fijos/[id]/baja — da de baja (retira) unidades
 * de un activo, o todas, y asienta el retiro: lo que valían en libros va a pérdida.
 *   { fecha, unidades, motivo? }
 * No registra ventas: vender un activo lleva factura electrónica con ITBIS y se
 * emite en Facturación. Requiere `contabilidad:gestionar`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { darDeBajaActivo } from '@/lib/contabilidad/activos-fijos-db';
import { BajaActivoError } from '@/lib/contabilidad/activos-fijos';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('contabilidad:gestionar', { escritura: true });
  if (!auth.ok) return auth.response;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  try {
    const r = await darDeBajaActivo({
      teamId: auth.teamId, userId: auth.user.id, activoId: id,
      fecha: String(b.fecha ?? ''), unidades: Number(b.unidades),
      motivo: typeof b.motivo === 'string' ? b.motivo : null,
    });
    logAudit({
      teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email, action: 'CONTABILIDAD_ACTIVO_BAJA',
      resource: `baja-activo:${id}`, ip: getIp(req), meta: { bajaId: r.bajaId, asientoId: r.asientoId, ...r.calculo },
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof BajaActivoError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
