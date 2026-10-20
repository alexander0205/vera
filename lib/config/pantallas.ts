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
}

export const PANTALLAS_ESCOLAR: PantallaDef[] = [
  { id: 'escolar-panorama',      href: '/escolar/dashboard',     label: 'Panorama' },
  { id: 'escolar-matriculas',    href: '/escolar/matriculas',    label: 'Matriculación' },
  { id: 'escolar-estudiantes',   href: '/escolar/estudiantes',   label: 'Estudiantes y padres' },
  { id: 'escolar-documentos',    href: '/escolar/documentos',    label: 'Documentos' },
  { id: 'escolar-responsables',  href: '/escolar/responsables',  label: 'Responsables' },
  { id: 'escolar-pagos',         href: '/escolar/pagos',         label: 'Pagos' },
  { id: 'escolar-avisos',        href: '/escolar/avisos',        label: 'Avisos' },
  { id: 'escolar-configuracion', href: '/escolar/configuracion', label: 'Configuración' },
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
