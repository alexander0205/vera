/**
 * Pantallas que el dueño puede apagar por rol.
 *
 * Los permisos (lib/config/roles.ts) dicen qué ACCIONES puede hacer un rol:
 * crear, editar, cobrar. No alcanzan para la gobernanza del colegio, donde la
 * pregunta es otra: «¿la secretaria debe ver Pagos, o solo Matriculación?».
 * Aquí se nombra cada pantalla una vez, con la ruta que la abre, y el resto
 * —el menú, el bloqueo, el panel del atajo, la matriz en Equipo → Permisos—
 * lo lee de esta lista.
 *
 * Apagar es una lista negra por rol (tabla `team_role_pantallas_ocultas`): sin
 * filas, el rol ve todo como hasta ahora, así que un colegio que nunca toca
 * esto no nota nada. El Propietario no se puede apagar: siempre ve todo, para
 * que nadie se quede fuera de su propia empresa.
 *
 * TypeScript puro: lo usan el servidor (layout, API) y el cliente (menú, panel).
 */

export interface PantallaDef {
  /** Igual al `id` de la sección del menú: así el menú filtra sin traducir. */
  id: string;
  label: string;
  /** Ruta que abre la pantalla; todo lo que cuelga de ella cuenta como suya. */
  href: string;
  /** Una línea para quien decide: qué se hace en esa pantalla. */
  descripcion: string;
  /**
   * Si la pantalla ya la manda un permiso, cuál. Apagarla es quitarle ese
   * permiso al rol, no una fila aparte: así hay UN solo control y no dos que
   * puedan contradecirse. Las rutas ya exigen el permiso en el servidor.
   */
  permiso?: string;
}

/** Los dos permisos que abren la puerta del colegio (módulo + poder mirar). */
export const ACCESO_COLEGIO = ['modulo:escolar', 'administracion-escolar:ver'] as const;

/** Permisos del colegio que se encienden y apagan sueltos desde la tarjeta. */
export const PERMISO_CONFIGURAR = 'administracion-escolar:configurar';
export const PERMISOS_ACCION = ['administracion-escolar:gestionar', 'administracion-escolar:pagos'] as const;
export const PERMISOS_COLEGIO: readonly string[] = [
  ...ACCESO_COLEGIO, PERMISO_CONFIGURAR, ...PERMISOS_ACCION,
];

export const PANTALLAS_ESCOLAR: PantallaDef[] = [
  { id: 'escolar-panorama',      href: '/escolar/dashboard',     label: 'Panorama', descripcion: 'Resumen del colegio: cobros, deuda y matrícula' },
  { id: 'escolar-matriculas',    href: '/escolar/matriculas',    label: 'Matriculación', descripcion: 'Inscribir alumnos en un curso' },
  { id: 'escolar-estudiantes',   href: '/escolar/estudiantes',   label: 'Estudiantes y padres', descripcion: 'Fichas de los alumnos y de sus padres' },
  { id: 'escolar-documentos',    href: '/escolar/documentos',    label: 'Documentos', descripcion: 'Documentos requeridos y formularios', permiso: PERMISO_CONFIGURAR },
  { id: 'escolar-responsables',  href: '/escolar/responsables',  label: 'Responsables', descripcion: 'Las familias que pagan y lo que deben' },
  { id: 'escolar-pagos',         href: '/escolar/pagos',         label: 'Pagos', descripcion: 'Pagos aplicados y comprobantes por aprobar' },
  { id: 'escolar-avisos',        href: '/escolar/avisos',        label: 'Avisos', descripcion: 'Recordatorios de cobro que se enviaron' },
  { id: 'escolar-configuracion', href: '/escolar/configuracion', label: 'Configuración', descripcion: 'Períodos, cursos, tarifas y conceptos', permiso: PERMISO_CONFIGURAR },
];

const IDS = new Set(PANTALLAS_ESCOLAR.map(p => p.id));

/** ¿Es una pantalla del catálogo? Para validar lo que llega a la API. */
export function esPantalla(id: unknown): id is string {
  return typeof id === 'string' && IDS.has(id);
}

/**
 * La pantalla a la que pertenece una ruta, o `null` si no es ninguna de las
 * del catálogo. `/escolar/estudiantes/12/editar` es «Estudiantes y padres»:
 * apagar una pantalla apaga también sus fichas y formularios.
 */
export function pantallaDeRuta(pathname: string): PantallaDef | null {
  return PANTALLAS_ESCOLAR.find(
    p => pathname === p.href || pathname.startsWith(`${p.href}/`),
  ) ?? null;
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
