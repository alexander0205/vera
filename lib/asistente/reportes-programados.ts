/**
 * Reportes programados del asistente: qué se puede pedir, cuándo toca enviar
 * cada uno y con qué pregunta se arma. Sin imports de servidor.
 *
 * El contenido sale del mismo contestador local que responde en el chat (con
 * las mismas plantillas y los mismos datos de Reportes), así que lo que llega
 * por correo es lo que la persona vería si lo preguntara.
 */

export const TIPOS_REPORTE = ['ventas', 'cobros', 'clientes', 'itbis'] as const;
export const FRECUENCIAS_REPORTE = ['diaria', 'semanal', 'mensual'] as const;

export type TipoReporte = (typeof TIPOS_REPORTE)[number];
export type FrecuenciaReporte = (typeof FRECUENCIAS_REPORTE)[number];

export const ETIQUETA_TIPO: Record<TipoReporte, string> = {
  ventas: 'Ventas',
  cobros: 'Cobros por método de pago',
  clientes: 'Mejores clientes',
  itbis: 'Resumen de ITBIS',
};

export const ETIQUETA_FRECUENCIA: Record<FrecuenciaReporte, string> = {
  diaria: 'Cada día (con lo de ayer)',
  semanal: 'Cada lunes (con la semana pasada)',
  mensual: 'El día 1 (con el mes pasado)',
};

const PERIODO: Record<FrecuenciaReporte, string> = {
  diaria: 'ayer',
  semanal: 'la semana pasada',
  mensual: 'el mes pasado',
};

export const esTipoReporte = (x: unknown): x is TipoReporte => (TIPOS_REPORTE as readonly unknown[]).includes(x);
export const esFrecuenciaReporte = (x: unknown): x is FrecuenciaReporte => (FRECUENCIAS_REPORTE as readonly unknown[]).includes(x);

/** La pregunta que arma el reporte, tal como la escribiría la persona. */
export function preguntaDeReporte(tipo: TipoReporte, frecuencia: FrecuenciaReporte): string {
  const p = PERIODO[frecuencia];
  switch (tipo) {
    case 'ventas': return `cuanto vendi ${p}`;
    case 'cobros': return `cobros por metodo de pago ${p}`;
    case 'clientes': return `mis mejores clientes ${p}`;
    case 'itbis': return `resumen de itbis ${p}`;
  }
}

export function tituloDeReporte(tipo: TipoReporte, frecuencia: FrecuenciaReporte): string {
  const p = frecuencia === 'diaria' ? 'de ayer' : frecuencia === 'semanal' ? 'de la semana pasada' : 'del mes pasado';
  return `${ETIQUETA_TIPO[tipo]} ${p}`;
}

/** ¿Toca enviar hoy (fecha de RD, YYYY-MM-DD)? Lunes para el semanal, día 1 para el mensual. */
export function tocaHoy(frecuencia: FrecuenciaReporte, hoy: string): boolean {
  if (frecuencia === 'diaria') return true;
  if (frecuencia === 'semanal') return new Date(`${hoy}T00:00:00Z`).getUTCDay() === 1;
  return hoy.endsWith('-01');
}

/** Un reporte ya enviado hoy no se repite si el cron corre dos veces. */
export function yaEnviadoHoy(ultimoEnvio: Date | null, hoy: string, aYmdRd: (d: Date) => string): boolean {
  return ultimoEnvio != null && aYmdRd(ultimoEnvio) === hoy;
}
