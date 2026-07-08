/**
 * POST /api/pos/comandas/[id]/cobrar — marca la comanda como cobrada.
 *
 * El cobro real (emisión e-CF, ledger de pagos, descuento de inventario) ya lo
 * hizo /api/ecf/emitir. Aquí solo se cierra la comanda atándola al documento,
 * lo que libera la mesa. Se valida que el e-CF pertenezca al equipo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { db } from '@/lib/db/drizzle';
import { ecfDocuments } from '@/lib/db/schema';
import { getComanda, marcarCobrada } from '@/lib/pos/restaurante';

const schema = z.object({ ecfDocumentId: z.number().int().positive() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('pos:vender');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const comandaId = Number(id);
  const data = await getComanda(auth.teamId, comandaId);
  if (!data) return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 });
  if (data.comanda.estado !== 'abierta') {
    return NextResponse.json({ error: 'La comanda ya no está abierta' }, { status: 409 });
  }

  // El e-CF debe existir y ser del equipo (no cerrar contra un documento ajeno).
  const [doc] = await db.select({ id: ecfDocuments.id }).from(ecfDocuments)
    .where(and(eq(ecfDocuments.id, parsed.data.ecfDocumentId), eq(ecfDocuments.teamId, auth.teamId)))
    .limit(1);
  if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

  await marcarCobrada(auth.teamId, comandaId, parsed.data.ecfDocumentId);
  logAudit({
    teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email,
    action: 'POS_COMANDA_COBRAR', resource: `comanda:${comandaId}`,
    ip: getIp(req), meta: { ecfDocumentId: parsed.data.ecfDocumentId },
  });
  return NextResponse.json({ ok: true });
}
