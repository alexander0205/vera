'use client';

/**
 * useDgiiReadiness — ¿la empresa activa puede emitir e-CF fiscales?
 *
 * SWR a /api/ecf/readiness (solo requiere sesión — apto para cajeros POS sin
 * permisos de configuración). Mientras carga devuelve ready=false (default
 * fiscal-deny): nunca mostrar E31/E32 sin confirmación.
 */

import useSWR from 'swr';

interface Readiness {
  ready: boolean;
  rnc: boolean;
  registradaEcfApi: boolean;
  secuenciaFiscalActiva: boolean;
  habilitacionCompletada: boolean;
}

const fetcher = (url: string) => fetch(url).then(r => (r.ok ? r.json() : null));

export function useDgiiReadiness() {
  const { data, isLoading } = useSWR<Readiness | null>('/api/ecf/readiness', fetcher, {
    revalidateOnFocus: false,
  });
  return {
    ready: data?.ready === true,
    detalles: data ?? null,
    isLoading,
  };
}
