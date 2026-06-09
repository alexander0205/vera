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
} from '@/lib/caja/core';
import { db } from '@/lib/db/drizzle';
import { cajaMovimientos } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const auth = await requirePermission('caja:ver');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const turno = await getTurnoAbierto(teamId, user.id);
  if (!turno) return NextResponse.json({ turno: null });

  const [desglose, conciliacion, movimientos] = await Promise.all([
    calcularEsperado(teamId, turno),
    getConciliacion(teamId, turno.id),
    db.select().from(cajaMovimientos).where(eq(cajaMovimientos.turnoId, turno.id)).orderBy(desc(cajaMovimientos.createdAt)),
  ]);

  return NextResponse.json({ turno, desglose, conciliacion, movimientos });
}

const abrirSchema = z.object({
  // Monto en DOP (no centavos) — el cliente envía pesos.
  montoApertura: z.number().min(0),
  observaciones: z.string().max(500).optional(),
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

  try {
    const turno = await abrirTurno({
      teamId,
      usuarioId: user.id,
      aperturaPor: user.id,
      montoAperturaCentavos: Math.round(parsed.data.montoApertura * 100),
      aperturaObs: parsed.data.observaciones ?? null,
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'CAJA_APERTURA',
      resource: `turno:${turno.id}`,
      ip: getIp(req),
      meta: { montoAperturaCentavos: turno.montoAperturaCentavos },
    });

    return NextResponse.json({ ok: true, turno }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al abrir caja';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
