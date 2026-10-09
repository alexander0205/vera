/**
 * Año escolar dominicano — defaults y enlace entre las dos fechas.
 *
 * El calendario es el mismo en todos los colegios del país: arranca en agosto y
 * cierra en junio. Pedirle al director que teclee dos fechas que ya sabemos es
 * trabajo regalado, y encima invita a errores (un año escolar de 3 meses porque
 * se equivocó en el año).
 *
 * Client-safe: sin dependencias de servidor.
 */

/** Mes de inicio (0 = enero). Agosto. */
const MES_INICIO = 7;
/** Mes de cierre. Junio. */
const MES_FIN = 5;
const DIA_FIN = 30;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * El año escolar al que pertenece una fecha. De enero a julio todavía se está
 * cursando el año que empezó el agosto anterior — por eso el corte es agosto y
 * no enero.
 */
export function anioEscolarDe(hoy: Date): { inicio: number; fin: number } {
  const y = hoy.getFullYear();
  return hoy.getMonth() >= MES_INICIO ? { inicio: y, fin: y + 1 } : { inicio: y - 1, fin: y };
}

/** "2026-2027" */
export function nombreAnioEscolar(hoy: Date): string {
  const { inicio, fin } = anioEscolarDe(hoy);
  return `${inicio}-${fin}`;
}

/** Fechas por defecto de un año escolar: 1 de agosto → 30 de junio. */
export function fechasPorDefecto(hoy: Date): { fechaInicio: string; fechaFin: string } {
  const { inicio, fin } = anioEscolarDe(hoy);
  return {
    fechaInicio: ymd(new Date(inicio, MES_INICIO, 1)),
    fechaFin:    ymd(new Date(fin, MES_FIN, DIA_FIN)),
  };
}

/**
 * Lee un nombre tipo "2026-2027" y devuelve sus fechas. Así, si el director
 * escribe el nombre, las fechas se acomodan solas. Devuelve null si el nombre
 * no tiene esa forma (nombres libres como "Verano 2026" se respetan).
 */
export function fechasDesdeNombre(nombre: string): { fechaInicio: string; fechaFin: string } | null {
  const m = nombre.trim().match(/^(\d{4})\s*[-–/]\s*(\d{4})$/);
  if (!m) return null;
  const inicio = Number(m[1]);
  const fin    = Number(m[2]);
  // Un año escolar cruza exactamente un cambio de año. "2026-2030" es un error
  // de tecleo, no un período: mejor no tocar las fechas.
  if (fin !== inicio + 1) return null;
  return {
    fechaInicio: ymd(new Date(inicio, MES_INICIO, 1)),
    fechaFin:    ymd(new Date(fin, MES_FIN, DIA_FIN)),
  };
}

/**
 * Mueve la otra fecha conservando la duración.
 *
 * Se conserva el LARGO en vez de forzar "siempre 11 meses" porque hay períodos
 * cortos legítimos (un verano, un cuatrimestre). Si el director corrió el inicio
 * dos semanas, lo que quiere es correr todo el período dos semanas — no que el
 * sistema le imponga un calendario.
 */
export function moverConservandoDuracion(
  cambiada: 'inicio' | 'fin',
  valorNuevo: string,
  fechaInicio: string,
  fechaFin: string,
): { fechaInicio: string; fechaFin: string } {
  // Sin la otra punta no hay duración que conservar.
  if (!fechaInicio || !fechaFin || !valorNuevo) {
    return cambiada === 'inicio'
      ? { fechaInicio: valorNuevo, fechaFin }
      : { fechaInicio, fechaFin: valorNuevo };
  }

  const dias = Math.round(
    (new Date(fechaFin + 'T00:00:00').getTime() - new Date(fechaInicio + 'T00:00:00').getTime()) / 86_400_000,
  );
  const base = new Date(valorNuevo + 'T00:00:00');

  if (cambiada === 'inicio') {
    const fin = new Date(base); fin.setDate(fin.getDate() + dias);
    return { fechaInicio: valorNuevo, fechaFin: ymd(fin) };
  }
  const ini = new Date(base); ini.setDate(ini.getDate() - dias);
  return { fechaInicio: ymd(ini), fechaFin: valorNuevo };
}

/** Texto de apoyo bajo las fechas: "11 meses · 334 días". */
export function duracionLegible(fechaInicio: string, fechaFin: string): string | null {
  if (!fechaInicio || !fechaFin) return null;
  const ini = new Date(fechaInicio + 'T00:00:00');
  const fin = new Date(fechaFin + 'T00:00:00');
  const dias = Math.round((fin.getTime() - ini.getTime()) / 86_400_000);
  if (dias < 0) return 'La fecha de fin es anterior a la de inicio';
  const meses = Math.round(dias / 30.4);
  return `${meses} ${meses === 1 ? 'mes' : 'meses'} · ${dias} días`;
}
