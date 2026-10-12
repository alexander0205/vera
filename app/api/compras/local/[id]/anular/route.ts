/**
 * POST /api/compras/local/[id]/anular — anula una compra o gasto registrado.
 * Revierte el inventario y genera el reverso del asiento. No se anula lo que ya
 * tiene pagos en Cuentas por pagar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { anularCompra, CompraError } from '@/lib/compras/registrar';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  let auth = await requirePermission('productos:gestionar', { escritura: true });
  if (!auth.ok) auth = await requirePermission('facturas:anular', { escritura: true });
  if (!auth.ok) return auth.response;

  const compraId = Number((await params).id);
  if (!Number.isInteger(compraId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  try {
    const r = await anularCompra(auth.teamId, auth.user.id, compraId, String(body?.motivo ?? ''));
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof CompraError) return NextResponse.json({ error: e.message, codigo: e.codigo }, { status: e.status });
    console.error('[compras/local/anular] falló', e);
    return NextResponse.json({ error: 'No se pudo anular' }, { status: 500 });
  }
}
