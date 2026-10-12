/** GET /api/compras/local/[id] — detalle: comprobante, impuestos, líneas, pagos y asientos. */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/api-guard';
import { detalleCompra } from '@/lib/compras/consultas';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  let auth = await requirePermission('productos:ver');
  if (!auth.ok) auth = await requirePermission('facturas:ver');
  if (!auth.ok) return auth.response;

  const compraId = Number((await params).id);
  if (!Number.isInteger(compraId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  const compra = await detalleCompra(auth.teamId, compraId);
  if (!compra) return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });
  return NextResponse.json({ compra });
}
