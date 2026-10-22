import { getUser, getTeamIdForUser, getTeamRoleForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ALL_PERMISSIONS, type Permission } from '@/lib/config/roles';
import { getEffectivePermissions } from '@/lib/auth/permissions';
import { getUserModules, type ModuleKey } from '@/lib/auth/modules';
import { pantallasOcultasDe } from '@/lib/auth/pantallas';

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json(null);
  // Safe projection — nunca enviar passwordHash, twoFactorSecret, etc. al cliente
  const { passwordHash, twoFactorSecret, deletedAt, ...safe } = user;

  // Rol en el team activo + catálogo de permisos efectivos.
  // El cliente (usePermissions) usa esto para gating de la UI.
  const teamId = await getTeamIdForUser();
  const teamRole = teamId ? await getTeamRoleForUser() : null;

  // Las tres lecturas dependen solo del team y del rol: van a la vez. Esta ruta
  // se pide en cada carga de cada módulo, y en fila sumaban sus esperas.
  const [permissions, modules, pantallasOcultas] = await Promise.all([
    // platformRole='admin' → acceso total (espejo de userCanForTeam). Para el
    // resto, permisos efectivos del rol en el team (con overrides por empresa).
    user.platformRole === 'admin'
      ? Promise.resolve<Permission[]>([...ALL_PERMISSIONS])
      : (teamId ? getEffectivePermissions(teamId, teamRole) : Promise.resolve<Permission[]>([])),
    // Módulos accesibles para este usuario en el team activo (módulos de la
    // empresa ∩ permisos modulo:* del rol). El module-switcher usa esto.
    teamId ? getUserModules(teamId, user.platformRole, teamRole) : Promise.resolve<ModuleKey[]>([]),
    // Pantallas que el dueño le apagó a este rol: el menú de cada módulo y su
    // bloqueo las leen de aquí. En caché, y no lanza.
    teamId ? pantallasOcultasDe(teamId, user.platformRole, teamRole) : Promise.resolve<string[]>([]),
  ]);

  return Response.json({ ...safe, teamRole, permissions, modules, pantallasOcultas });
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
  const { clearSession } = await import('@/lib/auth/session');
  await clearSession();
  return Response.json({ success: true });
}
