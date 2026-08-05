'use client';

/**
 * useTiposDisponibles
 *
 * Determina qué tipos de e-CF mostrar en los dropdowns de comprobante.
 * Regla de negocio:
 *   - Si la empresa NO está en ambiente 'Produccion', ningún comprobante fiscal
 *     de VENTA se ofrece: lo que emitiría en TesteCF/CerteCF no tiene validez
 *     ante la DGII, así que solo queda 'sin-ncf'. Las notas de crédito/débito y
 *     los comprobantes de compras y gastos siguen visibles como documentos
 *     internos (el servidor bloquea su envío a la DGII de todos modos).
 *   - e31 y e32 SIEMPRE visibles en Producción (aunque no exista secuencia).
 *   - sin-ncf siempre visible (no consume secuencia).
 *   - El resto (33,34,41,43,44,45,46,47) solo si hay una secuencia ACTIVA
 *     (estado='activa' y con disponibles) para ese tipo.
 *
 * Uso:
 *   const { tipoVisible, enProduccion, isLoading } = useTiposDisponibles();
 *   options.filter(o => tipoVisible(o.value))
 */

import useSWR from 'swr';
import { esTipoVentaFiscal } from '@/lib/ecf/categorias';

const SIEMPRE_VISIBLES = new Set(['31', '32', 'sin-ncf']);

interface SeqRow {
  tipoEcf:     string;
  estado:      'activa' | 'vencida' | 'agotada';
  disponibles: number;
}

const fetcher = (url: string) =>
  fetch(url).then(r => (r.ok ? r.json() : { sequences: [] }));

const ambienteFetcher = (url: string) =>
  fetch(url).then(r => (r.ok ? r.json() : { ambiente: null }));

export function useTiposDisponibles() {
  const { data, isLoading } = useSWR<{ sequences?: SeqRow[] }>(
    '/api/secuencias',
    fetcher,
    { revalidateOnFocus: false },
  );

  const { data: amb, isLoading: cargandoAmbiente } = useSWR<{ ambiente: string | null }>(
    '/api/sistema/ambiente',
    ambienteFetcher,
    { revalidateOnFocus: false },
  );

  /**
   * Mientras no sepamos el ambiente asumimos que NO es Producción. Es el lado
   * seguro: mostrar de más un tipo fiscal invita a emitir algo sin validez, y
   * el servidor lo rechazaría igual.
   */
  const enProduccion = amb?.ambiente === 'Produccion';

  const activos = new Set(
    (data?.sequences ?? [])
      .filter(s => s.estado === 'activa' && (s.disponibles === -1 || s.disponibles > 0))
      .map(s => s.tipoEcf),
  );

  const tipoVisible = (tipo: string) => {
    if (!enProduccion && esTipoVentaFiscal(tipo)) return false;
    return SIEMPRE_VISIBLES.has(tipo) || activos.has(tipo);
  };

  return {
    tipoVisible,
    activos,
    enProduccion,
    ambiente: amb?.ambiente ?? null,
    isLoading: isLoading || cargandoAmbiente,
  };
}
