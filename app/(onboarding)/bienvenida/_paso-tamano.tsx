'use client';

/**
 * Paso 2 — el tamaño.
 *
 * Una sola pregunta, y honesta: los planes de cada familia se diferencian
 * LITERALMENTE en este número —comprobantes al mes en e-CF, estudiantes en
 * colegio—, así que no es una pregunta de mercadeo disfrazada de encuesta.
 * Es el dato que decide, y por eso se puede preguntar sin rodeos.
 *
 * El texto dice explícitamente que se puede cambiar después. Quien duda entre
 * dos escalones se paraliza si cree que está firmando algo.
 */

import { useActionState, useState } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { guardarTamano } from './actions';
import type { ActionState } from '@/lib/auth/middleware';

export function PasoTamano({ razonSocial, pregunta }: {
  razonSocial: string;
  pregunta: { titulo: string; ayuda: string; opciones: Array<{ valor: number; etiqueta: string }> };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    guardarTamano, { error: '' },
  );
  const [elegido, setElegido] = useState<number | null>(null);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zero-600">{razonSocial}</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-[30px] font-semibold tracking-[-0.02em] text-gray-950">
        {pregunta.titulo}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-gray-500">{pregunta.ayuda}</p>

      <form action={formAction} className="mt-8 space-y-6">
        <fieldset>
          <legend className="sr-only">{pregunta.titulo}</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {pregunta.opciones.map((o) => (
              <label key={o.valor}
                className={[
                  'flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition',
                  elegido === o.valor
                    ? 'border-zero-500 bg-zero-50/60 ring-4 ring-zero-500/10'
                    : 'border-gray-200 bg-white hover:border-gray-300',
                ].join(' ')}
              >
                <input
                  type="radio" name="tamano" value={o.valor} required
                  checked={elegido === o.valor} onChange={() => setElegido(o.valor)}
                  className="h-4 w-4 border-gray-300 text-zero-600 focus:ring-zero-500/30"
                />
                <span className="text-[15px] font-semibold text-gray-900">{o.etiqueta}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {state?.error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <button
          type="submit" disabled={pending || elegido === null}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zero-600 text-[15px] font-semibold text-white transition hover:bg-zero-700 disabled:opacity-40"
        >
          {pending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
            : <>Ver mi plan <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>
    </div>
  );
}
