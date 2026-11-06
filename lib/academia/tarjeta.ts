/**
 * Cuándo se le enseña a una persona la tarjeta de tutorial de una pantalla.
 *
 * Regla (la del diseño aprobado):
 *  - Sale como MUCHO UNA VEZ POR DÍA (se guarda cuándo salió: diez recargas el
 *    mismo día no la muestran diez veces) y en `MAX_VECES` días distintos como
 *    máximo, y solo si hay un video publicado para esa pantalla.
 *  - «Ahora no» la esconde por hoy (hasta la medianoche de República Dominicana).
 *  - «No mostrar más» la quita para siempre para esa persona.
 *  - Si ya vio el video completo, no vuelve a salir.
 *  - El botón «Aprender» del encabezado NO depende de nada de esto: está
 *    siempre que haya video.
 *
 * Puro: sin base y sin reloj propio (la hora entra por parámetro).
 */

export const MAX_VECES = 3;

/** República Dominicana: UTC-4 todo el año, sin horario de verano. */
const DESFASE_RD_MS = 4 * 3600 * 1000;
const DIA_MS = 24 * 3600 * 1000;

export interface EstadoTarjeta {
  nunca: boolean;
  ocultaHasta: Date | null;
  vecesMostrada: number;
  /** Última vez que SALIÓ en pantalla. Solo la mueve `mostrada`: descartar o deshacer no la tocan. */
  mostradaEn: Date | null;
}

export const ESTADO_NUEVO: EstadoTarjeta = { nunca: false, ocultaHasta: null, vecesMostrada: 0, mostradaEn: null };

export type AccionTarjeta = 'mostrada' | 'ahora_no' | 'nunca' | 'deshacer';
export const ACCIONES_TARJETA: readonly AccionTarjeta[] = ['mostrada', 'ahora_no', 'nunca', 'deshacer'];

export const esAccionTarjeta = (a: unknown): a is AccionTarjeta =>
  typeof a === 'string' && (ACCIONES_TARJETA as readonly string[]).includes(a);

/** El día calendario de RD de un instante, como número de días (para comparar). */
function diaRd(d: Date): number {
  return Math.floor((d.getTime() - DESFASE_RD_MS) / DIA_MS);
}

/** La próxima medianoche de RD después de `ahora`. */
export function proximaMedianocheRd(ahora: Date): Date {
  return new Date((diaRd(ahora) + 1) * DIA_MS + DESFASE_RD_MS);
}

export function debeMostrarTarjeta(d: {
  estado: EstadoTarjeta | null | undefined;
  hayVideo: boolean;
  /** Todos los videos de la pantalla ya fueron vistos completos. */
  todoVisto: boolean;
  ahora: Date;
}): boolean {
  if (!d.hayVideo || d.todoVisto) return false;
  const e = d.estado ?? ESTADO_NUEVO;
  if (e.nunca) return false;
  if (e.ocultaHasta && e.ocultaHasta.getTime() > d.ahora.getTime()) return false;
  if (e.mostradaEn && diaRd(e.mostradaEn) === diaRd(d.ahora)) return false;
  return e.vecesMostrada < MAX_VECES;
}

/** El estado que queda después de una acción. No cambia el que recibe. */
export function siguienteEstado(e: EstadoTarjeta | null | undefined, accion: AccionTarjeta, ahora: Date): EstadoTarjeta {
  const base = e ?? ESTADO_NUEVO;
  switch (accion) {
    case 'ahora_no':
      return { ...base, ocultaHasta: proximaMedianocheRd(ahora) };
    case 'nunca':
      return { ...base, nunca: true };
    case 'deshacer':
      // Solo levanta lo que se descartó; el conteo de días no se toca.
      return { ...base, nunca: false, ocultaHasta: null };
    case 'mostrada': {
      // Salir diez veces el mismo día cuenta una.
      if (base.mostradaEn && diaRd(base.mostradaEn) === diaRd(ahora)) return base;
      return { ...base, vecesMostrada: base.vecesMostrada + 1, mostradaEn: ahora };
    }
  }
}

/** ¿Hay algún filtro puesto? Con todos vacíos es la primera vez de verdad (estado vacío sin buscar nada). */
export function sinFiltros(valores: Readonly<Record<string, string | null | undefined>>): boolean {
  return Object.values(valores).every((v) => !v || !String(v).trim());
}

/**
 * ¿Se ofrece el tutorial de «primera vez» en el estado vacío de una lista?
 * Solo con una respuesta CORRECTA de 0 registros y sin ningún filtro: si la
 * carga falló, «0» no significa «no hay nada» y no se le dice a nadie que es nuevo.
 */
export function puedeOfrecerPrimeraVez(d: {
  cargando: boolean; cargaOk: boolean; total: number; filtros: Readonly<Record<string, string | null | undefined>>;
}): boolean {
  return !d.cargando && d.cargaOk && d.total === 0 && sinFiltros(d.filtros);
}
