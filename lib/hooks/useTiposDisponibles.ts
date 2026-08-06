'use client';

/**
 * useTiposDisponibles
 *
 * Determina qué tipos de e-CF mostrar en los dropdowns de comprobante.
 * Regla de negocio:
 *   - GATE DGII: si la empresa NO está lista para emitir a DGII
 *     (/api/ecf/readiness → ready=false), SOLO se muestra `sin-ncf`.
 *     Nada de E31/E32 en ninguna pantalla de creación.
 *   - Con DGII lista: e31/e32/sin-ncf siempre visibles; el resto
 *     (33,34,41,43,44,45,46,47) solo si hay secuencia ACTIVA con disponibles.
 *
 * Uso:
 *   const { tipoVisible, dgiiReady, isLoading } = useTiposDisponibles();
 *   options.filter(o => tipoVisible(o.value))
 */

import useSWR from 'swr';
import { motivoBloqueoDgii, type Readiness } from '@/lib/hooks/useDgiiReadiness';
import { esTipoVentaFiscal } from '@/lib/ecf/categorias';

const SIEMPRE_VISIBLES = new Set(['31', '32', 'sin-ncf']);

interface SeqRow {
  tipoEcf:     string;
  estado:      'activa' | 'vencida' | 'agotada';
  disponibles: number;
}


const fetcher = (url: string) =>
  fetch(url).then(r => (r.ok ? r.json() : null));

export function useTiposDisponibles() {
  const { data, isLoading } = useSWR<{ sequences?: SeqRow[] } | null>(
    '/api/secuencias',
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: readiness, isLoading: loadingReadiness } = useSWR<Readiness | null>(
    '/api/ecf/readiness',
    fetcher,
    { revalidateOnFocus: false },
  );

  const activos = new Set(
    (data?.sequences ?? [])
      .filter(s => s.estado === 'activa' && (s.disponibles === -1 || s.disponibles > 0))
      .map(s => s.tipoEcf),
  );

  // Mientras carga readiness asumimos NO listo (default fiscal-deny): mejor
  // aparecer tarde que mostrar E31/E32 a una empresa sin DGII.
  const dgiiReady = readiness?.ready === true;

  /**
   * ¿Mostrar este tipo en el desplegable?
   *
   * Fuera de Producción se esconden solo los comprobantes de VENTA: lo que se
   * emitiría en TesteCF/CerteCF no vale ante la DGII. Las notas de crédito y
   * débito y los de compras y gastos siguen a la vista, porque son documentos
   * internos y el servidor bloquea su envío igual.
   */
  const tipoVisible = (tipo: string) => {
    if (tipo === 'sin-ncf') return true;
    if (!dgiiReady && esTipoVentaFiscal(tipo)) return false;
    if (!dgiiReady && !SIEMPRE_VISIBLES.has(tipo)) return activos.has(tipo);
    if (!dgiiReady) return false;
    return SIEMPRE_VISIBLES.has(tipo) || activos.has(tipo);
  };

  return {
    tipoVisible,
    activos,
    dgiiReady,
    /**
     * Si la DGII confirmó el ambiente de Producción. Sale del mismo readiness,
     * así que no hace falta una segunda petición para saberlo.
     */
    enProduccion: readiness?.enProduccion === true,
    ambiente: readiness?.ambiente ?? null,
    /** Por qué no hay tipos fiscales disponibles — para mostrarlo, no adivinarlo. */
    motivo: motivoBloqueoDgii(readiness ?? null),
    isLoading: isLoading || loadingReadiness,
  };
}
