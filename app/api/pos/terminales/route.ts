/**
 * GET  /api/pos/terminales — lista terminales (pos:vender, el cajero las ve para entrar).
 * POST /api/pos/terminales — crea terminal (pos:configurar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { listarTerminales, crearTerminal } from '@/lib/pos/terminales';

export async function GET() {
  const auth = await requirePermission('pos:vender');
  if (!auth.ok) return auth.response;
  const terminales = await listarTerminales(auth.teamId);
  return NextResponse.json({ terminales });
}

const terminalSchema = z.object({
  nombre:         z.string().min(1).max(100),
  almacenId:      z.number().int().positive(),
  impresoraId:    z.number().int().positive().nullable().optional(),
  listaPreciosId: z.number().int().positive().nullable().optional(),
  tipoEcf:        z.string().max(10).optional(),
  activo:         z.boolean().optional(),
  mesas:          z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission('pos:configurar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const body = await req.json().catch(() => null);
  const parsed = terminalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const terminal = await crearTerminal(teamId, parsed.data);
    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'POS_TERMINAL_CREAR', resource: `terminal:${terminal.id}`,
      ip: getIp(req), meta: { nombre: terminal.nombre, almacenId: terminal.almacenId },
    });
    return NextResponse.json({ ok: true, terminal }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al crear terminal';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
