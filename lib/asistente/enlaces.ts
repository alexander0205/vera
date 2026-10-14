import { MAPA_SISTEMA } from './mapa-sistema';

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

export function rutaEsReal(url: string): boolean {
  const r = rutaLimpia(url);
  if (!r) return false;
  return FIJAS.has(r) || PATRONES_REGISTRO.some((p) => p.patron.test(r));
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
export function sanitizarEnlaces(texto: string): ResultadoSaneado {
  const descartados: string[] = [];

  // [texto](destino)
  let salida = texto.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, etiqueta: string, destino: string) => {
    const r = rutaLimpia(destino);
    if (r && rutaEsReal(r)) return `[${etiqueta}](${r})`;
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
      if (rutaEsReal(ruta)) return m;
      descartados.push(ruta);
      return `${previo}(pantalla no verificada)${resto}`;
    });

  return { texto: salida, descartados };
}
