import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { users, teamMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getRole, ROLES, type Permission } from '@/lib/config/roles';

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json(null);
  // Safe projection — nunca enviar passwordHash, twoFactorSecret, etc. al cliente
  const { passwordHash, twoFactorSecret, deletedAt, ...safe } = user;

  // Rol en el team activo + catálogo de permisos efectivos.
  // El cliente (usePermissions) usa esto para gating de la UI.
  const teamId = await getTeamIdForUser();
  let teamRole: string | null = null;
  if (teamId) {
    const [m] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
      .limit(1);
    teamRole = m?.role ?? null;
  }

  // platformRole='admin' → acceso total (espejo de userCan). Para el resto, los
  // permisos salen del catálogo del rol del team.
  const permissions: Permission[] =
    user.platformRole === 'admin'
      ? Array.from(new Set(ROLES.flatMap(r => r.permissions)))
      : (getRole(teamRole)?.permissions ?? []);

  return Response.json({ ...safe, teamRole, permissions });
}

export async function PATCH(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  const body = await req.json();
  const name = body?.name?.trim();
  if (!name) return Response.json({ error: 'Nombre requerido' }, { status: 400 });
  if (name.length > 100) return Response.json({ error: 'Nombre muy largo' }, { status: 400 });

  await db.update(users).set({ name }).where(eq(users.id, user.id));
  return Response.json({ success: true, name });
}

export async function DELETE() {
  const { cookies } = await import('next/headers');
  (await cookies()).delete('session');
  return Response.json({ success: true });
}
