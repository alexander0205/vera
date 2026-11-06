/**
 * Estado de un e-CF según ecf-api → estado de Zero.
 *
 * Lo comparten el botón «Consultar» (`/api/ecf/estado`) y el cron que
 * refresca los comprobantes que siguen «En proceso». Un estado que no
 * reconoce deja el actual: nunca borra un veredicto con una respuesta rara.
 */
const MAPA_ESTADOS: Record<string, string> = {
  ACEPTADO:             'ACEPTADO',
  ACEPTADO_CONDICIONAL: 'ACEPTADO_CONDICIONAL',
  ENVIADO:              'EN_PROCESO',
  PENDIENTE:            'EN_PROCESO',
  RECHAZADO:            'RECHAZADO',
  ERROR:                'RECHAZADO',
};

export function estadoZeroDesdeEcfApi(estadoEcfApi: unknown, estadoActual: string): string {
  const clave = String(estadoEcfApi ?? '').trim().toUpperCase().replace(/\s+/g, '_');
  return MAPA_ESTADOS[clave] ?? estadoActual;
}

/** Estados en los que Zero sigue esperando el veredicto de la DGII. */
export const ESTADO_PENDIENTE_DGII = 'EN_PROCESO';
