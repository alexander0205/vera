/**
 * PATCH /api/equipo/miembros/[id] — Cambiar rol de un miembro
 * DELETE /api/equipo/miembros/[id] — Eliminar miembro del equipo
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

const ROLES_VALIDOS = ['owner', 'admin', 'contador', 'vendedor', 'member'] as const;

async function getCallerTeam(userId: number) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return null;
  const [row] = await db
    .select({ teamId: teamMembers.teamId, role: teamMembers.role, memberId: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId)))
    .limit(1);
  return row ?? null;
}

// ─── PATCH: cambiar rol ───────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const caller = await getCallerTeam(user.id);
  if (!caller) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });
  if (caller.role !== 'owner') return NextResponse.json({ error: 'Solo el propietario puede cambiar roles' }, { status: 403 });

  const { id } = await params;
  const memberId = parseInt(id);
  if (isNaN(memberId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();
  const parsed = z.object({ role: z.enum(ROLES_VALIDOS) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });

  // Verificar que el miembro pertenece al mismo equipo
  const [target] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, caller.teamId)))
    .limit(1);

  if (!target) return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });

  // No puede cambiar su propio rol
  if (target.userId === user.id) {
    return NextResponse.json({ error: 'No puedes cambiar tu propio rol' }, { status: 400 });
  }

  await db
    .update(teamMembers)
    .set({ role: parsed.data.role })
    .where(eq(teamMembers.id, memberId));

  return NextResponse.json({ ok: true });
}

// ─── DELETE: eliminar miembro ─────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const caller = await getCallerTeam(user.id);
  if (!caller) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const memberId = parseInt(id);
  if (isNaN(memberId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [target] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, caller.teamId)))
    .limit(1);

  if (!target) return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });

  // Solo owner puede eliminar otros; cualquiera puede eliminarse a sí mismo
  const isSelf = target.userId === user.id;
  if (!isSelf && caller.role !== 'owner') {
    return NextResponse.json({ error: 'Solo el propietario puede eliminar miembros' }, { status: 403 });
  }

  // No puede eliminar al único owner
  if (target.role === 'owner') {
    const owners = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, caller.teamId), eq(teamMembers.role, 'owner')));
    if (owners.length <= 1) {
      return NextResponse.json({ error: 'No puedes eliminar al único propietario del equipo' }, { status: 400 });
    }
  }

  await db.delete(teamMembers).where(eq(teamMembers.id, memberId));

  return NextResponse.json({ ok: true });
}
