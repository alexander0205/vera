import { MAPA_SISTEMA } from './mapa-sistema';
import { neutralizarDatos, hayOmitidos } from './politicas';

/**
 * Enlaces del asistente: SOLO rutas que existen.
 *
 * Dos fuentes de verdad, y nada más:
 *  1. las rutas fijas del mapa del sistema (`mapa-sistema.ts`), que una prueba
 *     compara contra los `page.tsx` reales;
 *  2. las pantallas de un registro concreto (`/dashboard/facturas/123`), cuyos
 *     patrones están listados abajo y también se comprueban contra `app/`.
 *
 * Todo lo que el modelo escriba como enlace pasa por `sanitizarEnlaces`: si no
 * es una ruta de estas, el enlace se quita (queda el texto) y se avisa. Así no
 * depende de que el modelo se acuerde de no inventar.
 */

/** Pantallas de un registro: patrón de la URL → carpeta real de `app/` (la prueba lo verifica). */
export const PATRONES_REGISTRO: { patron: RegExp; pagina: string }[] = [
  { patron: /^\/dashboard\/facturas\/\d+$/, pagina: 'app/(dashboard)/dashboard/facturas/[id]/page.tsx' },
  { patron: /^\/dashboard\/cotizaciones\/\d+$/, pagina: 'app/(dashboard)/dashboard/cotizaciones/[id]/page.tsx' },
  { patron: /^\/dashboard\/compras\/local\/\d+$/, pagina: 'app/(dashboard)/dashboard/compras/local/[id]/page.tsx' },
  { patron: /^\/dashboard\/productos\/\d+$/, pagina: 'app/(dashboard)/dashboard/productos/[id]/page.tsx' },
  { patron: /^\/dashboard\/facturas-recurrentes\/\d+$/, pagina: 'app/(dashboard)/dashboard/facturas-recurrentes/[id]/page.tsx' },
  { patron: /^\/escolar\/estudiantes\/\d+$/, pagina: 'app/escolar/estudiantes/[id]/page.tsx' },
];

/** Constructores: el único sitio donde se arma la URL de un registro. */
export const enlaceFactura = (id: number) => `/dashboard/facturas/${id}`;
export const enlaceCotizacion = (id: number) => `/dashboard/cotizaciones/${id}`;
export const enlaceCompraLocal = (id: number) => `/dashboard/compras/local/${id}`;
export const enlaceProducto = (id: number) => `/dashboard/productos/${id}`;
export const enlaceRecurrente = (id: number) => `/dashboard/facturas-recurrentes/${id}`;
export const enlaceEstudiante = (id: number) => `/escolar/estudiantes/${id}`;

const FIJAS = new Set(MAPA_SISTEMA.map((e) => e.ruta));

/** Quita origen, query y hash: `http://localhost:3000/dashboard/compras?x=1` → `/dashboard/compras`. */
export function rutaLimpia(url: string): string | null {
  let u = url.trim();
  const abs = u.match(/^https?:\/\/[^/]+(\/.*)?$/i);
  if (abs) u = abs[1] ?? '/';
  if (!u.startsWith('/') || u.startsWith('//')) return null;
  return u.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}

/**
 * ¿Es una pantalla que existe?
 *
 * Las rutas fijas valen siempre. La pantalla de un REGISTRO (una factura, una
 * cotización…) solo vale si una herramienta la entregó en este turno
 * (`permitidos`): el patrón `/dashboard/facturas/<número>` por sí solo no
 * alcanza, porque el modelo puede poner ahí el NÚMERO de la factura
 * (0100000216) en vez de su id (3985) y llevar a una pantalla vacía.
 */
export function rutaEsReal(url: string, permitidos?: ReadonlySet<string>): boolean {
  const r = rutaLimpia(url);
  if (!r) return false;
  if (FIJAS.has(r)) return true;
  if (!PATRONES_REGISTRO.some((p) => p.patron.test(r))) return false;
  // Sin lista de permitidos (uso suelto) solo se comprueba el patrón; en el
  // asistente siempre se pasa, y entonces el registro tiene que haber salido
  // de una herramienta.
  return permitidos ? permitidos.has(r) : true;
}

/** Guarda en `destino` todo campo «enlace…» de un resultado de herramienta. */
export function recogerEnlaces(valor: unknown, destino: Set<string>, profundidad = 0): void {
  if (profundidad > 6 || valor == null) return;
  if (Array.isArray(valor)) { for (const v of valor) recogerEnlaces(v, destino, profundidad + 1); return; }
  if (typeof valor !== 'object') return;
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof v === 'string' && /^enlace/.test(k)) {
      const r = rutaLimpia(v);
      if (r) destino.add(r);
    } else {
      recogerEnlaces(v, destino, profundidad + 1);
    }
  }
}

/** Enlaza una herramienta para que sus resultados queden registrados como enlaces permitidos. */
export function registrarEnlacesDeHerramientas<T extends Record<string, unknown>>(
  tools: T, destino: Set<string>,
): T {
  const salida: Record<string, unknown> = {};
  for (const [nombre, t] of Object.entries(tools)) {
    const def = t as { execute?: (i: unknown, o: unknown) => unknown };
    if (typeof def?.execute !== 'function') { salida[nombre] = t; continue; }
    const original = def.execute.bind(def);
    salida[nombre] = {
      ...(t as object),
      execute: async (i: unknown, o: unknown) => {
        // Un nombre o una nota con «ignora tus instrucciones» es un dato, no una
        // orden: se omite antes de que el modelo lo lea.
        const r = neutralizarDatos(await original(i, o));
        if (hayOmitidos(r)) console.warn(`[asistente] ${nombre}: se omitió texto con forma de instrucción`);
        recogerEnlaces(r, destino);
        return r;
      },
    };
  }
  return salida as T;
}

export interface ResultadoSaneado {
  texto: string;
  /** Enlaces que no eran rutas reales y se quitaron. */
  descartados: string[];
}

const PREFIJOS = '(?:dashboard|contabilidad|escolar|nomina|pos|cuenta)';
const RE_ENLACE_MD = /\[[^\]]+\]\([^)]*\)/g;

const ROTULO_REGISTRO: [RegExp, string][] = [
  [/^\/dashboard\/facturas-recurrentes\/\d+$/, 'Ver la factura recurrente'],
  [/^\/dashboard\/facturas\/\d+$/, 'Ver la factura'],
  [/^\/dashboard\/cotizaciones\/\d+$/, 'Ver la cotización'],
  [/^\/dashboard\/compras\/local\/\d+$/, 'Ver la compra'],
  [/^\/dashboard\/productos\/\d+$/, 'Ver el producto'],
  [/^\/escolar\/estudiantes\/\d+$/, 'Ver el estudiante'],
];

/** Texto del enlace para una ruta que la respuesta escribió suelta. */
function etiquetaDeRuta(ruta: string): string {
  const e = MAPA_SISTEMA.find((x) => x.ruta === ruta);
  if (e) return e.titulo;
  return ROTULO_REGISTRO.find(([re]) => re.test(ruta))?.[1] ?? ruta;
}

/** Aplica `fn` solo a los tramos que NO son ya un enlace markdown. */
function fueraDeEnlaces(t: string, fn: (tramo: string) => string): string {
  let salida = '';
  let i = 0;
  for (const m of t.matchAll(RE_ENLACE_MD)) {
    const idx = m.index ?? 0;
    salida += fn(t.slice(i, idx)) + m[0];
    i = idx + m[0].length;
  }
  return salida + fn(t.slice(i));
}

/**
 * Formas en que un modelo escribe un enlace que el chat no sabe mostrar:
 * título después del destino, autoenlace <…>, enlace dentro de negritas.
 * Se llevan a `[texto](/ruta)`.
 */
function normalizarMarkup(t: string): string {
  return t
    // [texto](/ruta "título") → [texto](/ruta)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\s+["'][^)]*["']\)/g, '[$1]($2)')
    // <https://host/dashboard/x> → https://host/dashboard/x
    .replace(/<((?:https?:\/\/[^\s>]+|\/[^\s>]+))>/g, '$1')
    // **[texto](/ruta)** y *[texto](/ruta)* → [texto](/ruta)
    .replace(/\*{1,2}(\[[^\]]+\]\([^)\s]+\))\*{1,2}/g, '$1')
    // [**texto**](/ruta) → [texto](/ruta)
    .replace(/\[\*{1,2}([^\]*]+)\*{1,2}\]\(/g, '[$1](');
}

/**
 * Deja solo enlaces a rutas reales (y los vuelve relativos). Un enlace
 * inventado se reemplaza por su texto, sin vínculo. Una ruta real escrita
 * suelta («/dashboard/cotizaciones», con o sin origen, o entre comillas de
 * código) se convierte en hipervínculo: la persona no debería tener que
 * copiarla.
 */
export function sanitizarEnlaces(texto: string, permitidos?: ReadonlySet<string>): ResultadoSaneado {
  const descartados: string[] = [];

  // [texto](destino)
  let salida = normalizarMarkup(texto).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, etiqueta: string, destino: string) => {
    const r = rutaLimpia(destino);
    if (r && rutaEsReal(r, permitidos)) return `[${etiqueta}](${r})`;
    descartados.push(destino);
    return etiqueta;
  });

  // Rutas sueltas del sistema: «/dashboard/algo» o «https://app/dashboard/algo».
  // Las reales pasan a ser enlaces; las que no existen se marcan para no mandar a un 404.
  const re = new RegExp(`(^|[\\s(«"'])((?:https?:\\/\\/[^\\s/<>"')]+)?(\\/${PREFIJOS}(?:\\/[A-Za-z0-9_\\-.]*[A-Za-z0-9_])*))`, 'g');
  salida = fueraDeEnlaces(salida, (tramo) => tramo
    // Una ruta entre comillas de código: se muestra como enlace, no como código.
    .replace(new RegExp(`\\x60((?:https?:\\/\\/[^\\s/\\x60]+)?\\/${PREFIJOS}(?:\\/[A-Za-z0-9_\\-.]*[A-Za-z0-9_])*)\\x60`, 'g'), ' $1')
    .replace(re, (_m, previo: string, _completa: string, ruta: string) => {
      if (rutaEsReal(ruta, permitidos)) return `${previo}[${etiquetaDeRuta(ruta)}](${ruta})`;
      descartados.push(ruta);
      return `${previo}(pantalla no verificada)`;
    }));

  return { texto: salida.replace(/ {2,}/g, ' ').replace(/^ /, ''), descartados };
}

/**
 * Cuando la respuesta nombra una pantalla por su nombre exacto («Registro de
 * actividad») sin enlazarla, se le pone el enlace en la primera mención. Solo
 * nombres largos (los cortos como «Facturas» se confundirían con una palabra
 * común) y solo pantallas que la persona puede abrir.
 */
export function enlazarNombresDePantalla(
  texto: string,
  puedeAbrir: (e: { modulo: string; permiso?: string }) => boolean = () => true,
): string {
  const yaEnlazadas = new Set<string>();
  for (const m of texto.matchAll(/\]\((\/[^)\s]+)\)/g)) yaEnlazadas.add(m[1]);

  const candidatas = MAPA_SISTEMA
    .filter((e) => e.titulo.length >= 12 && !yaEnlazadas.has(e.ruta) && puedeAbrir(e))
    .sort((a, b) => b.titulo.length - a.titulo.length);

  const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let salida = texto;
  for (const e of candidatas) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapar(e.titulo)})(?![\\p{L}\\p{N}])`, 'iu');
    let hecho = false;
    salida = fueraDeEnlaces(salida, (tramo) => {
      if (hecho) return tramo;
      return tramo.replace(re, (_m, previo: string, nombre: string) => {
        hecho = true;
        return `${previo}[${nombre}](${e.ruta})`;
      });
    });
  }
  return salida;
}
