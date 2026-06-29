import { NextResponse } from 'next/server';
import { eliminarPago } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';

/**
 * DELETE /api/pagos/[id] — Revierte un pago del ledger `pagos_recibidos`.
 * Resincroniza el espejo inline + estado_pago del documento. Requiere
 * permiso `facturas:anular` (acción destructiva).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('facturas:anular');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const pagoId = Number(id);
  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    return NextResponse.json({ error: 'ID de pago inválido' }, { status: 400 });
  }

  try {
    const pago = await eliminarPago(auth.teamId, pagoId);
    return NextResponse.json({ ok: true, pago });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error al eliminar el pago' },
      { status: 422 },
    );
  }
}
