/**
 * El equipo de Zero (administradores de la plataforma) — UNA sola definición.
 *
 * Quién es administrador de la plataforma sale ÚNICAMENTE de
 * `users.platform_role = 'admin'`, leído en el servidor al resolver la sesión
 * (`getUser`). Nunca viene del cliente, de la cookie ni de `team_members`: el
 * rol que alguien tiene DENTRO de una empresa (owner, admin, user…) no tiene
 * nada que ver con este, y una empresa no puede promover a nadie a él.
 *
 * Antes cada guarda repetía `platformRole === 'admin'` por su cuenta, y las que
 * se olvidaron dejaban al equipo de Zero fuera de pantallas y rutas de
 * empresas ajenas. Todo lo nuevo pregunta aquí.
 *
 * Este archivo es puro (sin base ni `server-only`) para poder usarse y probarse
 * en cualquier lado. La auditoría vive en `plataforma-auditoria.ts`.
 */

export interface ConRolDePlataforma {
  platformRole?: string | null;
}

/** ¿Es del equipo de Zero? Recibe el usuario ya resuelto por el servidor. */
export function esAdminPlataforma(user: ConRolDePlataforma | null | undefined): boolean {
  return user?.platformRole === 'admin';
}

/**
 * Rol que se usa para comprobaciones del tipo «¿es el propietario?» cuando
 * quien mira es del equipo de Zero. Entra a cualquier empresa sin ser miembro,
 * y con eso se comporta como su propietario para VER y operar; sus acciones se
 * auditan con su usuario real (`auditarAccionPlataforma`).
 */
export const ROL_EFECTIVO_PLATAFORMA = 'owner';

/**
 * El rol efectivo en la empresa: el del admin de plataforma es siempre el de
 * propietario; el de cualquier otra persona, el que tiene en `team_members`.
 */
export function rolEfectivoEnEmpresa(
  user: ConRolDePlataforma | null | undefined,
  rolDeMiembro: string | null | undefined,
): string | null {
  if (esAdminPlataforma(user)) return ROL_EFECTIVO_PLATAFORMA;
  return rolDeMiembro ?? null;
}

/**
 * ¿El permiso es de LECTURA o de acceso? (`:ver`, `:exportar`, `modulo:*`).
 * Lo demás se considera una acción que cambia algo y se audita cuando la hace
 * alguien del equipo de Zero en una empresa.
 */
export function permisoEsDeLectura(permiso: string): boolean {
  return permiso.endsWith(':ver') || permiso.endsWith(':exportar') || permiso.startsWith('modulo:');
}
