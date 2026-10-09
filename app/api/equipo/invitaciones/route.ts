/**
 * POST /api/equipo/invitaciones — Crear una invitación
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamMembers, users, invitations, teams } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { sendInvitationEmail } from '@/lib/email';
import { listTeamRoles } from '@/lib/auth/permissions';
import { puedeAgregarUsuario } from '@/lib/config/plans';
import { bloquearSiSoloLectura } from '@/lib/suscripcion/guard';
import { baseDeEnlaces } from '@/lib/config/enlaces';

const inviteSchema = z.object({
  // Normalizamos aquí: el email se guarda en minúsculas para que todas las
  // búsquedas posteriores (login, invitaciones, reset de contraseña) matcheen.
  email: z.string().email('Correo electrónico inválido').trim().toLowerCase(),
  role: z.string().min(1, 'Rol requerido'),
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

    // Sin plan vivo no se suma gente al equipo. Va antes del límite de
    // usuarios porque son dos preguntas distintas y en este orden: primero
    // "¿tienes plan?", después "¿te queda cupo en él?".
    const bloqueo = await bloquearSiSoloLectura(teamId);
    if (bloqueo) return bloqueo;

    // Verificar límite de usuarios del plan
    const [teamData] = await db
      .select({ planName: teams.planName, name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    // Quien ya está por encima del tope se queda; lo que se corta es AGREGAR.
    // Ver puedeAgregarUsuario en lib/config/plans.ts.
    const [{ value: memberCount }] = await db
      .select({ value: count() })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));

    const chequeo = puedeAgregarUsuario(teamData?.planName, memberCount);
    if (!chequeo.permitido) {
      return NextResponse.json(
        { error: chequeo.motivo, code: 'LIMITE_USUARIOS', limite: chequeo.limite, actuales: memberCount },
        { status: 403 },
      );
    }

    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
    }

    const { email, role } = parsed.data;

    // El rol debe existir en el team y no ser owner (owner no es asignable).
    const teamRolesList = await listTeamRoles(teamId);
    if (role === 'owner' || !teamRolesList.some(r => r.key === role)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }

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

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [inv] = await db.insert(invitations).values({
      teamId,
      email,
      role,
      invitedBy: user.id,
      status:    'pending',
      token,
      expiresAt,
    }).returning();

    const inviteUrl = `${baseDeEnlaces()}/invitations/accept?token=${inv.token}`;

    try {
      await sendInvitationEmail(email, user.name, teamData?.name ?? 'Zero', inv.token);
    } catch (e) {
      console.error('[POST /api/equipo/invitaciones] Error sending invitation email:', e);
    }

    return NextResponse.json({ ok: true, inviteToken: inv.token, inviteUrl });
  } catch (err: unknown) {
    // Log the full error (including stack) server-side, but return only a
    // generic message to the client to avoid leaking internals.
    console.error('[POST /api/equipo/invitaciones]', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
