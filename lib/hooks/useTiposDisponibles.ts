'use client';

/**
 * useTiposDisponibles
 *
 * Determina qué tipos de e-CF mostrar en los dropdowns de comprobante.
 * Regla de negocio:
 *   - e31 y e32 SIEMPRE visibles (aunque no exista secuencia activa).
 *   - sin-ncf siempre visible (no consume secuencia).
 *   - El resto (33,34,41,43,44,45,46,47) solo si hay una secuencia ACTIVA
 *     (estado='activa' y con disponibles) para ese tipo.
 *
 * Uso:
 *   const { tipoVisible, isLoading } = useTiposDisponibles();
 *   options.filter(o => tipoVisible(o.value))
 */

import useSWR from 'swr';

const SIEMPRE_VISIBLES = new Set(['31', '32', 'sin-ncf']);

interface SeqRow {
  tipoEcf:     string;
  estado:      'activa' | 'vencida' | 'agotada';
  disponibles: number;
}

const fetcher = (url: string) =>
  fetch(url).then(r => (r.ok ? r.json() : { sequences: [] }));

export function useTiposDisponibles() {
  const { data, isLoading } = useSWR<{ sequences?: SeqRow[] }>(
    '/api/secuencias',
    fetcher,
    { revalidateOnFocus: false },
  );

  const activos = new Set(
    (data?.sequences ?? [])
      .filter(s => s.estado === 'activa' && (s.disponibles === -1 || s.disponibles > 0))
      .map(s => s.tipoEcf),
  );

  /** ¿Mostrar este tipo en el dropdown? e31/e32/sin-ncf siempre; resto solo con secuencia activa. */
  const tipoVisible = (tipo: string) => SIEMPRE_VISIBLES.has(tipo) || activos.has(tipo);

  return { tipoVisible, activos, isLoading };
}
