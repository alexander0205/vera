/**
 * Módulos del producto — constantes compartidas cliente/servidor.
 *
 * La lógica de acceso (DB) vive en lib/auth/modules.ts (server-only).
 * Este archivo solo tiene el catálogo y helpers puros, importables desde
 * componentes cliente (module-switcher, hooks).
 */

export const MODULES = ['facturacion', 'pos'] as const;
export type ModuleKey = (typeof MODULES)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  facturacion: 'Facturación',
  pos: 'Punto de Venta',
};

export const MODULE_DESCRIPTIONS: Record<ModuleKey, string> = {
  facturacion: 'Facturas, e-CF, clientes, cotizaciones y reportes',
  pos: 'Terminal de venta, turnos de caja e inventario en piso',
};

/** Icono lucide-react de cada módulo (para switcher y cards). */
export const MODULE_ICONS: Record<ModuleKey, string> = {
  facturacion: 'FileText',
  pos: 'Store',
};

/** Ruta interna raíz de cada módulo (rewrites del proxy apuntan aquí). */
export const MODULE_HOME: Record<ModuleKey, string> = {
  facturacion: '/dashboard',
  pos: '/pos',
};

/**
 * URL pública de un módulo. En prod cada módulo vive en su subdominio
 * (pos.zero.com.do / facturacion.zero.com.do) vía NEXT_PUBLIC_*_URL;
 * en dev cae al path local.
 */
export function moduleUrl(mod: ModuleKey): string {
  const envUrl =
    mod === 'pos'
      ? process.env.NEXT_PUBLIC_POS_URL
      : process.env.NEXT_PUBLIC_FACTURACION_URL;
  return envUrl || MODULE_HOME[mod];
}

export function sanitizeModules(value: unknown): ModuleKey[] {
  if (!Array.isArray(value)) return [];
  return MODULES.filter(m => value.includes(m));
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
  if (hostname.startsWith('pos.')) return 'pos';
  if (hostname.startsWith('facturacion.')) return 'facturacion';
  return null;
}
