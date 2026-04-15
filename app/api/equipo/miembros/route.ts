/**
 * GET /api/equipo/miembros
 * Devuelve miembros activos + invitaciones pendientes del equipo activo
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users, invitations, teams } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { planUserLimit } from '@/lib/plans';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Usar el team ACTIVO de la sesión (no LIMIT 1 genérico)
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 403 });

  // Obtener el rol del usuario en ese team + planName del equipo
  const [myMember] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(
      eq(teamMembers.userId, user.id),
      eq(teamMembers.teamId, teamId),
    ))
    .limit(1);

  if (!myMember) return NextResponse.json({ error: 'No eres miembro de este equipo' }, { status: 403 });

  // Plan del equipo (para el límite de usuarios)
  const [teamData] = await db
    .select({ planName: teams.planName })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const userLimit = planUserLimit(teamData?.planName);

  // Miembros activos con info de usuario
  const members = await db
    .select({
      id:       teamMembers.id,
      userId:   teamMembers.userId,
      role:     teamMembers.role,
      joinedAt: teamMembers.joinedAt,
      name:     users.name,
      email:    users.email,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));

  // Invitaciones pendientes
  const pendingInvites = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.teamId, teamId), eq(invitations.status, 'pending')));

  return NextResponse.json({
    myUserId:   user.id,
    isOwner:    myMember.role === 'owner',
    members,
    invitations: pendingInvites,
    userLimit,   // -1 = ilimitado, >0 = límite del plan
  });
}
