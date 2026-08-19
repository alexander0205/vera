/**
 * POST /api/empresa/descartar — cancela la creación de una empresa cuyo
 * onboarding NO se terminó y devuelve al usuario a otra de sus empresas.
 *
 * El onboarding es obligatorio (lib/onboarding/muro): quien empieza a crear una
 * empresa nueva queda atrapado hasta terminarla, sin forma de arrepentirse. Esto
 * es la salida — solo para quien YA tiene otra empresa a la que volver.
 *
 * No se borra la fila del team: `teams` tiene ~88 dependencias por FK y un DELETE
 * podría toparse con cualquier log o hijo. En su lugar se quita la membresía del
 * usuario, con lo que la empresa a medias desaparece de su conmutador
 * (getUserTeams filtra por membresía) y se activa la empresa destino. La fila
 * huérfana es invisible para el usuario y `teams.rnc` no es único, así que no
 * estorba para volver a crear una empresa con el mismo RNC.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams, teamMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { setActiveTeam } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { teamId } = await req.json().catch(() => ({}));
  if (!teamId || typeof teamId !== 'number') {
    return NextResponse.json({ error: 'teamId requerido' }, { status: 400 });
  }

  // Debe ser miembro de la empresa que quiere descartar.
  const [membership] = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);
  if (!membership) {
    return NextResponse.json({ error: 'No tienes acceso a esa empresa' }, { status: 403 });
  }

  // Solo empresas SIN onboarding terminado. Una empresa ya configurada —con su
  // RNC verificado, comprobantes emitidos— no se cancela con un botón; para esas
  // el camino es otro (soporte). Esta guarda es la que impide borrar por error
  // una empresa real reenviando su id.
  const [team] = await db
    .select({ done: teams.onboardingCompletadoEn })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return NextResponse.json({ error: 'Empresa no existe' }, { status: 404 });
  if (team.done) {
    return NextResponse.json(
      { error: 'Esta empresa ya está creada; no se puede cancelar desde aquí.' },
      { status: 409 },
    );
  }

  // Empresa a la que volver: otra del usuario. Se prefiere una con el onboarding
  // ya terminado (usable) y, entre esas, la más reciente. Sin otra empresa no se
  // permite: quedaría sin ninguna y el muro no tendría a dónde mandarlo.
  const otras = await db
    .select({ teamId: teamMembers.teamId, done: teams.onboardingCompletadoEn, createdAt: teams.createdAt })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.userId, user.id), ne(teamMembers.teamId, teamId)));
  if (otras.length === 0) {
    return NextResponse.json({ error: 'No puedes cancelar tu única empresa.' }, { status: 409 });
  }
  const destino = [...otras].sort(
    (a, b) => (Number(!!b.done) - Number(!!a.done)) || (b.createdAt.getTime() - a.createdAt.getTime()),
  )[0];

  // La activa PRIMERO: si el borrado de la membresía fallara después, la sesión
  // ya apunta a una empresa válida y no a una en la que el usuario ya no está.
  await setActiveTeam(destino.teamId);
  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)));

  return NextResponse.json({ ok: true, teamId: destino.teamId });
}
