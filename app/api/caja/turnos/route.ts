/**
 * GET  /api/caja/turnos  — estado de caja del usuario (turno vivo + esperado).
 * POST /api/caja/turnos  — abrir turno (caja:operar).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import {
  getTurnoAbierto,
  abrirTurno,
  calcularEsperado,
  getConciliacion,
  getVentasPorMetodo,
} from '@/lib/caja/core';
import { listarTerminales, getTerminal } from '@/lib/pos/terminales';
import { db } from '@/lib/db/drizzle';
import { cajaMovimientos } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';

export async function GET() {
  const auth = await requirePermission('caja:ver');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const turno = await getTurnoAbierto(teamId, user.id);

  // Sin turno vivo: devuelve las terminales activas para el selector de apertura.
  if (!turno) {
    const terminales = (await listarTerminales(teamId))
      .filter(t => t.activo)
      .map(t => ({ id: t.id, nombre: t.nombre }));
    return NextResponse.json({ turno: null, terminales });
  }

  const [desglose, conciliacion, movimientos, ventasPorMetodo, terminal] = await Promise.all([
    calcularEsperado(teamId, turno),
    getConciliacion(teamId, turno.id),
    db.select().from(cajaMovimientos).where(and(eq(cajaMovimientos.teamId, teamId), eq(cajaMovimientos.turnoId, turno.id))).orderBy(desc(cajaMovimientos.createdAt)),
    getVentasPorMetodo(teamId, turno.id),
    turno.terminalId ? getTerminal(teamId, turno.terminalId) : Promise.resolve(null),
  ]);

  return NextResponse.json({ turno, desglose, conciliacion, movimientos, ventasPorMetodo, terminal });
}

const abrirSchema = z.object({
  // Monto en DOP (no centavos) — el cliente envía pesos.
  montoApertura: z.number().min(0),
  observaciones: z.string().max(500).optional(),
  // Terminal opcional: si el equipo tiene terminales configuradas se elige una;
  // si no hay ninguna, el turno se abre sin terminal (terminal_id = NULL).
  terminalId: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission('caja:operar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const body = await req.json().catch(() => null);
  const parsed = abrirSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  // Si se envía terminal, debe existir, ser del equipo y estar activa.
  let terminalId: number | null = null;
  if (parsed.data.terminalId != null) {
    const terminal = await getTerminal(teamId, parsed.data.terminalId);
    if (!terminal)        return NextResponse.json({ error: 'Terminal no encontrada' }, { status: 404 });
    if (!terminal.activo) return NextResponse.json({ error: 'La terminal está inactiva' }, { status: 400 });
    terminalId = terminal.id;
  }

  try {
    const turno = await abrirTurno({
      teamId,
      usuarioId: user.id,
      aperturaPor: user.id,
      montoAperturaCentavos: Math.round(parsed.data.montoApertura * 100),
      aperturaObs: parsed.data.observaciones ?? null,
      terminalId,
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'CAJA_APERTURA',
      resource: `turno:${turno.id}`,
      ip: getIp(req),
      meta: { montoAperturaCentavos: turno.montoAperturaCentavos, terminalId },
    });

    return NextResponse.json({ ok: true, turno }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al abrir caja';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
