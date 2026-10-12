'use client';

/**
 * useDgiiReadiness — ¿la empresa activa puede emitir e-CF fiscales?
 *
 * SWR a /api/ecf/readiness (solo requiere sesión — apto para cajeros POS sin
 * permisos de configuración). Mientras carga devuelve ready=false (default
 * fiscal-deny): nunca mostrar E31/E32 sin confirmación.
 */

import useSWR from 'swr';

export interface Readiness {
  ready: boolean;
  rnc: boolean;
  registradaEcfApi: boolean;
  secuenciaFiscalActiva: boolean;
  habilitacionCompletada: boolean;
  enProduccion: boolean;
  ambiente: string | null;
  ambienteConfirmado: boolean;
  omitidoPorPrivilegio: boolean;
}

/**
 * Por qué no se puede emitir, en una línea para mostrarle al usuario.
 * null = sí se puede (o todavía no sabemos).
 */
export function motivoBloqueoDgii(r: Readiness | null): string | null {
  if (!r || r.ready) return null;
  if (!r.rnc) return 'Falta configurar el RNC de la empresa.';
  if (!r.registradaEcfApi) return 'Tu empresa aún no está conectada a la DGII.';
  if (!r.secuenciaFiscalActiva) return 'No hay una secuencia de e-NCF activa con números disponibles.';
  if (!r.ambienteConfirmado) return 'No se pudo confirmar con la DGII que tu empresa esté en Producción.';
  if (!r.enProduccion) {
    return `Tu empresa está en ambiente de pruebas de la DGII (${r.ambiente}). Solo puedes facturar sin comprobante fiscal hasta que aprueben el paso a Producción.`;
  }
  return 'Tu empresa aún no puede emitir comprobantes fiscales.';
}

const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : null));

export function useDgiiReadiness() {
  const { data, isLoading } = useSWR<Readiness | null>('/api/ecf/readiness', fetcher, {
    revalidateOnFocus: false,
  });
  return {
    ready: data?.ready === true,
    detalles: data ?? null,
    /** Texto listo para mostrar cuando no se puede emitir. */
    motivo: motivoBloqueoDgii(data ?? null),
    isLoading,
  };
}
