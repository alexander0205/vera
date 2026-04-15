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
  | 'facturas:anular'
  | 'facturas:exportar'
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

export type RoleKey = 'owner' | 'admin' | 'contador' | 'vendedor' | 'member';

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
      'facturas:ver', 'facturas:crear', 'facturas:anular', 'facturas:exportar',
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
      'facturas:ver', 'facturas:crear', 'facturas:anular', 'facturas:exportar',
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
    key:         'contador',
    label:       'Contador',
    description: 'Ve y descarga reportes y facturas',
    invitable:   true,
    permissions: [
      'facturas:ver', 'facturas:exportar',
      'clientes:ver',
      'productos:ver',
      'cotizaciones:ver',
      'reportes:ver',
      'equipo:ver',
      'configuracion:ver',
    ],
    ui: { color: 'text-blue-600 bg-blue-50 border-blue-200',       icon: 'BookOpen'   },
  },
  {
    key:         'vendedor',
    label:       'Vendedor',
    description: 'Crea y consulta facturas y cotizaciones',
    invitable:   true,
    permissions: [
      'facturas:ver', 'facturas:crear',
      'clientes:ver', 'clientes:gestionar',
      'productos:ver',
      'cotizaciones:ver', 'cotizaciones:gestionar',
      'equipo:ver',
    ],
    ui: { color: 'text-teal-600 bg-teal-50 border-teal-200',       icon: 'ShoppingBag' },
  },
  {
    key:         'member',
    label:       'Miembro',
    description: 'Acceso básico de lectura',
    invitable:   true,
    permissions: [
      'facturas:ver',
      'clientes:ver',
      'productos:ver',
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

/** Roles que pueden ser asignados al invitar (excluye 'owner'). */
export const INVITABLE_ROLES: RoleDef[] = ROLES.filter(r => r.invitable);

/** Claves de todos los roles para validación (Zod enum, etc). */
export const ROLE_KEYS = ROLES.map(r => r.key) as [RoleKey, ...RoleKey[]];

/** Claves de roles invitables para validación. */
export const INVITABLE_ROLE_KEYS = INVITABLE_ROLES.map(r => r.key) as [RoleKey, ...RoleKey[]];
