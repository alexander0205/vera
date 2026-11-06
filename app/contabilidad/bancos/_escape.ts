'use client';

import { useEffect } from 'react';

/** Cierra un diálogo con la tecla Escape. */
export function useEscape(alPulsar: () => void, activo = true) {
  useEffect(() => {
    if (!activo) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') alPulsar(); };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, [alPulsar, activo]);
}
