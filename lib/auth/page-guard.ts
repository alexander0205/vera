/**
 * page-guard.ts — Helpers para gates server-side a nivel de página.
 *
 * Uso en page.tsx (Server Component):
 *
 *   import { requirePermission } from '@/lib/auth/page-guard';
 *   export default async function Page() {
 *     await requirePermission('facturas:crear');
 *     // ... resto del render
 *   }
 *
 * Si el user no tiene permiso, redirige a /dashboard (cierra el agujero
 * de PERM-03/05/06/07 — sidebar oculta el link pero la URL directa pasaba).
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { users, teamMembers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { userCan, type Permission } from '@/lib/config/roles';
import { userCanForTeam } from '@/lib/auth/permissions';
import { getUserModules, type ModuleKey } from '@/lib/auth/modules';

/**
 * Verifica el permiso. Si falla:
 *  - sin sesión → /sign-in
 *  - sin team   → /dashboard/empresas
 *  - sin permiso→ /dashboard
 */
export async function requirePermission(perm: Permission): Promise<void> {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard/empresas');

  const [u] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!(await userCanForTeam(teamId, u?.platformRole, m?.role, perm))) {
    redirect('/dashboard');
  }
}

/**
 * Como requirePermission, pero pasa si el user tiene AL MENOS UNO de los
 * permisos dados. Útil cuando una misma ruta sirve a casos de uso distintos
 * con permisos distintos (ej: /dashboard/compras sirve tanto a quien ve
 * e-CF de proveedores como a quien solo registra entradas de inventario).
 */
export async function requirePermissionAny(perms: Permission[]): Promise<void> {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard/empresas');

  const [u] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  const ok = perms.some(perm => userCan(u?.platformRole, m?.role, perm));
  if (!ok) redirect('/dashboard');
}

/**
 * Gate de módulo a nivel de página. Verifica que el usuario tenga acceso al
 * módulo (empresa ∩ rol). Si falla redirige a la ruta indicada (default:
 * /sin-acceso, que muestra el switcher de módulos disponibles).
 */
export async function requireModule(
  mod: ModuleKey,
  fallback = '/sin-acceso',
): Promise<void> {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/dashboard/empresas');

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  const mods = await getUserModules(teamId, user.platformRole, m?.role);
  if (!mods.includes(mod)) redirect(fallback);
}

/**
 * Versión no-redirect: devuelve true/false en lugar de redirigir.
 * Útil cuando la página quiere renderizar un mensaje de error inline
 * en vez de redirigir silenciosamente al dashboard.
 *
 * Uso:
 *   const canEdit = await hasPermission('facturas:editar');
 *   if (!canEdit) return <SinPermisosUI />;
 */
export async function hasPermission(perm: Permission): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;

  const teamId = await getTeamIdForUser();
  if (!teamId) return false;

  const [u] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const [m] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, user.id), eq(teamMembers.teamId, teamId)))
    .limit(1);

  return userCanForTeam(teamId, u?.platformRole, m?.role, perm);
}
