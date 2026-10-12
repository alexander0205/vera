/**
 * GET /api/caja/turno-activo — turno vivo del usuario + config del límite.
 *
 * Alimenta el contador regresivo del header (dashboard y POS). Deliberadamente
 * mínimo: solo lo que el contador necesita, para que pueda consultarse cada
 * pocos minutos sin peso.
 *
 * Sin permiso especial más allá de estar autenticado: devuelve el turno DEL
 * PROPIO usuario. No expone turnos ajenos, así que no hay nada que gatear —
 * /api/pos/turno exige pos:vender y un admin del dashboard puede no tenerlo.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { conErrorJson } from '@/lib/api/error-json';
import { getTurnoAbierto, getMinutosAbierto } from '@/lib/caja/core';

export async function GET() {
  return conErrorJson(
    'api/caja/turno-activo',
    'No se pudo consultar el estado de la caja.',
    turnoActivo,
  );
}

async function turnoActivo(): Promise<Response> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const [team] = await db
    .select({
      cajaHabilitada:   teams.cajaHabilitada,
      cajaLimiteHoras:  teams.cajaLimiteHoras,
      cajaAvisoMinutos: teams.cajaAvisoMinutos,
      cajaGraciaHoras:  teams.cajaGraciaHoras,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team?.cajaHabilitada) {
    return NextResponse.json({ turno: null, limiteHoras: null, avisoMinutos: 60, graciaHoras: null });
  }

  const turno = await getTurnoAbierto(teamId, user.id);

  // minutosAbierto lo calcula Postgres — no mandamos aperturaAt para que el
  // cliente no caiga en la tentación de restar fechas y equivocarse por la TZ
  // (ver nota en lib/caja/core.ts:getMinutosAbierto). El cliente cuenta hacia
  // adelante desde este número con su propio reloj, que para deltas sí sirve.
  const minutosAbierto = turno ? await getMinutosAbierto(turno.id) : null;

  return NextResponse.json({
    turno: turno && minutosAbierto != null
      ? { id: turno.id, estado: turno.estado, minutosAbierto }
      : null,
    limiteHoras:  team.cajaLimiteHoras,
    avisoMinutos: team.cajaAvisoMinutos,
    graciaHoras:  team.cajaGraciaHoras,
  });
}
