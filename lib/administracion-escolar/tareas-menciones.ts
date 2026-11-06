/**
 * lib/administracion-escolar/tareas-menciones.ts — las menciones con «@» en la
 * conversación de una tarea, sin base de datos (lo prueba vitest).
 *
 * Se guardan sin tabla nueva: el token va DENTRO del texto del mensaje,
 *
 *     @[Etiqueta](tipo:id)        p. ej.  @[Ana · Zero](persona:74)
 *
 * Al guardar, el servidor valida cada id contra el colegio de la tarea; los
 * que no valen quedan como texto (`@Etiqueta`). Al pintar, cada token se
 * convierte en un chip con elementos de React (nunca HTML crudo).
 *
 * En la caja de escribir la persona ve `@Etiqueta` a secas: los tokens se
 * arman al enviar (`tokenizar`).
 */

export const TIPOS_MENCION = ['persona', 'padre', 'estudiante', 'factura', 'nc', 'nd'] as const;
export type TipoMencion = typeof TIPOS_MENCION[number];

/** Los grupos del menú, en su orden. */
export const GRUPOS_MENCION: readonly { tipo: TipoMencion; titulo: string }[] = [
  { tipo: 'persona', titulo: 'Personas' },
  { tipo: 'padre', titulo: 'Padres' },
  { tipo: 'estudiante', titulo: 'Estudiantes' },
  { tipo: 'factura', titulo: 'Facturas' },
  { tipo: 'nc', titulo: 'Notas de crédito' },
  { tipo: 'nd', titulo: 'Notas de débito' },
];

/** Máximo de resultados por grupo: nunca se cargan listas completas. */
export const MAX_POR_GRUPO = 5;
/** Letras mínimas para buscar padres, estudiantes y documentos. */
export const MIN_BUSQUEDA = 2;
/** Espera del cliente antes de buscar, para no llamar en cada tecla. */
export const DEBOUNCE_MENCIONES_MS = 250;
/** Las que se procesan por mensaje; las demás quedan como texto. */
export const MAX_MENCIONES_POR_MENSAJE = 20;
const TOPE_ETIQUETA = 80;

export interface Mencion { tipo: TipoMencion; id: number; etiqueta: string }

const esTipo = (v: string): v is TipoMencion => (TIPOS_MENCION as readonly string[]).includes(v);
const TOKEN = () => /@\[([^[\]()\n]{1,80})\]\((persona|padre|estudiante|factura|nc|nd):(\d{1,9})\)/g;

/** Una etiqueta que no rompe el token: sin corchetes, paréntesis ni saltos de línea. */
export const limpiarEtiqueta = (s: string): string =>
  s.replace(/[[\]()\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TOPE_ETIQUETA);

export const tokenDe = (m: Mencion): string => `@[${limpiarEtiqueta(m.etiqueta)}](${m.tipo}:${m.id})`;

export type Trozo = { texto: string } | { mencion: Mencion };

/** El texto partido en trozos de texto y menciones, para pintarlo. */
export function partirMenciones(texto: string): Trozo[] {
  const trozos: Trozo[] = [];
  let desde = 0;
  for (const m of texto.matchAll(TOKEN())) {
    const inicio = m.index ?? 0;
    if (inicio > desde) trozos.push({ texto: texto.slice(desde, inicio) });
    trozos.push({ mencion: { etiqueta: m[1].trim(), tipo: m[2] as TipoMencion, id: Number(m[3]) } });
    desde = inicio + m[0].length;
  }
  if (desde < texto.length) trozos.push({ texto: texto.slice(desde) });
  return trozos;
}

/** Las menciones de un texto, sin repetir (mismo tipo e id), hasta el tope por mensaje. */
export function mencionesDe(texto: string): Mencion[] {
  const vistas = new Map<string, Mencion>();
  for (const t of partirMenciones(texto)) {
    if ('mencion' in t && !vistas.has(`${t.mencion.tipo}:${t.mencion.id}`) && t.mencion.id > 0) {
      vistas.set(`${t.mencion.tipo}:${t.mencion.id}`, t.mencion);
    }
  }
  return [...vistas.values()].slice(0, MAX_MENCIONES_POR_MENSAJE);
}

/** Sin tokens: «@Ana · Zero». Para correos, la campana, Slack, vistas previas y el corrector. */
export const textoPlano = (texto: string): string => texto.replace(TOKEN(), '@$1');

/**
 * Valida cada token con `resolver`: devuelve la etiqueta de verdad (la del
 * servidor, no la que mandó el cliente) o `null` si el id no es de este colegio.
 * Los válidos se reescriben con esa etiqueta; los demás —y los que pasan del
 * tope por mensaje— quedan como texto, `@Etiqueta`.
 */
export function reescribirMenciones(texto: string, resolver: (m: Mencion) => string | null): { texto: string; validas: Mencion[] } {
  const validas: Mencion[] = [];
  const claves = new Set<string>();
  const salida = partirMenciones(texto).map((t) => {
    if (!('mencion' in t)) return t.texto;
    const m = t.mencion;
    const clave = `${m.tipo}:${m.id}`;
    if (!claves.has(clave) && claves.size >= MAX_MENCIONES_POR_MENSAJE) return `@${m.etiqueta}`;
    const etiqueta = m.id > 0 ? resolver(m) : null;
    if (etiqueta == null) return `@${m.etiqueta}`;
    if (!claves.has(clave)) { claves.add(clave); validas.push({ ...m, etiqueta }); }
    return tokenDe({ ...m, etiqueta });
  });
  return { texto: salida.join(''), validas };
}

/**
 * Al enviar: cada `@Etiqueta` que la persona eligió del menú pasa a su token.
 * Se recorre el texto de izquierda a derecha y a cada aparición le toca la
 * siguiente mención elegida con esa misma etiqueta; si borró o cambió el
 * texto, esa mención ya no cuenta.
 */
export function tokenizar(texto: string, elegidas: readonly Mencion[]): string {
  if (elegidas.length === 0) return texto;
  const porEtiqueta = new Map<string, Mencion[]>();
  for (const m of elegidas) porEtiqueta.set(m.etiqueta, [...(porEtiqueta.get(m.etiqueta) ?? []), m]);
  // Las más largas primero: «@Ana María» antes que «@Ana».
  const etiquetas = [...porEtiqueta.keys()].sort((a, b) => b.length - a.length)
    .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (etiquetas.length === 0) return texto;
  const re = new RegExp(`@(${etiquetas.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return texto.replace(re, (_todo, etiqueta: string) => {
    const m = porEtiqueta.get(etiqueta)?.shift();
    return m ? tokenDe(m) : `@${etiqueta}`;
  });
}

/** La pantalla a la que lleva cada mención; las personas no tienen. */
export function enlaceDeMencion(m: Pick<Mencion, 'tipo' | 'id'>): string | null {
  switch (m.tipo) {
    case 'padre': return `/escolar/responsables/${m.id}`;
    case 'estudiante': return `/escolar/estudiantes/${m.id}`;
    case 'factura': case 'nc': case 'nd': return `/dashboard/facturas/${m.id}`;
    default: return null;
  }
}

/**
 * Lo que se está escribiendo tras una «@» antes del cursor, o `null` si no hay
 * menú que abrir. La «@» tiene que estar al inicio o después de un espacio
 * (así «correo@sitio.com» no abre nada), sin saltos de línea de por medio y
 * con a lo sumo 30 letras.
 */
export function consultaAntesDelCursor(texto: string, cursor: number): { desde: number; consulta: string } | null {
  const antes = texto.slice(0, cursor);
  const at = antes.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(antes[at - 1])) return null;
  const consulta = antes.slice(at + 1);
  if (consulta.length > 30 || /[\n\r]/.test(consulta)) return null;
  return { desde: at, consulta };
}

/** Escapa los comodines de LIKE de lo que escribió la persona. */
export const escaparLike = (q: string): string => q.replace(/[\\%_]/g, '\\$&');

export { esTipo as esTipoMencion };
