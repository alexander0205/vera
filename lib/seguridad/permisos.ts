import 'server-only';
import { getTeamRoleForUser } from '@/lib/db/queries';
import { userCanForTeam } from '@/lib/auth/permissions';
import type { Permission } from '@/lib/config/roles';

type Usuario = { platformRole?: string | null };

/** ¿La persona tiene ESTE permiso en la empresa de la sesión? (el rol sale de la sesión, nunca del cuerpo). */
export async function puedeEnEmpresa(user: Usuario, teamId: number, permiso: Permission): Promise<boolean> {
  const rol = await getTeamRoleForUser();
  return userCanForTeam(teamId, user.platformRole, rol, permiso);
}

/**
 * Cobrar: quien registra pagos o quien factura (misma regla que
 * `/api/cuentas-por-cobrar/[docId]/pagos`). Las rutas antiguas de cobro solo
 * pedían estar en la empresa: un rol de solo lectura podía registrar pagos.
 */
export async function puedeCobrar(user: Usuario, teamId: number): Promise<boolean> {
  const rol = await getTeamRoleForUser();
  return (await userCanForTeam(teamId, user.platformRole, rol, 'pagos:registrar'))
    || (await userCanForTeam(teamId, user.platformRole, rol, 'facturas:crear'));
}
