'use client';

/**
 * Botón de copiar de los bloques de código.
 *
 * Cliente porque necesita el portapapeles. Si el navegador lo niega (página sin
 * HTTPS, permiso rechazado) no pasa nada: el texto sigue ahí para seleccionarlo
 * a mano, que es lo que se hacía antes de que existiera el botón.
 */

import { useState } from 'react';

export function BotonCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* sin portapapeles: el texto se puede seleccionar a mano */
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={copiado ? 'Copiado' : 'Copiar al portapapeles'}
      className="rounded-md border border-white/15 px-2.5 py-1 text-[11.5px] font-medium text-[#c9d4f5] transition hover:border-white/30 hover:text-white"
    >
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  );
}
