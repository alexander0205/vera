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
import { listTeamRoles } from '@/lib/auth/permissions';
import { rolEfectivoEnEmpresa } from '@/lib/auth/plataforma';
import { getUserModules } from '@/lib/auth/modules';
import type { ModuleKey } from '@/lib/config/modules';

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

  // El equipo de Zero ve el equipo de cualquier empresa sin ser miembro.
  const miRol = rolEfectivoEnEmpresa(user, myMember?.role);
  if (!miRol) return NextResponse.json({ error: 'No eres miembro de este equipo' }, { status: 403 });

  // Plan del equipo (para el límite de usuarios)
  const [teamData] = await db
    .select({ planName: teams.planName })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const userLimit = planUserLimit(teamData?.planName);

  // Miembros activos con info de usuario
  const filas = await db
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

  // Módulos a los que entra cada miembro según la empresa y su rol. platformRole
  // va en null a propósito: muestra lo de la empresa, no lo que ve el equipo
  // de Zero. Una consulta por rol distinto, no por persona.
  const modulosPorRol = new Map<string, ModuleKey[]>();
  for (const rol of new Set(filas.map(f => f.role))) {
    const mods = await getUserModules(teamId, null, rol);
    modulosPorRol.set(rol, mods.filter(m => m !== 'administracion'));
  }
  const members = filas.map(f => ({ ...f, modulos: modulosPorRol.get(f.role) ?? [] }));

  // Invitaciones pendientes
  const pendingInvites = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.teamId, teamId), eq(invitations.status, 'pending')));

  // Roles del team (sistema + custom) — para badges y dropdowns dinámicos.
  const roles = (await listTeamRoles(teamId)).map(r => ({
    key: r.key, label: r.label, description: r.description,
    icon: r.icon, color: r.color, isSystem: r.isSystem,
  }));

  return NextResponse.json({
    myUserId:   user.id,
    isOwner:    miRol === 'owner',
    members,
    invitations: pendingInvites,
    roles,
    userLimit,   // -1 = ilimitado, >0 = límite del plan
  });
}
