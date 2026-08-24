/**
 * GET  /api/pos/turno — turno POS vivo del cajero + config de su terminal.
 * POST /api/pos/turno — abrir turno atado a una terminal (pos:vender).
 *
 * La VENTA en sí reusa /api/ecf/emitir: ese endpoint ya ata el cobro al turno
 * abierto del cajero y descuenta inventario. El POS solo abre el turno con la
 * terminal correcta y luego emite contra el motor existente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { getTurnoAbierto, abrirTurno } from '@/lib/caja/core';
import { getTerminal } from '@/lib/pos/terminales';

export async function GET() {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const turno = await getTurnoAbierto(teamId, user.id);
  if (!turno) return NextResponse.json({ turno: null, terminal: null });

  const terminal = turno.terminalId ? await getTerminal(teamId, turno.terminalId) : null;
  return NextResponse.json({ turno, terminal });
}

const abrirSchema = z.object({
  terminalId:    z.number().int().positive(),
  montoApertura: z.number().min(0),
  observaciones: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('pos', 'pos:vender');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const body = await req.json().catch(() => null);
  const parsed = abrirSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  const terminal = await getTerminal(teamId, parsed.data.terminalId);
  if (!terminal)        return NextResponse.json({ error: 'Terminal no encontrada' }, { status: 404 });
  if (!terminal.activo) return NextResponse.json({ error: 'La terminal está inactiva' }, { status: 400 });

  try {
    const turno = await abrirTurno({
      teamId,
      usuarioId:             user.id,
      aperturaPor:           user.id,
      montoAperturaCentavos: Math.round(parsed.data.montoApertura * 100),
      aperturaObs:           parsed.data.observaciones ?? null,
      terminalId:            terminal.id,
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'CAJA_APERTURA', resource: `turno:${turno.id}`,
      ip: getIp(req), meta: { terminalId: terminal.id, montoAperturaCentavos: turno.montoAperturaCentavos },
    });

    return NextResponse.json({ ok: true, turno, terminal }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al abrir turno';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
