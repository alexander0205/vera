/**
 * POST /api/caja/turnos/[id]/rechazar — admin/owner rechaza el cierre.
 * El turno vuelve a ABIERTO para que el cajero recuente. Requiere motivo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { rechazarCierre } from '@/lib/caja/core';
import { db } from '@/lib/db/drizzle';
import { users, teams } from '@/lib/db/schema';
import { sendCajaCierreRechazadoEmail } from '@/lib/email';

const schema = z.object({ motivo: z.string().min(1).max(500) });

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

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'El rechazo requiere un motivo' }, { status: 400 });
  }

  try {
    const turno = await rechazarCierre({
      teamId,
      turnoId,
      aprobadoPor: user.id,
      aprobacionObs: parsed.data.motivo,
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'CAJA_CIERRE_RECHAZADO',
      resource: turno.numeroCierre ?? `turno:${turnoId}`,
      ip: getIp(req),
      meta: { motivo: parsed.data.motivo },
    });

    // Email de notificación al cajero — fire-and-forget
    notificarCajeroCierreRechazado(teamId, turno, parsed.data.motivo)
      .catch(err => console.error('[caja-rechazar] Error enviando email al cajero:', err));

    return NextResponse.json({ ok: true, turno });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al rechazar cierre';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function notificarCajeroCierreRechazado(
  teamId: number,
  turno: Awaited<ReturnType<typeof rechazarCierre>>,
  motivo: string,
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

  await sendCajaCierreRechazadoEmail({
    cajeroEmail:  cajero.email,
    cajeroNombre: cajero.name,
    numeroCierre: turno.numeroCierre ?? `Turno #${turno.id}`,
    motivo,
    teamName,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
  });
}
