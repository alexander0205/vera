/**
 * Quién es la persona que mira la campana y qué tipos de aviso le tocan.
 *
 * Las rutas de /api/notificaciones no piden UN permiso fijo como el resto del
 * sistema: lo que cada persona ve depende de los suyos (ver `PERMISOS_POR_TIPO`).
 * Aquí se resuelve la sesión, la empresa activa y esos tipos de una vez.
 */

import 'server-only';
import { NextResponse } from 'next/server';
import { getUser, getTeamIdForUser, getTeamRoleForUser } from '@/lib/db/queries';
import { getEffectivePermissions } from '@/lib/auth/permissions';
import { ALL_PERMISSIONS } from '@/lib/config/roles';
import { tiposVisibles, type TipoDeEmpresa } from './tipos';

type Usuario = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export type Acceso =
  | { ok: true; user: Usuario; teamId: number; tipos: TipoDeEmpresa[] }
  | { ok: false; response: NextResponse };

export async function exigirAcceso(): Promise<Acceso> {
  const [user, teamId, teamRole] = await Promise.all([getUser(), getTeamIdForUser(), getTeamRoleForUser()]);
  if (!user) return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  if (!teamId) return { ok: false, response: NextResponse.json({ error: 'Sin empresa configurada' }, { status: 403 }) };

  // Mismo trato que `userCanForTeam`: el equipo de Zero lo ve todo.
  const permisos = user.platformRole === 'admin'
    ? ALL_PERMISSIONS
    : await getEffectivePermissions(teamId, teamRole);
  return { ok: true, user, teamId, tipos: tiposVisibles(permisos) };
}
