/**
 * POST /api/equipo/invitaciones — Crear una invitación
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users, invitations, teams } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { sendInvitationEmail } from '@/lib/email';
import { planUserLimit } from '@/lib/plans';
import { INVITABLE_ROLE_KEYS } from '@/lib/config/roles';

const inviteSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  role: z.enum(INVITABLE_ROLE_KEYS),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    // Usar el team ACTIVO de la sesión (no LIMIT 1 genérico)
    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin equipo activo' }, { status: 403 });

    // Verificar rol del usuario en ese team
    const [caller] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(
        eq(teamMembers.userId, user.id),
        eq(teamMembers.teamId, teamId),
      ))
      .limit(1);

    if (!caller) return NextResponse.json({ error: 'No eres miembro de este equipo' }, { status: 403 });
    if (caller.role !== 'owner' && caller.role !== 'admin') {
      return NextResponse.json({ error: 'Sin permiso para invitar miembros' }, { status: 403 });
    }

    // Verificar límite de usuarios del plan
    const [teamData] = await db
      .select({ planName: teams.planName, name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    const limit = planUserLimit(teamData?.planName);
    if (limit > 0) {
      const [{ value: memberCount }] = await db
        .select({ value: count() })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId));

      if (memberCount >= limit) {
        return NextResponse.json(
          { error: `Tu plan ${teamData?.planName ?? ''} solo permite ${limit} usuario(s). Actualiza tu plan para agregar más.` },
          { status: 403 }
        );
      }
    }

    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
    }

    const { email, role } = parsed.data;

    // Verificar que no sea ya miembro
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(teamMembers, eq(users.id, teamMembers.userId))
      .where(and(eq(users.email, email), eq(teamMembers.teamId, teamId)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: 'Este usuario ya es miembro del equipo' }, { status: 400 });
    }

    // Verificar que no haya invitación pendiente
    const existingInvite = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(and(
        eq(invitations.teamId, teamId),
        eq(invitations.email, email),
        eq(invitations.status, 'pending'),
      ))
      .limit(1);

    if (existingInvite.length > 0) {
      return NextResponse.json({ error: 'Ya existe una invitación pendiente para este correo' }, { status: 400 });
    }

    const [inv] = await db.insert(invitations).values({
      teamId,
      email,
      role,
      invitedBy: user.id,
      status:    'pending',
    }).returning();

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/sign-up?inviteId=${inv.id}`;

    try {
      await sendInvitationEmail(email, user.name, teamData?.name ?? 'EmiteDO', inv.id.toString());
    } catch (e) {
      console.error('[POST /api/equipo/invitaciones] Error sending invitation email:', e);
    }

    return NextResponse.json({ ok: true, inviteId: inv.id, inviteUrl });
  } catch (err: unknown) {
    console.error('[POST /api/equipo/invitaciones]', err);
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
