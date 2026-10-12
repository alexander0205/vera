/**
 * POST /api/caja/turnos/[id]/cierre — el cajero solicita cerrar su turno.
 *
 * El sistema calcula el esperado y la diferencia. Si hay descuadre exige
 * justificación y deja el turno CIERRE_SOLICITADO (pendiente de supervisor).
 * Si cuadra, finaliza directo (CERRADO).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/api-guard';
import { logAudit, getIp } from '@/lib/audit';
import { solicitarCierre } from '@/lib/caja/core';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users, teams } from '@/lib/db/schema';
import { sendCajaCierreAprobacionEmail } from '@/lib/email';
import { baseDeEnlaces } from '@/lib/config/enlaces';

const cierreSchema = z.object({
  efectivoContado: z.number().min(0),   // DOP
  observaciones:   z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission('caja:operar');
  if (!auth.ok) return auth.response;
  const { user, teamId } = auth;

  const { id } = await params;
  const turnoId = Number(id);
  if (!Number.isInteger(turnoId) || turnoId <= 0) {
    return NextResponse.json({ error: 'Turno inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = cierreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const resultado = await solicitarCierre({
      teamId,
      turnoId,
      usuarioId: user.id,
      efectivoContadoCentavos: Math.round(parsed.data.efectivoContado * 100),
      cierreObs: parsed.data.observaciones ?? null,
    });

    logAudit({
      teamId, userId: user.id, actor: user.email,
      action: 'CAJA_CIERRE_SOLICITADO',
      resource: resultado.turno.numeroCierre ?? `turno:${turnoId}`,
      ip: getIp(req),
      meta: {
        esperadoCentavos:  resultado.desglose.esperado,
        contadoCentavos:   resultado.turno.efectivoContadoCentavos,
        diferenciaCentavos: resultado.diferenciaCentavos,
        requiereAprobacion: resultado.requiereAprobacion,
      },
    });

    // Notificar a admins/owners — todos los cierres requieren aprobación.
    // Fire-and-forget: no bloquea la respuesta al cajero.
    notificarAdminsCierre({
      teamId,
      cajeroNombre: user.name ?? user.email,
      resultado,
    }).catch(err => console.error('[caja-cierre] Error enviando notificación:', err));

    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al solicitar cierre';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formatea centavos como "12,500.00" para el email. */
function fmtDOP(centavos: number): string {
  return (centavos / 100).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Consulta los admins/owners del equipo y les envía el correo de aprobación.
 * Se llama fire-and-forget — no bloquea la respuesta HTTP.
 */
async function notificarAdminsCierre(input: {
  teamId:       number;
  cajeroNombre: string;
  resultado:    Awaited<ReturnType<typeof solicitarCierre>>;
}) {
  const { teamId, cajeroNombre, resultado } = input;

  // Admins y owners del equipo
  const admins = await db
    .select({ email: users.email, name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(
      eq(teamMembers.teamId, teamId),
      inArray(teamMembers.role, ['owner', 'admin']),
    ));

  if (admins.length === 0) return;

  // Nombre del equipo
  const [team] = await db
    .select({ razonSocial: teams.razonSocial, nombreComercial: teams.nombreComercial })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  const teamName = team?.nombreComercial || team?.razonSocial || `Equipo #${teamId}`;

  const diferencia  = resultado.diferenciaCentavos;
  const diferAbs    = Math.abs(diferencia);

  await sendCajaCierreAprobacionEmail({
    adminEmails:     admins,
    cajeroNombre,
    numeroCierre:    resultado.turno.numeroCierre ?? `Turno #${resultado.turno.id}`,
    esperadoDOP:     fmtDOP(resultado.desglose.esperado),
    contadoDOP:      fmtDOP(resultado.turno.efectivoContadoCentavos ?? 0),
    diferenciaDOP:   fmtDOP(diferAbs),
    diferenciaSigNo: diferencia < 0 ? '-' : '+',
    cierreObs:       resultado.turno.cierreObs ?? null,
    teamName,
    aprobacionUrl:   `${baseDeEnlaces()}/dashboard/caja/aprobaciones`,
  });
}
