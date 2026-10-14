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

/**
 * Deja solo enlaces a rutas reales (y los vuelve relativos). Un enlace
 * inventado se reemplaza por su texto, sin vínculo.
 */
export function sanitizarEnlaces(texto: string, permitidos?: ReadonlySet<string>): ResultadoSaneado {
  const descartados: string[] = [];

  // [texto](destino)
  let salida = texto.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, etiqueta: string, destino: string) => {
    const r = rutaLimpia(destino);
    if (r && rutaEsReal(r, permitidos)) return `[${etiqueta}](${r})`;
    descartados.push(destino);
    return etiqueta;
  });

  // Rutas sueltas del sistema escritas en el texto: «/dashboard/algo». Las
  // reales pasan; las que no existen se marcan para no mandar a un 404.
  salida = salida.replace(/(^|[\s(«"'])(\/(?:dashboard|contabilidad|escolar|nomina|pos|cuenta)(?:\/[A-Za-z0-9_\-.]+)*)/g,
    (m, previo: string, cruda: string) => {
      // El punto o la coma que cierra la oración no es parte de la ruta.
      const ruta = cruda.replace(/[.,;:]+$/, '');
      const resto = cruda.slice(ruta.length);
      if (rutaEsReal(ruta, permitidos)) return m;
      descartados.push(ruta);
      return `${previo}(pantalla no verificada)${resto}`;
    });

  return { texto: salida, descartados };
}
