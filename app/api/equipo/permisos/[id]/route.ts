/**
 * PATCH  /api/equipo/permisos/[id]  — edita label/descripción y/o permisos.
 * DELETE /api/equipo/permisos/[id]  — borra un rol personalizado.
 *
 * Reglas:
 *  - owner NO es editable ni borrable (siempre full).
 *  - roles de sistema (admin/user/lector) se pueden editar pero NO borrar.
 *  - al borrar un rol custom, sus miembros e invitaciones pasan a 'user'.
 *
 * Guard: equipo:gestionar.
 */

import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamRoles, teamRolePermissions, teamMembers, invitations } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { ALL_PERMISSIONS } from '@/lib/config/roles';

const ALL = new Set<string>(ALL_PERMISSIONS);
const FALLBACK_ROLE = 'user';

type Ctx = { params: Promise<{ id: string }> };

async function loadRole(teamId: number, id: number) {
  const [r] = await db
    .select()
    .from(teamRoles)
    .where(and(eq(teamRoles.id, id), eq(teamRoles.teamId, teamId)))
    .limit(1);
  return r ?? null;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requirePermission('equipo:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const role = await loadRole(teamId, id);
  if (!role) return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
  if (role.key === 'owner') {
    return NextResponse.json({ error: 'El rol Propietario no es editable' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

  // ── Editar label / descripción ──────────────────────────────────────────
  const updates: { label?: string; description?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (typeof body.label === 'string') {
    const label = body.label.trim();
    if (!label) return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 });
    if (label.length > 60) return NextResponse.json({ error: 'Nombre muy largo' }, { status: 400 });
    updates.label = label;
  }
  if (typeof body.description === 'string') {
    updates.description = body.description.trim().slice(0, 255);
  }
  if (updates.label !== undefined || updates.description !== undefined) {
    await db.update(teamRoles).set(updates).where(eq(teamRoles.id, id));
  }

  // ── Reemplazar permisos ───────────────────────────────────────────────────
  if (Array.isArray(body.permissions)) {
    const perms: string[] = [...new Set((body.permissions as unknown[]).map(p => String(p)))]
      .filter(p => ALL.has(p));
    await db.delete(teamRolePermissions).where(eq(teamRolePermissions.teamRoleId, id));
    if (perms.length) {
      await db.insert(teamRolePermissions).values(
        perms.map(p => ({ teamRoleId: id, permission: p })),
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requirePermission('equipo:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const role = await loadRole(teamId, id);
  if (!role) return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
  if (role.isSystem) {
    return NextResponse.json({ error: 'Los roles de sistema no se pueden borrar' }, { status: 403 });
  }

  // Reasignar miembros e invitaciones de este rol a 'user'.
  await db.update(teamMembers).set({ role: FALLBACK_ROLE })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, role.key)));
  await db.update(invitations).set({ role: FALLBACK_ROLE })
    .where(and(eq(invitations.teamId, teamId), eq(invitations.role, role.key)));

  // Borra el rol (permisos caen por ON DELETE CASCADE).
  await db.delete(teamRoles).where(eq(teamRoles.id, id));

  return NextResponse.json({ ok: true });
}
