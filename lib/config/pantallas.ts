/**
 * Gobernanza por rol: qué módulo, qué pantallas y qué acciones tiene cada rol.
 *
 * Los permisos (lib/config/roles.ts) dicen qué ACCIONES puede hacer un rol:
 * crear, editar, cobrar. No alcanzan para la gobernanza, donde la pregunta es
 * otra: «¿la secretaria debe ver Pagos?», «¿el vendedor debe ver el Dashboard?».
 * Aquí se nombra cada módulo una vez —con su puerta de entrada, sus pantallas y
 * sus acciones— y el resto —el menú, el bloqueo, el panel del atajo, la tarjeta
 * en el editor del rol, la vista general— lo lee de esta lista.
 *
 * Cada módulo se gobierna igual: ENTRA (permisos de la puerta), VE (pantallas) y
 * HACE (acciones). Para sumar un módulo se agrega una entrada a `MODULOS`.
 *
 * Apagar una pantalla es una lista negra por rol (tabla
 * `team_role_pantallas_ocultas`): sin filas, el rol ve todo como hasta ahora, así
 * que una empresa que nunca toca esto no nota nada. Si la pantalla ya la manda un
 * permiso (`permiso`), se apaga quitándolo: un solo control, sin dos que se
 * contradigan. El Propietario no se puede apagar: siempre ve todo, para que
 * nadie se quede fuera de su propia empresa.
 *
 * TypeScript puro: lo usan el servidor (layout, API) y el cliente (menú, panel).
 */

export type ModuloId = 'escolar' | 'facturacion';

export interface PantallaDef {
  /** Único entre módulos. Va con prefijo del módulo y, en el menú, es el `id`
   *  de la sección (o `fact-` + el id): así el menú filtra sin traducir. */
  id: string;
  modulo: ModuloId;
  label: string;
  /** Ruta que abre la pantalla; todo lo que cuelga de ella cuenta como suya. */
  href: string;
  /** Otras rutas que son de la misma pantalla (una sección del menú con varias). */
  rutas?: string[];
  /** Solo la ruta exacta (para `/dashboard`, que es raíz de todo lo demás). */
  exacta?: boolean;
  /** Una línea para quien decide: qué se hace en esa pantalla. */
  descripcion: string;
  /**
   * Si la pantalla ya la manda un permiso, cuál. Apagarla es quitarle ese
   * permiso al rol, no una fila aparte. Las rutas ya exigen el permiso en el
   * servidor.
   */
  permiso?: string;
}

export interface AccionDef {
  permiso: string;
  label: string;
  descripcion: string;
}

export interface ModuloDef {
  id: ModuloId;
  titulo: string;
  /** Cómo se le llama al hablar de la gobernanza de ese módulo. */
  corto: string;
  /** Permisos que abren la puerta del módulo. Con todos, el rol entra. */
  acceso: readonly string[];
  pantallas: PantallaDef[];
  acciones: AccionDef[];
}

/** El permiso que manda Configuración y Documentos del colegio. */
export const PERMISO_CONFIGURAR = 'administracion-escolar:configurar';

/** Los dos permisos que abren la puerta del colegio (módulo + poder mirar). */
export const ACCESO_COLEGIO = ['modulo:escolar', 'administracion-escolar:ver'] as const;

const escolar = (
  p: Omit<PantallaDef, 'modulo' | 'id'> & { id: string },
): PantallaDef => ({ modulo: 'escolar', ...p });

const fact = (
  p: Omit<PantallaDef, 'modulo' | 'id'> & { id: string },
): PantallaDef => ({ modulo: 'facturacion', ...p });

export const MODULOS: ModuloDef[] = [
  {
    id: 'escolar',
    titulo: 'Gobernanza del colegio',
    corto: 'Colegio',
    acceso: ACCESO_COLEGIO,
    pantallas: [
      escolar({ id: 'escolar-panorama',      href: '/escolar/dashboard',     label: 'Panorama', descripcion: 'Resumen del colegio: cobros, deuda y matrícula' }),
      escolar({ id: 'escolar-matriculas',    href: '/escolar/matriculas',    label: 'Matriculación', descripcion: 'Inscribir alumnos en un curso' }),
      escolar({ id: 'escolar-estudiantes',   href: '/escolar/estudiantes',   label: 'Estudiantes y padres', descripcion: 'Fichas de los alumnos y de sus padres' }),
      escolar({ id: 'escolar-documentos',    href: '/escolar/documentos',    label: 'Documentos', descripcion: 'Documentos requeridos y formularios', permiso: PERMISO_CONFIGURAR }),
      escolar({ id: 'escolar-responsables',  href: '/escolar/responsables',  label: 'Responsables', descripcion: 'Las familias que pagan y lo que deben' }),
      escolar({ id: 'escolar-pagos',         href: '/escolar/pagos',         label: 'Pagos', descripcion: 'Pagos aplicados y comprobantes por aprobar' }),
      escolar({ id: 'escolar-avisos',        href: '/escolar/avisos',        label: 'Avisos', descripcion: 'Recordatorios de cobro que se enviaron' }),
      escolar({ id: 'escolar-configuracion', href: '/escolar/configuracion', label: 'Configuración', descripcion: 'Períodos, cursos, tarifas y conceptos', permiso: PERMISO_CONFIGURAR }),
    ],
    acciones: [
      { permiso: 'administracion-escolar:gestionar', label: 'Crear y editar', descripcion: 'Estudiantes, tutores, cursos y matrículas' },
      { permiso: 'administracion-escolar:pagos', label: 'Cobrar', descripcion: 'Registrar pagos escolares' },
    ],
  },
  {
    id: 'facturacion',
    titulo: 'Facturación',
    corto: 'Facturación',
    acceso: ['modulo:facturacion'],
    // Una pantalla por sección del menú. Las de «Usuarios, roles y plan» no
    // están: viven en /cuenta y en Equipo, y apagarlas dejaría a un rol sin
    // poder arreglar lo que apagó.
    pantallas: [
      fact({ id: 'fact-dashboard',     href: '/dashboard', exacta: true, label: 'Dashboard', descripcion: 'Resumen de ventas, cobros y pendientes' }),
      fact({ id: 'fact-contactos',     href: '/dashboard/clientes', label: 'Contactos', descripcion: 'Clientes y sus dependientes' }),
      fact({
        id: 'fact-ingresos', href: '/dashboard/facturas', label: 'Ingresos',
        descripcion: 'Facturas de venta, cobros, notas y cotizaciones',
        rutas: [
          '/dashboard/cuentas-por-cobrar', '/dashboard/notas-credito', '/dashboard/notas-debito',
          '/dashboard/cotizaciones', '/dashboard/facturas-recurrentes',
          '/dashboard/pagos/links', '/dashboard/pagos/pasarelas',
        ],
      }),
      fact({
        id: 'fact-inventario', href: '/dashboard/productos', label: 'Inventario',
        descripcion: 'Productos, stock, almacenes y listas de precios',
        rutas: [
          '/dashboard/inventario', '/dashboard/categorias', '/dashboard/almacenes',
          '/dashboard/listas-precios', '/dashboard/vendedores',
        ],
      }),
      fact({ id: 'fact-compras',       href: '/dashboard/compras', rutas: ['/dashboard/gastos'], label: 'Compras y gastos', descripcion: 'Facturas recibidas y gastos' }),
      fact({ id: 'fact-caja',          href: '/dashboard/caja', label: 'Caja', descripcion: 'Turnos, aprobaciones e historial' }),
      fact({
        id: 'fact-comprobantes', href: '/dashboard/contabilidad/secuencias', label: 'Comprobantes',
        descripcion: 'Secuencias de comprobantes y consulta de e-NCF',
        rutas: ['/dashboard/contabilidad/consulta-ncf'],
      }),
      fact({ id: 'fact-reportes',      href: '/dashboard/reportes', rutas: ['/dashboard/pagos'], label: 'Reportes', descripcion: 'Reportes y pagos recibidos' }),
      fact({
        id: 'fact-configuracion', href: '/dashboard/configuracion', label: 'Configuración',
        descripcion: 'Empresa, maestros, certificado digital e impresoras',
        rutas: [
          '/dashboard/maestros', '/dashboard/secuencias', '/dashboard/certificado',
          '/dashboard/habilitacion', '/dashboard/impresoras', '/dashboard/api-keys',
        ],
      }),
    ],
    acciones: [
      { permiso: 'facturas:crear', label: 'Crear facturas', descripcion: 'Facturas de venta, notas y cotizaciones' },
      { permiso: 'facturas:editar', label: 'Editar borradores', descripcion: 'Cambiar una factura antes de emitirla' },
      { permiso: 'facturas:anular', label: 'Anular facturas', descripcion: 'Dejar sin efecto una factura emitida' },
      { permiso: 'facturas:emitir-dgii', label: 'Emitir a la DGII', descripcion: 'Enviar el e-CF' },
      { permiso: 'pagos:registrar', label: 'Registrar cobros', descripcion: 'Anotar un pago contra una factura' },
      { permiso: 'facturas:exportar', label: 'Exportar', descripcion: 'PDF, CSV y XML de facturas' },
      { permiso: 'clientes:gestionar', label: 'Gestionar contactos', descripcion: 'Crear, editar y eliminar clientes' },
      { permiso: 'productos:gestionar', label: 'Gestionar productos', descripcion: 'Crear, editar y eliminar productos' },
    ],
  },
];

export function moduloDe(id: ModuloId): ModuloDef {
  return MODULOS.find(m => m.id === id)!;
}

/** Todas las pantallas de todos los módulos. */
export const PANTALLAS: PantallaDef[] = MODULOS.flatMap(m => m.pantallas);

/** Las del colegio, que el menú de /escolar usa directo. */
export const PANTALLAS_ESCOLAR: PantallaDef[] = moduloDe('escolar').pantallas;

/** Todos los permisos que la gobernanza enciende y apaga sueltos. */
export const PERMISOS_GOBERNANZA: readonly string[] = [
  ...new Set(MODULOS.flatMap(m => [
    ...m.acceso,
    ...m.acciones.map(a => a.permiso),
    ...m.pantallas.flatMap(p => (p.permiso ? [p.permiso] : [])),
  ])),
];

const IDS = new Set(PANTALLAS.map(p => p.id));

/** ¿Es una pantalla del catálogo? Para validar lo que llega a la API. */
export function esPantalla(id: unknown): id is string {
  return typeof id === 'string' && IDS.has(id);
}

/**
 * La pantalla a la que pertenece una ruta, o `null` si no es ninguna de las
 * del catálogo. `/escolar/estudiantes/12/editar` es «Estudiantes y padres»:
 * apagar una pantalla apaga también sus fichas y formularios. Si dos rutas
 * encajan (`/dashboard/pagos/links` es de Ingresos y empieza por la de
 * Reportes), gana la más específica.
 */
export function pantallaDeRuta(pathname: string): PantallaDef | null {
  // En facturacion.zero.com.do el proxy sirve el panel por rewrite y la barra
  // dice «/» aunque se esté viendo /dashboard.
  const ruta = pathname === '/' ? '/dashboard' : pathname;
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
 * ¿El rol ve esta pantalla? Si la manda un permiso, es tenerlo; si no, no
 * estar en su lista de apagadas. El Propietario siempre la ve.
 */
export function veLaPantalla(
  rol: { key: string; ocultas: string[]; permisos: string[] },
  p: Pick<PantallaDef, 'id' | 'permiso'>,
): boolean {
  if (rol.key === 'owner') return true;
  return p.permiso ? rol.permisos.includes(p.permiso) : !rol.ocultas.includes(p.id);
}

/** ¿El rol entra al módulo? Necesita todos los permisos de la puerta. */
export function entraAlModulo(
  rol: { key: string; permisos: string[] },
  modulo: Pick<ModuloDef, 'acceso'>,
): boolean {
  return rol.key === 'owner' || modulo.acceso.every(p => rol.permisos.includes(p));
}
