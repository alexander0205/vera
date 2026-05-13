'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { SecuenciaInfo } from '../utils/types';

/**
 * Carga la información de la próxima secuencia NCF para un tipo dado.
 * Mantiene un caché en memoria por tipo para evitar refetch al alternar
 * entre tipos rápidamente.
 *
 * onPieDeFactura: callback opcional que se llama cuando se carga un
 * pieDeFactura para que el form pueda pre-poblarlo.
 */
export function useSecuencia(tipoEcf: string, onPieDeFactura?: (pie: string) => void) {
  const [secuencia, setSecuencia] = useState<SecuenciaInfo | null>(null);
  const cache = useRef<Map<string, SecuenciaInfo>>(new Map());
  const onPieRef = useRef(onPieDeFactura);
  useEffect(() => { onPieRef.current = onPieDeFactura; }, [onPieDeFactura]);

  const recargar = useCallback((tipo: string) => {
    if (tipo === 'sin-ncf') {
      const sin: SecuenciaInfo = { encf: null, disponibles: 0, agotada: false, sinNcf: true };
      cache.current.set(tipo, sin);
      setSecuencia(sin);
      return;
    }
    setSecuencia(null);
    fetch(`/api/secuencias/proximo?tipo=${tipo}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: SecuenciaInfo) => {
        cache.current.set(tipo, d);
        setSecuencia(d);
        if (d.pieDeFactura && onPieRef.current) onPieRef.current(d.pieDeFactura);
      })
      .catch(() => {
        const err: SecuenciaInfo = { encf: null, disponibles: 0, agotada: false, sinSecuencia: true };
        setSecuencia(err);
      });
  }, []);

  useEffect(() => {
    const cached = cache.current.get(tipoEcf);
    if (cached) {
      setSecuencia(cached);
      if (cached.pieDeFactura && onPieRef.current) onPieRef.current(cached.pieDeFactura);
      return;
    }
    recargar(tipoEcf);
  }, [tipoEcf, recargar]);

  /** Invalida el caché de un tipo (o el actual) y vuelve a cargar */
  const invalidar = useCallback((tipo?: string) => {
    const t = tipo ?? tipoEcf;
    cache.current.delete(t);
    recargar(t);
  }, [tipoEcf, recargar]);

  return { secuencia, setSecuencia, recargar, invalidar };
}
