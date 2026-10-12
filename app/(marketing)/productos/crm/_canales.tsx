'use client';

/**
 * Los canales, uno a la vez.
 *
 * En lista, seis tarjetas iguales se leen como un inventario y nadie las lee.
 * Con pestañas, el visitante entra por el canal que le importa —el que usan sus
 * clientes— y lee solo eso, que es además lo que va a preguntar en la demo.
 *
 * La pestaña activa se marca con `aria-pressed` y el panel se queda montado:
 * el texto de los seis está en el HTML, así que un buscador los lee todos
 * aunque en pantalla se vea uno.
 */

import { useState } from 'react';
import { Cheque } from '../../_piezas';

export type Canal = {
  clave: string;
  nombre: string;
  titular: string;
  detalle: string;
  puntos: readonly string[];
};

export function Canales({ canales }: { canales: readonly Canal[] }) {
  const [activo, setActivo] = useState(0);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-2">
        {canales.map((c, i) => (
          <button
            key={c.clave}
            type="button"
            onClick={() => setActivo(i)}
            aria-pressed={i === activo}
            className={`h-[34px] cursor-pointer whitespace-nowrap rounded-lg px-3.5 text-[12.5px] font-semibold transition ${
              i === activo
                ? 'bg-white text-zero-600 shadow-[0_1px_3px_rgba(15,17,24,.12)]'
                : 'text-[#5c6373] hover:text-zero-600'
            }`}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-[#e7edfb] bg-white p-5 sm:p-6">
        {canales.map((c, i) => (
          <div key={c.clave} className={i === activo ? 'block' : 'hidden'}>
            <p className="m-0 font-[family-name:var(--font-display)] text-[15.5px] font-semibold tracking-[-.02em] text-[#102a72]">
              {c.titular}
            </p>
            <p className="m-0 mt-2 text-pretty text-[13px] leading-[1.55] text-[#5c6373]">{c.detalle}</p>
            <ul className="m-0 mt-3.5 flex list-none flex-col gap-2 p-0">
              {c.puntos.map(p => (
                <li key={p} className="flex min-w-0 items-start gap-2.5 text-[12.5px] leading-[1.5] text-[#3b4252]">
                  <Cheque tamano={11} color="#3658e1" grosor={3.4} />
                  <span className="min-w-0">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
