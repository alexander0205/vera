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
import { getUser, getTeamIdForUser, getTeamRoleForUser } from '@/lib/db/queries';
import { userCan, type Permission } from '@/lib/config/roles';
import { userCanForTeam } from '@/lib/auth/permissions';
import { getUserModules, type ModuleKey } from '@/lib/auth/modules';

// Perf: getUser (platformRole), getTeamIdForUser y getTeamRoleForUser están
// memoizados con React.cache — llamarlos en cada guard es 0 queries extra
// dentro del mismo request. Antes cada guard consultaba users + team_members
// por su cuenta (2 queries × cada guard por página).

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

  const teamRole = await getTeamRoleForUser();
  if (!(await userCanForTeam(teamId, user.platformRole, teamRole, perm))) {
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

  const teamRole = await getTeamRoleForUser();
  const ok = perms.some(perm => userCan(user.platformRole, teamRole, perm));
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

  const teamRole = await getTeamRoleForUser();
  const mods = await getUserModules(teamId, user.platformRole, teamRole);
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

  const teamRole = await getTeamRoleForUser();
  return userCanForTeam(teamId, user.platformRole, teamRole, perm);
}
