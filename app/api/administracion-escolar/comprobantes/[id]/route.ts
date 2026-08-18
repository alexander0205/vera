/**
 * POST /api/administracion-escolar/comprobantes/[id]  body: { accion, motivo? }
 *
 * Aprobar mueve dinero de verdad —registra el cobro contra la factura— así que
 * exige el permiso de pagos, no el de ver.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import {
  aprobarComprobante, rechazarComprobante, ComprobanteError,
} from '@/lib/administracion-escolar/comprobantes';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:pagos');
  if (!auth.ok) return auth.response;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Id no válido' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const accion = String(body?.accion ?? '');

  try {
    if (accion === 'aprobar') {
      return NextResponse.json({ ok: true, ...await aprobarComprobante(auth.teamId, id, auth.user.id) });
    }
    if (accion === 'rechazar') {
      await rechazarComprobante(auth.teamId, id, auth.user.id, String(body?.motivo ?? ''));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (e) {
    if (e instanceof ComprobanteError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error('[comprobantes]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo procesar el comprobante' },
      { status: 500 },
    );
  }
}
