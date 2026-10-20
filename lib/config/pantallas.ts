/**
 * Pantallas que el dueño puede mostrar u ocultar por rol.
 *
 * Son dos, las portadas de cada módulo:
 *   - Panorama      → Gobernanza (Administración Escolar)
 *   - Dashboard     → Facturación
 *
 * Los permisos (lib/config/roles.ts) siguen mandando lo que cada rol puede
 * HACER; esto solo decide si el rol VE la portada. Es una lista negra por rol
 * (tabla `team_role_pantallas_ocultas`): sin filas, el rol ve todo como hasta
 * ahora, así que una empresa que nunca la toca no nota nada. El Propietario no
 * se puede apagar: siempre ve todo, para que nadie se quede fuera de su propia
 * empresa.
 *
 * TypeScript puro: lo usan el servidor (layout, API) y el cliente (menú, panel).
 */

export type ModuloId = 'escolar' | 'facturacion';

export interface PantallaDef {
  /** Igual al `id` de la sección del menú (Panorama) o `fact-` + el id (Dashboard). */
  id: string;
  modulo: ModuloId;
  /** Cómo se llama el módulo al hablar de gobernanza. */
  moduloLabel: string;
  label: string;
  /** Ruta que abre la pantalla. */
  href: string;
  /** Solo la ruta exacta (`/dashboard` es raíz de todo lo demás de Facturación). */
  exacta?: boolean;
  descripcion: string;
  /** Adónde mandar a quien no la ve, para que no se quede en un callejón. */
  alternativa: { href: string; label: string };
}

export const PANTALLAS: PantallaDef[] = [
  {
    id: 'escolar-panorama',
    modulo: 'escolar',
    moduloLabel: 'Gobernanza',
    label: 'Panorama',
    href: '/escolar/dashboard',
    descripcion: 'Resumen del colegio: cobros, deuda y matrícula',
    alternativa: { href: '/escolar/matriculas', label: 'Ir a Matriculación' },
  },
  {
    id: 'fact-dashboard',
    modulo: 'facturacion',
    moduloLabel: 'Facturación',
    label: 'Dashboard',
    href: '/dashboard',
    exacta: true,
    descripcion: 'Resumen de ventas, cobros y pendientes',
    alternativa: { href: '/dashboard/facturas', label: 'Ir a Facturas de venta' },
  },
];

const IDS = new Set(PANTALLAS.map(p => p.id));

/** ¿Es una pantalla del catálogo? Para validar lo que llega a la API. */
export function esPantalla(id: unknown): id is string {
  return typeof id === 'string' && IDS.has(id);
}

/**
 * La pantalla a la que pertenece una ruta, o `null`. `/escolar/dashboard` es
 * Panorama; `/dashboard` (y solo ese) es el Dashboard de Facturación.
 */
export function pantallaDeRuta(pathname: string): PantallaDef | null {
  // En facturacion.zero.com.do el proxy sirve el panel por rewrite y la barra
  // dice «/» aunque se esté viendo /dashboard.
  const ruta = pathname === '/' ? '/dashboard' : pathname;
  return PANTALLAS.find(p => (
    p.exacta ? ruta === p.href : ruta === p.href || ruta.startsWith(`${p.href}/`)
  )) ?? null;
}

/** ¿El rol ve esta pantalla? El Propietario siempre. */
export function veLaPantalla(rol: { key: string; ocultas: string[] }, id: string): boolean {
  return rol.key === 'owner' || !rol.ocultas.includes(id);
}
