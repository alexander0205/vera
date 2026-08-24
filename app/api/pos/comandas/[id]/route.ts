/**
 * GET    /api/pos/comandas/[id] — comanda + items (pos:vender).
 * PATCH  /api/pos/comandas/[id] — guarda las líneas del carrito en la comanda.
 * DELETE /api/pos/comandas/[id] — cancela la comanda (libera la mesa sin cobrar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { getComanda, guardarItems, cancelarComanda } from '@/lib/pos/restaurante';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const data = await getComanda(auth.teamId, Number(id));
  if (!data) return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 });
  return NextResponse.json(data);
}

const itemSchema = z.object({
  productoId:     z.number().int().positive().nullable(),
  nombre:         z.string().min(1).max(200),
  precioCentavos: z.number().int().min(0),
  qty:            z.number().int().positive(),
  tasaItbis:      z.string().max(10),
  tipo:           z.string().max(10),
  descuentoPct:   z.number().int().min(0).max(100).optional(),
  notas:          z.string().max(200).nullable().optional(),
});
const guardarSchema = z.object({
  items:    z.array(itemSchema),
  meseroId: z.number().int().positive().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = guardarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const comanda = await guardarItems(auth.teamId, Number(id), parsed.data.items, parsed.data.meseroId ?? null);
    return NextResponse.json({ ok: true, comanda });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al guardar comanda';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await cancelarComanda(auth.teamId, Number(id));
  logAudit({
    teamId: auth.teamId, userId: auth.user.id, actor: auth.user.email,
    action: 'POS_COMANDA_CANCELAR', resource: `comanda:${id}`, ip: getIp(req),
  });
  return NextResponse.json({ ok: true });
}
