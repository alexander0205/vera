/**
 * Pantallas que el dueño puede mostrar u ocultar por rol.
 *
 * Una fila por pantalla real de cada módulo, con su ruta:
 *   - Gobernanza   → Administración Escolar (`/escolar/*`)
 *   - Facturación  → `/dashboard/*`, agrupadas como en el menú
 *   - Punto de Venta, Contabilidad, Nómina y Administración (`/pos`,
 *     `/contabilidad`, `/nomina`, `/cuenta`)
 *
 * Los permisos (lib/config/roles.ts) siguen mandando lo que cada rol puede
 * HACER; esto solo decide si el rol VE la pantalla. Es una lista negra por rol
 * (tabla `team_role_pantallas_ocultas`): sin filas, el rol ve todo como hasta
 * ahora, así que una empresa que nunca la toca no nota nada. El Propietario no
 * se puede apagar: siempre ve todo. Equipo, Roles y Usuarios no están en la
 * lista a propósito: apagarlas dejaría a un rol sin poder arreglar lo que apagó.
 *
 * Una pantalla oculta no se puede abrir: sale del menú y el proxy no la sirve
 * —ni al escribir su dirección ni navegando— (lib/auth/pantallas-proxy.ts). Las
 * APIs de datos siguen mandadas por los permisos del rol.
 *
 * TypeScript puro: lo usan el servidor (layout, API) y el cliente (menú, panel).
 */

import { PAGOS_ONLINE_ENABLED } from './pagos-online';

export type ModuloId = 'escolar' | 'facturacion' | 'pos' | 'contabilidad' | 'nomina' | 'administracion';

export interface PantallaDef {
  /** Igual al `id` de la sección del menú en el colegio; `fact-…` en Facturación. */
  id: string;
  modulo: ModuloId;
  /** Cómo se llama el módulo al hablar de gobernanza. */
  moduloLabel: string;
  /** Sección del menú a la que pertenece, para agruparlas al elegir. */
  grupo?: string;
  label: string;
  /** Ruta que abre la pantalla; todo lo que cuelga de ella cuenta como suya. */
  href: string;
  /** Otras rutas que son de la misma pantalla. */
  rutas?: string[];
  /** Solo la ruta exacta (`/dashboard` es raíz de todo lo demás de Facturación). */
  exacta?: boolean;
  /**
   * La portada del módulo: a donde se llega al entrar, o al rebotar de una
   * pantalla sin permiso. Oculta, no se queda en el aviso: se sigue a la
   * primera pantalla del módulo que el rol sí ve.
   */
  portada?: boolean;
  descripcion: string;
  /** Lo que se rompe en otro sitio si se oculta: el panel lo enseña antes de apagarla. */
  aviso?: string;
}

export const MODULOS_PANTALLAS: { id: ModuloId; label: string }[] = [
  { id: 'escolar', label: 'Gobernanza' },
  { id: 'facturacion', label: 'Facturación' },
  { id: 'pos', label: 'Punto de Venta' },
  { id: 'contabilidad', label: 'Contabilidad' },
  { id: 'nomina', label: 'Nómina' },
  { id: 'administracion', label: 'Administración' },
];

const G = 'Gobernanza';
const F = 'Facturación';
const esc = (p: Omit<PantallaDef, 'modulo' | 'moduloLabel'>): PantallaDef => ({ modulo: 'escolar', moduloLabel: G, ...p });
const fac = (p: Omit<PantallaDef, 'modulo' | 'moduloLabel'>): PantallaDef => ({ modulo: 'facturacion', moduloLabel: F, ...p });
const otro = (modulo: ModuloId, moduloLabel: string) =>
  (p: Omit<PantallaDef, 'modulo' | 'moduloLabel'>): PantallaDef => ({ modulo, moduloLabel, ...p });
const pos = otro('pos', 'Punto de Venta');
const con = otro('contabilidad', 'Contabilidad');
const nom = otro('nomina', 'Nómina');
const adm = otro('administracion', 'Administración');

export const PANTALLAS: PantallaDef[] = [
  // ── Gobernanza ──
  esc({ id: 'escolar-panorama',      label: 'Panorama', href: '/escolar/dashboard', descripcion: 'Resumen del colegio: cobros, deuda y matrícula' }),
  esc({ id: 'escolar-matriculas',    label: 'Matriculación', href: '/escolar/matriculas', descripcion: 'Inscribir alumnos en un curso' }),
  esc({ id: 'escolar-estudiantes',   label: 'Estudiantes y padres', href: '/escolar/estudiantes', rutas: ['/escolar/condicion-academica'], descripcion: 'Fichas de los alumnos y de sus padres' }),
  esc({ id: 'escolar-documentos',    label: 'Documentos', href: '/escolar/documentos', descripcion: 'Documentos requeridos y formularios' }),
  esc({ id: 'escolar-responsables',  label: 'Responsables', href: '/escolar/responsables', rutas: ['/escolar/cobrar-grupo'], descripcion: 'Las familias que pagan y lo que deben' }),
  esc({ id: 'escolar-pagos',         label: 'Pagos', href: '/escolar/pagos', descripcion: 'Pagos aplicados y comprobantes por aprobar' }),
  esc({ id: 'escolar-avisos',        label: 'Avisos', href: '/escolar/avisos', descripcion: 'Recordatorios de cobro que se enviaron' }),
  esc({ id: 'escolar-por-revisar',   label: 'Por revisar', href: '/escolar/por-revisar', descripcion: 'Tareas de los alumnos y las familias que alguien tiene que revisar' }),
  esc({ id: 'escolar-configuracion', label: 'Configuración', href: '/escolar/configuracion', rutas: ['/escolar/sigerd', '/escolar/personal'], descripcion: 'Períodos, cursos, tarifas y conceptos' }),

  // ── Facturación ──
  fac({ id: 'fact-dashboard', label: 'Dashboard', href: '/dashboard', exacta: true, portada: true, descripcion: 'Resumen de ventas, cobros y pendientes' }),
  fac({ id: 'fact-contactos', label: 'Contactos', href: '/dashboard/clientes', descripcion: 'Clientes y sus dependientes',
    aviso: '«Editar contacto» de Responsables (Gobernanza) abre esta pantalla: oculta, a este rol no le abrirá.' }),
  // «Pagos recibidos» (/dashboard/pagos) es un reporte; Links de pago y Pasarelas,
  // que cuelgan de esa ruta, son pantallas propias de Ingresos (abajo) y ganan
  // por ser más específicas.
  fac({ id: 'fact-reportes',  label: 'Reportes', href: '/dashboard/reportes', rutas: ['/dashboard/pagos'], descripcion: 'Reportes y pagos recibidos' }),

  fac({ grupo: 'Ingresos', id: 'fact-facturas',      label: 'Facturas de venta', href: '/dashboard/facturas', descripcion: 'Emitir, consultar y exportar facturas',
    aviso: 'Gobernanza abre aquí las facturas de los alumnos: oculta, a este rol no le abrirán desde el colegio.' }),
  fac({ grupo: 'Ingresos', id: 'fact-cxc',           label: 'Cuentas por cobrar', href: '/dashboard/cuentas-por-cobrar', descripcion: 'Lo que los clientes deben' }),
  // Solo cuando el cobro por internet está encendido: es cuando salen en el menú.
  ...(PAGOS_ONLINE_ENABLED ? [
    fac({ grupo: 'Ingresos', id: 'fact-links-pago', label: 'Links de pago', href: '/dashboard/pagos/links', descripcion: 'Cobrar con un enlace por internet' }),
    fac({ grupo: 'Ingresos', id: 'fact-pasarelas',  label: 'Pasarelas de pago', href: '/dashboard/pagos/pasarelas', descripcion: 'Conectar la pasarela de cobro' }),
  ] : []),
  fac({ grupo: 'Ingresos', id: 'fact-notas-credito', label: 'Notas de crédito', href: '/dashboard/notas-credito', descripcion: 'Corregir o devolver una factura' }),
  fac({ grupo: 'Ingresos', id: 'fact-notas-debito',  label: 'Notas de débito', href: '/dashboard/notas-debito', descripcion: 'Cargos adicionales a una factura' }),
  fac({ grupo: 'Ingresos', id: 'fact-cotizaciones',  label: 'Cotizaciones', href: '/dashboard/cotizaciones', descripcion: 'Propuestas antes de facturar' }),
  fac({ grupo: 'Ingresos', id: 'fact-recurrentes',   label: 'Facturas recurrentes', href: '/dashboard/facturas-recurrentes', descripcion: 'Cobros que se repiten solos' }),

  fac({ grupo: 'Inventario', id: 'fact-productos',      label: 'Productos y servicios', href: '/dashboard/productos', descripcion: 'Catálogo y precios' }),
  fac({ grupo: 'Inventario', id: 'fact-stock',          label: 'Movimientos de stock', href: '/dashboard/inventario', descripcion: 'Entradas, salidas y ajustes' }),
  fac({ grupo: 'Inventario', id: 'fact-categorias',     label: 'Categorías', href: '/dashboard/categorias', descripcion: 'Agrupar productos' }),
  fac({ grupo: 'Inventario', id: 'fact-almacenes',      label: 'Almacenes', href: '/dashboard/almacenes', descripcion: 'Dónde está el stock' }),
  fac({ grupo: 'Inventario', id: 'fact-listas-precios', label: 'Listas de precios', href: '/dashboard/listas-precios', descripcion: 'Precios por tipo de cliente' }),
  fac({ grupo: 'Inventario', id: 'fact-vendedores',     label: 'Vendedores', href: '/dashboard/vendedores', descripcion: 'Quién vende y comisiones' }),

  fac({ grupo: 'Compras', id: 'fact-compras', label: 'Facturas recibidas', href: '/dashboard/compras', descripcion: 'Compras a proveedores' }),
  fac({ grupo: 'Compras', id: 'fact-gastos',  label: 'Gastos', href: '/dashboard/gastos', descripcion: 'Gastos menores y sin e-CF' }),

  fac({ grupo: 'Caja', id: 'fact-caja',              label: 'Mi caja', href: '/dashboard/caja', exacta: true, descripcion: 'Abrir turno y registrar movimientos' }),
  fac({ grupo: 'Caja', id: 'fact-caja-aprobaciones', label: 'Aprobaciones', href: '/dashboard/caja/aprobaciones', descripcion: 'Cierres con descuadre' }),
  fac({ grupo: 'Caja', id: 'fact-caja-historial',    label: 'Historial de caja', href: '/dashboard/caja/historial', descripcion: 'Turnos anteriores' }),

  fac({ grupo: 'Comprobantes', id: 'fact-secuencias-comp', label: 'Secuencias de comprobantes', href: '/dashboard/contabilidad/secuencias', descripcion: 'Rangos de e-NCF autorizados' }),
  fac({ grupo: 'Comprobantes', id: 'fact-consulta-ncf',    label: 'Consulta de e-NCF', href: '/dashboard/contabilidad/consulta-ncf', descripcion: 'Verificar un comprobante ante la DGII' }),

  fac({ grupo: 'Configuración', id: 'fact-empresa',      label: 'Mi empresa', href: '/dashboard/configuracion', exacta: true, descripcion: 'Datos fiscales y preferencias' }),
  fac({ grupo: 'Configuración', id: 'fact-maestros',     label: 'Maestros', href: '/dashboard/maestros', descripcion: 'Listas propias de atributos' }),
  fac({ grupo: 'Configuración', id: 'fact-secuencias',   label: 'Secuencias NCF', href: '/dashboard/secuencias', descripcion: 'Numeración de comprobantes' }),
  fac({ grupo: 'Configuración', id: 'fact-certificado',  label: 'Certificado digital', href: '/dashboard/certificado', descripcion: 'Firma de e-CF' }),
  fac({ grupo: 'Configuración', id: 'fact-habilitacion', label: 'Habilitación e-CF', href: '/dashboard/habilitacion', descripcion: 'Activar la facturación electrónica' }),
  fac({ grupo: 'Configuración', id: 'fact-impresoras',   label: 'Impresoras', href: '/dashboard/impresoras', descripcion: 'Tickets y facturas impresas' }),
  fac({ grupo: 'Configuración', id: 'fact-api-keys',     label: 'API Keys', href: '/dashboard/api-keys', descripcion: 'Integraciones' }),

  // ── Punto de Venta ──
  pos({ id: 'pos-vender',        label: 'Vender', href: '/pos', exacta: true, portada: true, descripcion: 'La terminal: vender y cobrar' }),
  pos({ id: 'pos-historial',     label: 'Historial', href: '/pos/historial', descripcion: 'Ventas del turno' }),
  pos({ id: 'pos-turnos',        label: 'Turnos', href: '/pos/turnos', descripcion: 'Abrir y cerrar caja' }),
  pos({ id: 'pos-caja',          label: 'Gestión de efectivo', href: '/pos/caja', descripcion: 'Entradas y salidas de efectivo' }),
  pos({ id: 'pos-devoluciones',  label: 'Devoluciones', href: '/pos/devoluciones', descripcion: 'Devolver una venta' }),
  pos({ id: 'pos-contactos',     label: 'Contactos', href: '/pos/contactos', descripcion: 'Clientes del POS' }),
  pos({ id: 'pos-productos',     label: 'Productos', href: '/pos/productos', descripcion: 'Catálogo del POS' }),
  pos({ id: 'pos-inventario',    label: 'Inventario', href: '/pos/inventario', descripcion: 'Existencias' }),
  pos({ id: 'pos-configuracion', label: 'Configuración', href: '/pos/configuracion', rutas: ['/pos/terminales', '/dashboard/pos-terminales'], descripcion: 'Terminales y ajustes del POS' }),

  // ── Contabilidad ──
  con({ id: 'contabilidad-panorama', label: 'Panorama', href: '/contabilidad', exacta: true, portada: true, descripcion: 'Resumen contable' }),
  con({ id: 'contabilidad-libro',    label: 'Libro diario', href: '/contabilidad/libro-diario', descripcion: 'Asientos en orden' }),
  con({ id: 'contabilidad-asiento',  label: 'Nuevo asiento', href: '/contabilidad/nuevo-asiento', descripcion: 'Registrar un asiento manual' }),
  con({ id: 'contabilidad-cuentas',  label: 'Catálogo de cuentas', href: '/contabilidad/cuentas', descripcion: 'Plan de cuentas' }),
  con({ grupo: 'Reportes', id: 'contabilidad-mayor',            label: 'Mayor general', href: '/contabilidad/mayor', descripcion: 'Movimientos por cuenta' }),
  con({ grupo: 'Reportes', id: 'contabilidad-balance',          label: 'Balance de comprobación', href: '/contabilidad/balance', descripcion: 'Saldos por cuenta' }),
  con({ grupo: 'Reportes', id: 'contabilidad-resultados',       label: 'Estado de resultados', href: '/contabilidad/estado-resultados', descripcion: 'Ingresos, costos y gastos' }),
  con({ grupo: 'Reportes', id: 'contabilidad-balance-general',  label: 'Balance general', href: '/contabilidad/balance-general', descripcion: 'Activos, pasivos y capital' }),
  con({ id: 'contabilidad-cxp',      label: 'Cuentas por pagar', href: '/contabilidad/cuentas-por-pagar', descripcion: 'Lo que se debe a proveedores' }),
  con({ id: 'contabilidad-activos',  label: 'Activos fijos', href: '/contabilidad/activos-fijos', descripcion: 'Bienes y depreciación' }),
  con({ id: 'contabilidad-cierre',   label: 'Cierre de ejercicio', href: '/contabilidad/cierre-ejercicio', descripcion: 'Cerrar el año contable' }),
  con({ id: 'contabilidad-config',   label: 'Configuración', href: '/contabilidad/configuracion', descripcion: 'Cuentas automáticas y ajustes' }),

  // ── Nómina ──
  nom({ id: 'nomina-panorama',  label: 'Panorama', href: '/nomina', exacta: true, portada: true, descripcion: 'Resumen de la nómina' }),
  nom({ id: 'nomina-empleados', label: 'Empleados', href: '/nomina/empleados', descripcion: 'Ficha de cada empleado' }),
  nom({ id: 'nomina-corridas',  label: 'Corridas', href: '/nomina/corridas', descripcion: 'Calcular y aprobar la nómina' }),
  nom({ id: 'nomina-horas',     label: 'Horas', href: '/nomina/horas', descripcion: 'Horas trabajadas' }),
  nom({ id: 'nomina-contratos', label: 'Contratos', href: '/nomina/contratos', descripcion: 'Contratos de los empleados' }),
  nom({ id: 'nomina-pagos',     label: 'Pagos', href: '/nomina/pagos', descripcion: 'Dispersión y pagos' }),
  nom({ id: 'nomina-config',    label: 'Configuración', href: '/nomina/configuracion', descripcion: 'Tasas y cuenta de dispersión' }),

  // ── Administración (Usuarios y Roles quedan fuera a propósito) ──
  adm({ id: 'cuenta-empresa',  label: 'Mi empresa', href: '/cuenta/empresa', descripcion: 'Datos de la empresa' }),
  adm({ id: 'cuenta-plan',     label: 'Plan y facturación', href: '/cuenta/plan', descripcion: 'Suscripción y pagos' }),
  adm({ id: 'cuenta-empresas', label: 'Mis empresas', href: '/cuenta/empresas', descripcion: 'Cambiar de empresa' }),
];

const IDS = new Set(PANTALLAS.map(p => p.id));

/** ¿Es una pantalla del catálogo? Para validar lo que llega a la API. */
export function esPantalla(id: unknown): id is string {
  return typeof id === 'string' && IDS.has(id);
}

/**
 * La pantalla a la que pertenece una ruta, o `null`. `/escolar/estudiantes/12`
 * es «Estudiantes y padres»: ocultar una pantalla oculta también sus fichas y
 * formularios. Si dos rutas encajan, gana la más específica.
 */
export function pantallaDeRuta(pathname: string, inicio = '/dashboard'): PantallaDef | null {
  // En los subdominios de módulo el proxy sirve la portada por rewrite y la
  // barra dice «/» aunque se esté viendo /dashboard, /pos, etc.: `inicio` es la
  // portada del módulo en el que se está.
  const ruta = normalizar(pathname === '/' ? inicio : pathname);
  let mejor: PantallaDef | null = null;
  let largo = -1;
  for (const p of PANTALLAS) {
    for (const base of [p.href, ...(p.rutas ?? [])]) {
      const encaja = p.exacta && base === p.href
        ? ruta === base
        : ruta === base || ruta.startsWith(`${base}/`);
      if (encaja && base.length > largo) { mejor = p; largo = base.length; }
    }
  }
  return mejor;
}

/**
 * La ruta como la ve el router: `/dashboard/%66acturas` es `/dashboard/facturas`
 * y una barra final no cambia de pantalla. Sin esto, escribir la dirección
 * codificada se saltaba el aviso.
 */
function normalizar(ruta: string): string {
  let r = ruta.split(/[?#]/)[0];
  try { r = decodeURIComponent(r); } catch { /* secuencia inválida: se compara tal cual */ }
  return r.length > 1 ? r.replace(/\/+$/, '') : r;
}

/**
 * Adónde mandar a quien no ve una pantalla: la primera del módulo que sí ve
 * (y que sus permisos dejan abrir, si se sabe). `preferida`, si la ve, primero.
 */
export function primeraVisible(
  modulo: ModuloId,
  ocultas: string[],
  puede?: (href: string) => boolean,
  preferida?: string,
): PantallaDef | null {
  const candidatas = PANTALLAS.filter(p =>
    p.modulo === modulo && !ocultas.includes(p.id) && (!puede || puede(p.href)));
  return candidatas.find(p => p.id === preferida) ?? candidatas[0] ?? null;
}

/** ¿Esta ruta es de una pantalla que el rol tiene oculta? */
export function rutaOculta(href: string, ocultas: string[], inicio?: string): boolean {
  if (ocultas.length === 0) return false;
  const p = pantallaDeRuta(href, inicio);
  return !!p && ocultas.includes(p.id);
}

/** ¿El rol ve esta pantalla? El Propietario siempre. */
export function veLaPantalla(rol: { key: string; ocultas: string[] }, id: string): boolean {
  return rol.key === 'owner' || !rol.ocultas.includes(id);
}

/** Las pantallas de un módulo agrupadas por sección del menú (sin grupo: una sola). */
export function agruparPantallas(pantallas: PantallaDef[]): { nombre: string | null; items: PantallaDef[] }[] {
  const grupos: { nombre: string | null; items: PantallaDef[] }[] = [];
  for (const p of pantallas) {
    const nombre = p.grupo ?? null;
    const g = grupos.find(x => x.nombre === nombre);
    if (g) g.items.push(p); else grupos.push({ nombre, items: [p] });
  }
  return grupos;
}
