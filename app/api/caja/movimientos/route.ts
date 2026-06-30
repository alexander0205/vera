/**
 * GET  /api/caja/movimientos?turnoId=  — lista movimientos del turno (caja:ver).
 * POST /api/caja/movimientos           — registra un movimiento (caja:operar).
 *
 * Los AJUSTE solo los puede crear quien tenga caja:aprobar (supervisor).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { userCanForTeam } from '@/lib/auth/permissions';
import { logAudit, getIp } from '@/lib/audit';
import { registrarMovimiento, type TipoMovimiento } from '@/lib/caja/core';
import { db } from '@/lib/db/drizzle';
import { cajaMovimientos } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  const auth = await requirePermission('caja:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const turnoId = Number(req.nextUrl.searchParams.get('turnoId'));
  if (!Number.isInteger(turnoId) || turnoId <= 0) {
    return NextResponse.json({ error: 'turnoId requerido' }, { status: 400 });
  }

  const movimientos = await db
    .select()
    .from(cajaMovimientos)
    .where(and(eq(cajaMovimientos.teamId, teamId), eq(cajaMovimientos.turnoId, turnoId)))
    .orderBy(desc(cajaMovimientos.createdAt));

  return NextResponse.json({ movimientos });
}

const movSchema = z.object({
  turnoId:      z.number().int().positive(),
  tipo:         z.enum(['ENTRADA', 'SALIDA', 'GASTO', 'RETIRO', 'AJUSTE']),
  monto:        z.number().positive(),   // DOP
  metodo:       z.string().max(30).optional(),
  descripcion:  z.string().max(500).optional(),
  motivo:       z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission('caja:operar');
  if (!auth.ok) return auth.response;
  const { user, teamId, teamRole } = auth;

  const body = await req.json().catch(() => null);
  const parsed = movSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // AJUSTE es operación de supervisor.
  const esAjuste = data.tipo === 'AJUSTE';
  if (esAjuste && !(await userCanForTeam(teamId, user.platformRole, teamRole, 'caja:aprobar'))) {
    return NextResponse.json({ error: 'Solo un supervisor puede registrar ajustes' }, { status: 403 });
  }

  try {
    const mov = await registrarMovimiento({
      teamId,
      turnoId:       data.turnoId,
      tipo:          data.tipo as TipoMovimiento,
      montoCentavos: Math.round(data.monto * 100),
      metodo:        data.metodo ?? 'efectivo',
      descripcion:   data.descripcion ?? null,
      motivo:        data.motivo ?? null,
      origen:        esAjuste ? 'SUPERVISOR' : 'SISTEMA',
      createdBy:     user.id,
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: esAjuste ? 'CAJA_AJUSTE' : 'CAJA_MOVIMIENTO',
      resource: `turno:${data.turnoId}`,
      ip: getIp(req),
      meta: { tipo: data.tipo, montoCentavos: mov.montoCentavos, motivo: data.motivo ?? null },
    });

    return NextResponse.json({ ok: true, movimiento: mov }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al registrar movimiento';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
