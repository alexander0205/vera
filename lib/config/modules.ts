/**
 * Módulos del producto — constantes compartidas cliente/servidor.
 *
 * La lógica de acceso (DB) vive en lib/auth/modules.ts (server-only).
 * Este archivo solo tiene el catálogo y helpers puros, importables desde
 * componentes cliente (module-switcher, hooks).
 */

export const MODULES = ['facturacion', 'administracion', 'pos', 'escolar'] as const;
export type ModuleKey = (typeof MODULES)[number];

/**
 * Módulos base que toda empresa tiene siempre. No se venden ni se apagan:
 * facturación es el producto, y administración es donde el dueño gestiona su
 * propia empresa, usuarios y roles. El panel admin los muestra activos y no
 * permite desmarcarlos; el resto de módulos sí se encienden uno a uno.
 */
export const MODULES_BASE = ['facturacion', 'administracion'] as const satisfies readonly ModuleKey[];

/** ¿Es un módulo base (siempre activo, no desactivable)? */
export function isBaseModule(mod: ModuleKey): boolean {
  return (MODULES_BASE as readonly ModuleKey[]).includes(mod);
}

/**
 * Cómo se llama cada línea de producto. Se leen siempre detrás de la marca
 * ("Zero · Facturación"), así que aquí va solo la línea, sin repetir el nombre.
 */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  facturacion: 'Facturación',
  administracion: 'Administración',
  pos: 'Punto de Venta',
  escolar: 'Gobernanza de Colegios',
};

/**
 * Módulos de los que depende otro para funcionar. Escolar cobra a través de
 * Facturación (los cargos se saldan con facturas y la mensualidad automática
 * corre sobre facturas recurrentes): sin ese módulo no hay forma de cobrar.
 */
export const MODULE_DEPENDENCIES: Record<ModuleKey, readonly ModuleKey[]> = {
  facturacion: [],
  administracion: [],
  pos: [],
  escolar: ['facturacion'],
};

/** Expande una lista de módulos con sus dependencias (activar escolar activa facturación). */
export function withDependencies(mods: readonly ModuleKey[]): ModuleKey[] {
  const out = new Set<ModuleKey>();
  for (const m of mods) {
    out.add(m);
    for (const dep of MODULE_DEPENDENCIES[m]) out.add(dep);
  }
  return MODULES.filter(m => out.has(m));
}

/** Módulos que dejarían de funcionar si se desactiva `mod` (inverso de las dependencias). */
export function dependentsOf(mod: ModuleKey): ModuleKey[] {
  return MODULES.filter(m => MODULE_DEPENDENCIES[m].includes(mod));
}

export const MODULE_DESCRIPTIONS: Record<ModuleKey, string> = {
  facturacion: 'Facturas, e-CF, clientes, cotizaciones y reportes',
  administracion: 'Mi empresa, usuarios y roles',
  pos: 'Terminal de venta, turnos de caja e inventario en piso',
  escolar: 'Estudiantes, matrículas, cargos y pagos del colegio',
};

/** Icono lucide-react de cada módulo (para switcher y cards). */
export const MODULE_ICONS: Record<ModuleKey, string> = {
  facturacion: 'FileText',
  administracion: 'Building2',
  pos: 'Store',
  escolar: 'GraduationCap',
};

/** Ruta interna raíz de cada módulo (rewrites del proxy apuntan aquí). */
export const MODULE_HOME: Record<ModuleKey, string> = {
  facturacion: '/dashboard',
  administracion: '/cuenta',
  pos: '/pos',
  escolar: '/escolar',
};

/**
 * URL pública de un módulo. En prod cada módulo vive en su subdominio
 * (pos.zero.com.do / facturacion.zero.com.do / escolar.zero.com.do) vía
 * NEXT_PUBLIC_*_URL; en dev cae al path local.
 *
 * Los process.env van literales dentro de la función a propósito: Next los
 * inlinea por coincidencia textual en el bundle cliente, y leerlos en cada
 * llamada (no una vez al importar) mantiene el módulo testeable con stubs.
 */
export function moduleUrl(mod: ModuleKey): string {
  const env =
    mod === 'facturacion'    ? process.env.NEXT_PUBLIC_FACTURACION_URL
    : mod === 'pos'          ? process.env.NEXT_PUBLIC_POS_URL
    : mod === 'escolar'      ? process.env.NEXT_PUBLIC_ESCOLAR_URL
    // Administración no tiene subdominio propio: vive en el mismo host.
    :                          undefined;
  return env || MODULE_HOME[mod];
}

export function sanitizeModules(value: unknown): ModuleKey[] {
  if (!Array.isArray(value)) return [];
  return MODULES.filter(m => value.includes(m));
}

/** Completa una lista con los módulos base, que toda empresa tiene siempre. */
export function withBaseModules(mods: readonly ModuleKey[]): ModuleKey[] {
  const out = new Set<ModuleKey>([...MODULES_BASE, ...mods]);
  return MODULES.filter(m => out.has(m));
}

/**
 * Módulo que sirve un hostname (routing de subdominios en proxy.ts).
 * Match exacto contra POS_HOST/FACTURACION_HOST, o por prefijo del hostname
 * ("pos." / "facturacion.") — así pos.localhost:3000 funciona en dev.
 */
export function moduleForHost(hostHeader: string | null | undefined): ModuleKey | null {
  if (!hostHeader) return null;
  const host = hostHeader.toLowerCase();
  const hostname = host.split(':')[0];
  if (process.env.POS_HOST && host === process.env.POS_HOST) return 'pos';
  if (process.env.FACTURACION_HOST && host === process.env.FACTURACION_HOST) return 'facturacion';
  if (process.env.ESCOLAR_HOST && host === process.env.ESCOLAR_HOST) return 'escolar';
  if (hostname.startsWith('pos.')) return 'pos';
  if (hostname.startsWith('facturacion.')) return 'facturacion';
  if (hostname.startsWith('escolar.')) return 'escolar';
  return null;
}
