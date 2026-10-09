'use client';

/**
 * El botón de reenviar. Lo único que necesita cliente en esta pantalla.
 *
 * Se mantiene deshabilitado unos segundos después de un envío correcto: sin
 * eso, el impulso natural es volver a pulsarlo porque el correo tarda unos
 * segundos en llegar, y acaban tres iguales en la bandeja.
 */

import { useState, useTransition } from 'react';
import { Loader2, Send } from 'lucide-react';
import { reenviarVerificacion } from './actions';

/** Lo que tarda un correo en llegar, más margen. */
const ESPERA_MS = 20_000;

export function Reenviar() {
  const [pendiente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [enEspera, setEnEspera] = useState(false);

  function reenviar() {
    startTransition(async () => {
      const r = await reenviarVerificacion();
      if (r.error) {
        setAviso({ tipo: 'error', texto: r.error });
        return;
      }
      setAviso({ tipo: 'ok', texto: r.success ?? 'Enviado.' });
      setEnEspera(true);
      setTimeout(() => setEnEspera(false), ESPERA_MS);
    });
  }

  return (
    <div className="mt-5">
      <button
        type="button" onClick={reenviar} disabled={pendiente || enEspera}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-[15px] font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
      >
        {pendiente
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
          : enEspera
            ? 'Enviado — espera un momento'
            : <><Send className="h-4 w-4" /> Reenviar el enlace</>}
      </button>

      {aviso && (
        <p
          role="status"
          className={`mt-3 rounded-xl px-4 py-3 text-sm ${
            aviso.tipo === 'ok'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
