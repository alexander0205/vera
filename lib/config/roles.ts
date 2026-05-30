/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  FUENTE DE VERDAD — Roles y permisos de EmiteDO                 ║
 * ║                                                                  ║
 * ║  Para agregar un rol nuevo:                                      ║
 * ║  1. Agregar entrada en ROLES array                               ║
 * ║  2. Agregar al enum roleEnum en lib/db/schema.ts                 ║
 * ║  3. El resto del sistema lo lee de aquí                          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Permisos granulares del sistema.
 * Formato: "recurso:accion"
 *
 * Para agregar un permiso nuevo:
 * 1. Agregarlo aquí en el tipo Permission
 * 2. Asignarlo a los roles que corresponda en ROLES
 * 3. Usar roleHasPermission() en las rutas API o componentes que lo necesiten
 */
export type Permission =
  // Facturas
  | 'facturas:ver'
  | 'facturas:crear'
  | 'facturas:editar'
  | 'facturas:anular'
  | 'facturas:exportar'
  | 'facturas:emitir-dgii'
  // Clientes
  | 'clientes:ver'
  | 'clientes:gestionar'
  // Productos
  | 'productos:ver'
  | 'productos:gestionar'
  // Cotizaciones
  | 'cotizaciones:ver'
  | 'cotizaciones:gestionar'
  // Reportes
  | 'reportes:ver'
  // Equipo
  | 'equipo:ver'
  | 'equipo:gestionar'
  // Configuración de empresa
  | 'configuracion:ver'
  | 'configuracion:gestionar'
  // Suscripción / billing
  | 'suscripcion:gestionar';

export type RoleKey = 'owner' | 'admin' | 'user' | 'contador' | 'vendedor' | 'member';
// Nota: contador/vendedor/member quedan como compat con datos legacy.
// Roles activos para nuevas invitaciones: owner | admin | user.

export interface RoleDef {
  key: RoleKey;
  label: string;
  description: string;
  /**
   * Si true, puede ser asignado al invitar a un usuario.
   * 'owner' nunca es asignable al invitar — solo hay un owner.
   */
  invitable: boolean;
  permissions: Permission[];
  ui: {
    /** Clases Tailwind para el badge de rol */
    color: string;
    /** Nombre del icono de lucide-react */
    icon: string;
  };
}

// ─── Definición de roles ───────────────────────────────────────────────────────
// El orden aquí determina el orden en los selectores de la UI

export const ROLES: RoleDef[] = [
  {
    key:         'owner',
    label:       'Propietario',
    description: 'Control total de la cuenta y el equipo',
    invitable:   false,
    permissions: [
      'facturas:ver', 'facturas:crear', 'facturas:editar', 'facturas:anular', 'facturas:exportar', 'facturas:emitir-dgii',
      'clientes:ver', 'clientes:gestionar',
      'productos:ver', 'productos:gestionar',
      'cotizaciones:ver', 'cotizaciones:gestionar',
      'reportes:ver',
      'equipo:ver', 'equipo:gestionar',
      'configuracion:ver', 'configuracion:gestionar',
      'suscripcion:gestionar',
    ],
    ui: { color: 'text-amber-600 bg-amber-50 border-amber-200',   icon: 'Crown'       },
  },
  {
    key:         'admin',
    label:       'Administrador',
    description: 'Acceso total excepto gestionar la suscripción',
    invitable:   true,
    permissions: [
      'facturas:ver', 'facturas:crear', 'facturas:editar', 'facturas:anular', 'facturas:exportar', 'facturas:emitir-dgii',
      'clientes:ver', 'clientes:gestionar',
      'productos:ver', 'productos:gestionar',
      'cotizaciones:ver', 'cotizaciones:gestionar',
      'reportes:ver',
      'equipo:ver', 'equipo:gestionar',
      'configuracion:ver', 'configuracion:gestionar',
    ],
    ui: { color: 'text-purple-600 bg-purple-50 border-purple-200', icon: 'Shield'     },
  },
  {
    key:         'user',
    label:       'Usuario',
    description: 'Acceso operativo: facturas, clientes, productos, reportes. Sin configuración ni equipo.',
    invitable:   true,
    permissions: [
      'facturas:ver', 'facturas:crear', 'facturas:exportar', 'facturas:emitir-dgii',
      // facturas:editar y facturas:anular NO incluidos — debe pedirle al admin
      'clientes:ver', 'clientes:gestionar',
      'productos:ver', 'productos:gestionar',
      'cotizaciones:ver', 'cotizaciones:gestionar',
      'reportes:ver',
      'equipo:ver',
    ],
    ui: { color: 'text-teal-600 bg-teal-50 border-teal-200',       icon: 'User'       },
  },
  // ── Roles legacy (DB rows existentes) — mismos permisos que 'user' por compat
  {
    key:         'contador',
    label:       'Contador (legacy)',
    description: 'Rol legacy — mapea a Usuario',
    invitable:   false,
    permissions: [
      'facturas:ver', 'facturas:crear', 'facturas:exportar', 'facturas:emitir-dgii',
      'clientes:ver', 'clientes:gestionar',
      'productos:ver', 'productos:gestionar',
      'cotizaciones:ver', 'cotizaciones:gestionar',
      'reportes:ver',
      'equipo:ver',
    ],
    ui: { color: 'text-gray-600 bg-gray-50 border-gray-200',       icon: 'User'       },
  },
  {
    key:         'vendedor',
    label:       'Vendedor (legacy)',
    description: 'Rol legacy — mapea a Usuario',
    invitable:   false,
    permissions: [
      'facturas:ver', 'facturas:crear', 'facturas:exportar', 'facturas:emitir-dgii',
      'clientes:ver', 'clientes:gestionar',
      'productos:ver', 'productos:gestionar',
      'cotizaciones:ver', 'cotizaciones:gestionar',
      'reportes:ver',
      'equipo:ver',
    ],
    ui: { color: 'text-gray-600 bg-gray-50 border-gray-200',       icon: 'User'       },
  },
  {
    key:         'member',
    label:       'Miembro (legacy)',
    description: 'Rol legacy — mapea a Usuario',
    invitable:   false,
    permissions: [
      'facturas:ver', 'facturas:crear', 'facturas:exportar', 'facturas:emitir-dgii',
      'clientes:ver', 'clientes:gestionar',
      'productos:ver', 'productos:gestionar',
      'cotizaciones:ver', 'cotizaciones:gestionar',
      'reportes:ver',
      'equipo:ver',
    ],
    ui: { color: 'text-gray-600 bg-gray-50 border-gray-200',       icon: 'User'       },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Busca un rol por su clave. */
export function getRole(key: string | null | undefined): RoleDef | undefined {
  return ROLES.find(r => r.key === key);
}

/** ¿El rol tiene este permiso? */
export function roleHasPermission(
  roleKey: string | null | undefined,
  permission: Permission,
): boolean {
  return getRole(roleKey)?.permissions.includes(permission) ?? false;
}

/**
 * ¿El user puede ejecutar esta acción en el team activo?
 *
 * Regla: platform admin (users.platformRole='admin') siempre tiene acceso
 * a cualquier team y cualquier permiso — no requiere membership. Para el
 * resto, se chequea el rol del team_member contra el catálogo de permisos.
 *
 * Esto evita el bug "Sin permiso" cuando un platform admin accede a un
 * team donde no tiene fila en team_members.
 */
export function userCan(
  platformRole: string | null | undefined,
  teamMemberRole: string | null | undefined,
  permission: Permission,
): boolean {
  if (platformRole === 'admin') return true;
  return roleHasPermission(teamMemberRole, permission);
}

/** Roles que pueden ser asignados al invitar (excluye 'owner'). */
export const INVITABLE_ROLES: RoleDef[] = ROLES.filter(r => r.invitable);

/** Claves de todos los roles para validación (Zod enum, etc). */
export const ROLE_KEYS = ROLES.map(r => r.key) as [RoleKey, ...RoleKey[]];

/** Claves de roles invitables para validación. */
export const INVITABLE_ROLE_KEYS = INVITABLE_ROLES.map(r => r.key) as [RoleKey, ...RoleKey[]];
