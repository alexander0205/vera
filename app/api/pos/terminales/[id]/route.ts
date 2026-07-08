/**
 * PATCH  /api/pos/terminales/[id] — edita terminal (pos:configurar).
 * DELETE /api/pos/terminales/[id] — desactiva terminal (baja lógica, pos:configurar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { actualizarTerminal, desactivarTerminal } from '@/lib/pos/terminales';

const terminalSchema = z.object({
  nombre:         z.string().min(1).max(100),
  almacenId:      z.number().int().positive(),
  impresoraId:    z.number().int().positive().nullable().optional(),
  listaPreciosId: z.number().int().positive().nullable().optional(),
  tipoEcf:        z.string().max(10).optional(),
  activo:         z.boolean().optional(),
  mesas:          z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('pos:configurar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = terminalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const terminal = await actualizarTerminal(teamId, id, parsed.data);
    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'POS_TERMINAL_EDITAR', resource: `terminal:${id}`,
      ip: getIp(req), meta: { nombre: terminal.nombre },
    });
    return NextResponse.json({ ok: true, terminal });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al editar terminal';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('pos:configurar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  try {
    await desactivarTerminal(teamId, id);
    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'POS_TERMINAL_DESACTIVAR', resource: `terminal:${id}`, ip: getIp(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al desactivar terminal';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
