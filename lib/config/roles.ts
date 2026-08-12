/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  FUENTE DE VERDAD — Roles y permisos de EmiteDO                 ║
 * ║                                                                  ║
 * ║  Para agregar un rol nuevo:                                      ║
 * ║  1. Agregar entrada en ROLES array y a RoleKey                   ║
 * ║  2. El resto del sistema lo lee de aquí — listTeamRoles siembra  ║
 * ║     los roles de sistema que falten en cada empresa              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { BILLING_ENABLED } from '@/lib/config/billing';

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
  // Elegir manualmente la fecha de emisión (facturas sin-ncf / borrador) —
  // para registrar cobros de fechas pasadas. Solo admin/owner.
  | 'facturas:fecha-personalizada'
  // Pagos recibidos (módulo de cobros)
  | 'pagos:ver'
  // Clientes
  | 'clientes:ver'
  | 'clientes:gestionar'
  // Productos
  | 'productos:ver'
  | 'productos:gestionar'
  // Maestros (listas custom de atributos) — solo admin/owner
  | 'maestros:gestionar'
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
  // Compras / Facturas recibidas
  | 'compras:ver'
  // Cuadre de caja
  | 'caja:ver'       // ver estado de caja, turnos e historial
  | 'caja:operar'    // abrir turno, registrar movimientos, solicitar cierre (cajero)
  | 'caja:aprobar'   // aprobar/rechazar cierres con descuadre, ajustes (supervisor)
  // Punto de venta (POS)
  | 'pos:vender'     // abrir terminal, vender y cobrar en el POS (cajero)
  | 'pos:configurar' // crear/editar terminales y config del POS (admin/owner)
  | 'pos:anular'     // editar/eliminar/anular/unsettle recibos ya cobrados (admin/owner)
  | 'pos:quitar-item-pin' // cajero: quitar un ítem de un recibo cobrado autorizando con el PIN de un supervisor
  // Acceso por módulo del producto (facturación / POS). El acceso efectivo de
  // un usuario a un módulo = módulo activo en la empresa (teams.modulosHabilitados)
  // ∩ este permiso en su rol. Ver lib/auth/modules.ts.
  | 'modulo:facturacion'
  | 'modulo:administracion'
  | 'modulo:pos'
  | 'modulo:escolar'
  // Suscripción / billing
  | 'suscripcion:gestionar'
  // Administración escolar
  | 'administracion-escolar:ver'
  | 'administracion-escolar:gestionar'
  | 'administracion-escolar:configurar'
  | 'administracion-escolar:pagos'
  // Contabilidad — agrupa lo fiscal (secuencias, consulta de e-NCF) y el motor
  // contable (catálogo de cuentas, asientos, libro diario, reportes).
  | 'contabilidad:ver'        // consultar secuencias, e-NCF, asientos y reportes
  | 'contabilidad:gestionar'  // crear/editar/anular asientos manuales
  | 'contabilidad:configurar';// catálogo de cuentas y cuentas automáticas

export type RoleKey = 'owner' | 'admin' | 'user' | 'lector' | 'cajero' | 'personal-escolar';
// Roles de sistema. user→"Vendedor", lector→"Auditor" en la UI (ver labels abajo).
// Roles legacy (contador/vendedor/member) fueron remapeados a 'user' en la
// migración 0051; LEGACY_ROLE_MAP los normaliza por si quedan datos viejos.

/** Mapea claves de roles legacy a su rol de sistema equivalente. */
export const LEGACY_ROLE_MAP: Record<string, RoleKey> = {
  contador: 'user',
  vendedor: 'user',
  member: 'user',
};

/** Normaliza una clave de rol legacy a su rol de sistema actual. */
export function normalizeRoleKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return LEGACY_ROLE_MAP[key] ?? key;
}

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
      'facturas:ver', 'facturas:crear', 'facturas:editar', 'facturas:anular', 'facturas:exportar', 'facturas:emitir-dgii', 'facturas:fecha-personalizada',
      'pagos:ver',
      'clientes:ver', 'clientes:gestionar',
      'productos:ver', 'productos:gestionar',
      'cotizaciones:ver', 'cotizaciones:gestionar',
      'reportes:ver',
      'equipo:ver', 'equipo:gestionar',
      'configuracion:ver', 'configuracion:gestionar',
      'compras:ver',
      'maestros:gestionar',
      'caja:ver', 'caja:operar', 'caja:aprobar',
      'pos:vender', 'pos:configurar', 'pos:anular', 'pos:quitar-item-pin',
      'modulo:facturacion', 'modulo:administracion', 'modulo:pos', 'modulo:escolar',
      'suscripcion:gestionar',
      'administracion-escolar:ver', 'administracion-escolar:gestionar', 'administracion-escolar:configurar', 'administracion-escolar:pagos',
      'contabilidad:ver', 'contabilidad:gestionar', 'contabilidad:configurar',
    ],
    ui: { color: 'text-amber-600 bg-amber-50 border-amber-200',   icon: 'Crown'       },
  },
  {
    key:         'admin',
    label:       'Administrador',
    description: 'Acceso total excepto gestionar la suscripción',
    invitable:   true,
    permissions: [
      'facturas:ver', 'facturas:crear', 'facturas:editar', 'facturas:anular', 'facturas:exportar', 'facturas:emitir-dgii', 'facturas:fecha-personalizada',
      'pagos:ver',
      'clientes:ver', 'clientes:gestionar',
      'productos:ver', 'productos:gestionar',
      'cotizaciones:ver', 'cotizaciones:gestionar',
      'reportes:ver',
      'equipo:ver', 'equipo:gestionar',
      'configuracion:ver', 'configuracion:gestionar',
      'compras:ver',
      'maestros:gestionar',
      'caja:ver', 'caja:operar', 'caja:aprobar',
      'administracion-escolar:ver', 'administracion-escolar:gestionar', 'administracion-escolar:configurar', 'administracion-escolar:pagos',
      'contabilidad:ver', 'contabilidad:gestionar', 'contabilidad:configurar',
      'pos:vender', 'pos:configurar', 'pos:anular', 'pos:quitar-item-pin',
      'modulo:facturacion', 'modulo:administracion', 'modulo:pos', 'modulo:escolar',
    ],
    ui: { color: 'text-purple-600 bg-purple-50 border-purple-200', icon: 'Shield'     },
  },
  {
    key:         'user',
    label:       'Vendedor',
    description: 'Acceso operativo: factura, cobra, clientes, productos, compras y reportes. Sin editar/anular, configuración ni equipo.',
    invitable:   true,
    permissions: [
      'facturas:ver', 'facturas:crear', 'facturas:exportar', 'facturas:emitir-dgii',
      // facturas:editar y facturas:anular NO incluidos — debe pedirle al admin
      'clientes:ver', 'clientes:gestionar',
      'productos:ver', 'productos:gestionar',
      'cotizaciones:ver', 'cotizaciones:gestionar',
      'reportes:ver',
      'compras:ver',
      'equipo:ver',
      'caja:ver', 'caja:operar',
      // Sin permisos de Administración Escolar: un vendedor no matricula
      // estudiantes. El colegio se atiende con 'personal-escolar'.
      // Solo lectura contable: el vendedor consulta secuencias y e-NCF, no toca asientos.
      'contabilidad:ver',
      'pos:vender', 'pos:quitar-item-pin',
      'modulo:facturacion', 'modulo:administracion', 'modulo:pos',
    ],
    ui: { color: 'text-zero-600 bg-zero-50 border-zero-200',       icon: 'User'       },
  },
  {
    key:         'lector',
    label:       'Auditor',
    description: 'Ve todo (facturas, compras, configuración, caja e informes) en solo lectura. No crea ni modifica nada.',
    invitable:   true,
    permissions: [
      'facturas:ver', 'facturas:exportar',
      'clientes:ver',
      'productos:ver',
      'cotizaciones:ver',
      'reportes:ver',
      'equipo:ver',
      'configuracion:ver',
      'compras:ver',
      'caja:ver',
      'modulo:facturacion', 'modulo:administracion',
      // Sin 'modulo:escolar': ver el colegio en solo lectura solo aplica si el
      // dueño le abre el módulo a este rol.
      'administracion-escolar:ver',
      'contabilidad:ver',
    ],
    ui: { color: 'text-sky-600 bg-sky-50 border-sky-200', icon: 'Eye' },
  },
  {
    key:         'cajero',
    label:       'Cajero (solo POS)',
    description: 'Solo Punto de Venta: vende, cobra, opera caja y usa productos/contactos. No entra a Facturación.',
    invitable:   true,
    permissions: [
      'clientes:ver', 'clientes:gestionar',
      'productos:ver',
      'caja:ver', 'caja:operar',
      'pos:vender', 'pos:quitar-item-pin',
      'modulo:pos', 'modulo:administracion',
    ],
    ui: { color: 'text-zero-600 bg-zero-50 border-zero-200', icon: 'Store' },
  },
  {
    key:         'personal-escolar',
    label:       'Personal del colegio',
    description: 'Solo Administración Escolar: estudiantes, tutores, matrículas y cobros del colegio. No entra a Facturación ni al POS.',
    invitable:   true,
    permissions: [
      // Los cargos escolares se cobran con facturas y los tutores son
      // contactos: necesita verlos, aunque no entre al módulo de Facturación.
      'clientes:ver', 'clientes:gestionar',
      'facturas:ver',
      'administracion-escolar:ver', 'administracion-escolar:gestionar', 'administracion-escolar:pagos',
      'modulo:escolar', 'modulo:administracion',
    ],
    ui: { color: 'text-indigo-600 bg-indigo-50 border-indigo-200', icon: 'GraduationCap' },
  },
];

// ─── Catálogo de permisos (para la UI de la matriz) ─────────────────────────
// Agrupado por módulo, con etiquetas legibles. Fuente única para la pantalla
// de permisos y la API. El orden define el orden visual.

export interface PermissionDef {
  key: Permission;
  label: string;
}
export interface PermissionGroup {
  module: string;       // etiqueta del módulo
  icon: string;         // icono lucide-react
  permissions: PermissionDef[];
}

export const PERMISSION_CATALOG: PermissionGroup[] = [
  { module: 'Facturas', icon: 'FileText', permissions: [
    { key: 'facturas:ver',         label: 'Ver facturas' },
    { key: 'facturas:crear',       label: 'Crear factura' },
    { key: 'facturas:editar',      label: 'Editar (borrador)' },
    { key: 'facturas:anular',      label: 'Anular' },
    { key: 'facturas:exportar',    label: 'Exportar (PDF/CSV/XML)' },
    { key: 'facturas:emitir-dgii', label: 'Emitir a DGII (e-CF)' },
    { key: 'facturas:fecha-personalizada', label: 'Elegir fecha de emisión (sin NCF)' },
  ]},
  { module: 'Pagos', icon: 'Wallet', permissions: [
    { key: 'pagos:ver', label: 'Ver pagos recibidos' },
  ]},
  { module: 'Clientes', icon: 'Users', permissions: [
    { key: 'clientes:ver',       label: 'Ver clientes' },
    { key: 'clientes:gestionar', label: 'Crear / editar / eliminar' },
  ]},
  { module: 'Productos', icon: 'Package', permissions: [
    { key: 'productos:ver',       label: 'Ver productos' },
    { key: 'productos:gestionar', label: 'Crear / editar / eliminar' },
    { key: 'maestros:gestionar',  label: 'Gestionar maestros (atributos)' },
  ]},
  { module: 'Cotizaciones', icon: 'FileSpreadsheet', permissions: [
    { key: 'cotizaciones:ver',       label: 'Ver cotizaciones' },
    { key: 'cotizaciones:gestionar', label: 'Crear / editar / eliminar' },
  ]},
  { module: 'Compras', icon: 'ShoppingCart', permissions: [
    { key: 'compras:ver', label: 'Ver compras' },
  ]},
  { module: 'Reportes', icon: 'BarChart3', permissions: [
    { key: 'reportes:ver', label: 'Ver reportes' },
  ]},
  { module: 'Caja', icon: 'Wallet', permissions: [
    { key: 'caja:ver',     label: 'Ver caja e historial' },
    { key: 'caja:operar',  label: 'Abrir turno / registrar movimientos' },
    { key: 'caja:aprobar', label: 'Aprobar cierres y descuadres' },
  ]},
  { module: 'Punto de venta', icon: 'Store', permissions: [
    { key: 'pos:vender',          label: 'Vender y cobrar (cajero)' },
    { key: 'pos:configurar',      label: 'Configurar terminales del POS' },
    { key: 'pos:anular',          label: 'Editar / eliminar / anular recibos cobrados (admin)' },
    { key: 'pos:quitar-item-pin', label: 'Quitar ítem de un recibo con PIN de supervisor' },
  ]},
  { module: 'Acceso a módulos', icon: 'LayoutGrid', permissions: [
    { key: 'modulo:facturacion',    label: 'Acceso al módulo Facturación' },
    { key: 'modulo:administracion', label: 'Acceso al módulo Administración' },
    { key: 'modulo:pos',            label: 'Acceso al módulo Punto de Venta' },
    { key: 'modulo:escolar',        label: 'Acceso al módulo Administración Escolar' },
  ]},
  { module: 'Equipo', icon: 'UserCog', permissions: [
    { key: 'equipo:ver',       label: 'Ver equipo' },
    { key: 'equipo:gestionar', label: 'Invitar / gestionar miembros y roles' },
  ]},
  { module: 'Configuración', icon: 'Settings', permissions: [
    { key: 'configuracion:ver',       label: 'Ver configuración' },
    { key: 'configuracion:gestionar', label: 'Editar configuración' },
  ]},
  // Suscripción solo se le ofrece al usuario con el billing activo; mientras
  // tanto no hay plan que gestionar. Ver lib/config/billing.
  ...(BILLING_ENABLED ? [{ module: 'Suscripción', icon: 'CreditCard', permissions: [
    { key: 'suscripcion:gestionar' as Permission, label: 'Gestionar plan y pagos' },
  ]}] : []),
  { module: 'Administración escolar', icon: 'GraduationCap', permissions: [
    { key: 'administracion-escolar:ver',         label: 'Ver estudiantes, matrículas, cargos y pagos' },
    { key: 'administracion-escolar:gestionar',    label: 'Crear / editar estudiantes, tutores, cursos y matrículas' },
    { key: 'administracion-escolar:configurar',   label: 'Configurar períodos, cursos, materias y conceptos' },
    { key: 'administracion-escolar:pagos',        label: 'Registrar pagos escolares' },
  ]},
  { module: 'Contabilidad', icon: 'BookOpen', permissions: [
    { key: 'contabilidad:ver',        label: 'Ver secuencias, e-NCF, asientos y reportes contables' },
    { key: 'contabilidad:gestionar',  label: 'Crear / editar / anular asientos manuales' },
    { key: 'contabilidad:configurar', label: 'Configurar catálogo de cuentas y cuentas automáticas' },
  ]},
];

/** Todos los permisos del sistema (orden del catálogo). */
export const ALL_PERMISSIONS: Permission[] =
  PERMISSION_CATALOG.flatMap(g => g.permissions.map(p => p.key));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Busca un rol por su clave (normaliza claves legacy a su rol de sistema). */
export function getRole(key: string | null | undefined): RoleDef | undefined {
  const norm = normalizeRoleKey(key);
  return ROLES.find(r => r.key === norm);
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
