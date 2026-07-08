/**
 * GET  /api/pos/mesas?terminalId= — mesas de la terminal con estado (pos:vender).
 * POST /api/pos/mesas              — crea mesa (pos:configurar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { listarMesas, crearMesa } from '@/lib/pos/restaurante';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('pos:vender');
  if (!auth.ok) return auth.response;
  const terminalId = Number(new URL(req.url).searchParams.get('terminalId'));
  if (!terminalId) return NextResponse.json({ error: 'terminalId requerido' }, { status: 400 });
  const mesas = await listarMesas(auth.teamId, terminalId);
  return NextResponse.json({ mesas });
}

const mesaSchema = z.object({
  terminalId: z.number().int().positive(),
  nombre:     z.string().min(1).max(40),
  zona:       z.string().max(40).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission('pos:configurar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const body = await req.json().catch(() => null);
  const parsed = mesaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const mesa = await crearMesa(teamId, parsed.data.terminalId, parsed.data.nombre, parsed.data.zona ?? null);
    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'POS_MESA_CREAR', resource: `mesa:${mesa.id}`,
      ip: getIp(req), meta: { nombre: mesa.nombre, terminalId: mesa.terminalId },
    });
    return NextResponse.json({ ok: true, mesa }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al crear mesa';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
