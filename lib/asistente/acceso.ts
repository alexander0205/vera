import 'server-only';
import { NextResponse } from 'next/server';
import { getUser, getTeamIdForUser, getTeamRoleForUser } from '@/lib/db/queries';
import { userCanForTeam } from '@/lib/auth/permissions';

/**
 * Quién puede usar el asistente: quien administra la empresa y puede ver sus
 * reportes. Se decide por PERMISOS y no por el nombre del rol:
 *
 *   - `configuracion:gestionar` lo tienen el dueño y el administrador (y un rol
 *     personalizado al que se le dé), no el cajero ni el lector;
 *   - el administrador de plataforma (soporte de Zero) pasa por el bypass de
 *     `userCanForTeam`, aunque no sea miembro de la empresa que está viendo.
 *
 * El rol y la empresa salen de la sesión; nada de esto viene del cliente.
 */

type Usuario = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export type Acceso =
  | { ok: true; user: Usuario; teamId: number; teamRole: string | null }
  | { ok: false; status: 401 | 403; motivo: string };

export async function evaluarAcceso(): Promise<Acceso> {
  const [user, teamId, teamRole] = await Promise.all([getUser(), getTeamIdForUser(), getTeamRoleForUser()]);
  if (!user) return { ok: false, status: 401, motivo: 'No autenticado' };
  if (!teamId) return { ok: false, status: 403, motivo: 'Sin empresa configurada' };

  const [administra, veReportes] = await Promise.all([
    userCanForTeam(teamId, user.platformRole, teamRole, 'configuracion:gestionar'),
    userCanForTeam(teamId, user.platformRole, teamRole, 'reportes:ver'),
  ]);
  if (!administra) return { ok: false, status: 403, motivo: 'El asistente es para dueños y administradores' };
  if (!veReportes) return { ok: false, status: 403, motivo: 'Tu rol no puede ver reportes' };
  return { ok: true, user, teamId, teamRole };
}

export const sinAcceso = (a: Extract<Acceso, { ok: false }>) =>
  NextResponse.json({ error: a.motivo }, { status: a.status });
