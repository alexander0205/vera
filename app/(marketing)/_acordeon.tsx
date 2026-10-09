'use client';

/**
 * Acordeón de preguntas frecuentes.
 *
 * Una sola abierta a la vez y la primera abierta de entrada: la maqueta lo
 * hace así y tiene sentido — la primera pregunta es la que más se hace, y
 * abierta demuestra de un vistazo que esto se despliega.
 *
 * Las respuestas se pintan siempre en el HTML y solo se ocultan con CSS: si se
 * montaran al abrir, un buscador no las leería nunca y las preguntas frecuentes
 * son justo el contenido que se busca desde fuera.
 */

import { useState } from 'react';

export type Pregunta = { pregunta: string; respuesta: string };

export function Acordeon({ preguntas }: { preguntas: readonly Pregunta[] }) {
  const [abierta, setAbierta] = useState(0);

  return (
    <div className="border-t border-[#edeff5]">
      {preguntas.map((q, i) => {
        const on = abierta === i;
        return (
          <div key={q.pregunta} className="border-b border-[#edeff5]">
            <button
              type="button"
              onClick={() => setAbierta(on ? -1 : i)}
              aria-expanded={on}
              className="flex w-full cursor-pointer items-center gap-4 py-4 text-left"
            >
              <span className={`min-w-0 flex-1 text-sm font-semibold transition ${on ? 'text-zero-600' : 'text-[#0f1118]'}`}>
                {q.pregunta}
              </span>
              <span
                className={`grid size-[26px] shrink-0 place-items-center rounded-lg transition duration-200 ${
                  on ? 'rotate-45 bg-zero-600 text-white' : 'bg-[#f2f4fa] text-gray-500'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                  <path d="M12 5.5v13M5.5 12h13" />
                </svg>
              </span>
            </button>
            <p className={`m-0 pb-5 pr-4 text-[13.5px] leading-relaxed text-[#5c6373] sm:pr-14 ${on ? '' : 'hidden'}`}>
              {q.respuesta}
            </p>
          </div>
        );
      })}
    </div>
  );
}
