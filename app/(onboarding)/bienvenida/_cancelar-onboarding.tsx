'use client';

/**
 * Salida del onboarding cuando se está creando una empresa ADICIONAL.
 *
 * Solo se muestra si el usuario tiene otra empresa a la que volver (lo decide la
 * página). Confirma antes de descartar: es una acción que se lleva lo
 * configurado hasta aquí, aunque sean pocos datos.
 */

import { useState } from 'react';

export function CancelarOnboarding({ teamId }: { teamId: number }) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descartar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/empresa/descartar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cancelar');
      // Recarga entera (no router.push): el team activo cambió en el servidor y
      // hay que releer la sesión, no navegar con el estado en caché.
      window.location.href = '/dashboard';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cancelar');
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm font-medium text-gray-400 transition hover:text-gray-700"
      >
        Cancelar
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-gray-950">
              ¿Cancelar la creación de esta empresa?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Se descarta lo que configuraste aquí y vuelves a tu empresa anterior. Esta empresa a
              medias no se guarda.
            </p>

            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setAbierto(false); setError(null); }}
                disabled={enviando}
                className="h-10 rounded-xl px-4 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-60"
              >
                Seguir con el registro
              </button>
              <button
                type="button"
                onClick={descartar}
                disabled={enviando}
                className="h-10 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {enviando ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
