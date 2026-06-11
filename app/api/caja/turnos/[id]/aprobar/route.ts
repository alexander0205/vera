/**
 * POST /api/caja/turnos/[id]/aprobar — admin/owner aprueba un cierre con descuadre.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { aprobarCierre } from '@/lib/caja/core';
import { db } from '@/lib/db/drizzle';
import { users, teams } from '@/lib/db/schema';
import { sendCajaCierreAprobadoEmail } from '@/lib/email';

const schema = z.object({ observaciones: z.string().max(500).optional() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('caja:aprobar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const { id } = await params;
  const turnoId = Number(id);
  if (!Number.isInteger(turnoId) || turnoId <= 0) {
    return NextResponse.json({ error: 'Turno inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  try {
    const turno = await aprobarCierre({
      teamId,
      turnoId,
      aprobadoPor: user.id,
      aprobacionObs: parsed.data.observaciones ?? null,
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'CAJA_CIERRE_APROBADO',
      resource: turno.numeroCierre ?? `turno:${turnoId}`,
      ip: getIp(req),
      meta: { diferenciaCentavos: turno.diferenciaCentavos },
    });

    // Email de confirmación al cajero — fire-and-forget
    notificarCajeroCierreAprobado(teamId, turno, parsed.data.observaciones ?? null)
      .catch(err => console.error('[caja-aprobar] Error enviando email al cajero:', err));

    return NextResponse.json({ ok: true, turno });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al aprobar cierre';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDOP(centavos: number) {
  return (centavos / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function notificarCajeroCierreAprobado(
  teamId: number,
  turno: Awaited<ReturnType<typeof aprobarCierre>>,
  aprobacionObs: string | null,
) {
  const [cajero] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, turno.usuarioId))
    .limit(1);
  if (!cajero) return;

  const [team] = await db
    .select({ razonSocial: teams.razonSocial, nombreComercial: teams.nombreComercial })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  const teamName = team?.nombreComercial || team?.razonSocial || `Equipo #${teamId}`;

  const diferencia = turno.diferenciaCentavos ?? 0;

  await sendCajaCierreAprobadoEmail({
    cajeroEmail:   cajero.email,
    cajeroNombre:  cajero.name,
    numeroCierre:  turno.numeroCierre ?? `Turno #${turno.id}`,
    esperadoDOP:   fmtDOP(turno.montoEsperadoCentavos ?? 0),
    contadoDOP:    fmtDOP(turno.efectivoContadoCentavos ?? 0),
    diferenciaDOP: fmtDOP(Math.abs(diferencia)),
    cuadrado:      diferencia === 0,
    aprobacionObs,
    teamName,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
  });
}
