/**
 * DELETE /api/equipo/invitaciones/[id] — Cancelar invitación pendiente
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamMembers, invitations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const teamId = await getTeamIdForUser();
    if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

    // Verificar rol del caller en el team activo
    const [callerMember] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
      .limit(1);

    if (!callerMember) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });
    if (callerMember.role !== 'owner' && callerMember.role !== 'admin') {
      return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
    }

    const { id } = await params;
    const invId = parseInt(id);
    if (isNaN(invId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const [inv] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.id, invId), eq(invitations.teamId, teamId)))
      .limit(1);

    if (!inv) return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 });

    await db
      .update(invitations)
      .set({ status: 'cancelled' })
      .where(eq(invitations.id, invId));

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[DELETE /api/equipo/invitaciones/[id]]', err);
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
