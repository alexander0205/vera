'use client';

/**
 * El recorrido de un mensaje: entra, el agente lo piensa, salen acciones.
 *
 * Es el diagrama que todo el mundo dibuja a mano en una reunión cuando explica
 * esto, y verlo moverse ahorra el párrafo. Avanza solo, paso a paso, y el
 * visitante puede adelantarlo tocando cualquier etapa.
 *
 * Sin librería de animación: son clases de Tailwind y un intervalo. Y con
 * `prefers-reduced-motion` no se mueve — se enciende todo y se queda quieto,
 * que es lo que pide quien marcó esa preferencia.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

const ETAPAS = [
  {
    clave: 'entra',
    rotulo: 'Entra',
    titulo: 'Por donde sea',
    detalle: 'WhatsApp, Messenger, Instagram, correo, tu web o una llamada. Texto, audio, foto o documento.',
    piezas: ['WhatsApp', 'Instagram', 'Correo', 'Llamada'],
  },
  {
    clave: 'entiende',
    rotulo: 'Entiende',
    titulo: 'Qué está pidiendo',
    detalle: 'Lee el mensaje aunque venga a medias o en audio, y reconoce de qué trámite habla y quién lo manda.',
    piezas: ['Lenguaje natural', 'Voz a texto', 'OCR de la foto'],
  },
  {
    clave: 'busca',
    rotulo: 'Busca',
    titulo: 'En lo tuyo, no en internet',
    detalle: 'Consulta tus documentos, tu expediente y tus sistemas. Si no está, lo dice en vez de inventarlo.',
    piezas: ['Tus reglamentos', 'Tu expediente', 'Tu agenda'],
  },
  {
    clave: 'actua',
    rotulo: 'Actúa',
    titulo: 'Y deja el trabajo hecho',
    detalle: 'Verifica identidad, agenda la cita, manda el enlace de pago y escribe de vuelta en tu sistema.',
    piezas: ['Verifica', 'Agenda', 'Cobra', 'Escribe de vuelta'],
  },
  {
    clave: 'aprende',
    rotulo: 'Guarda',
    titulo: 'Para la próxima',
    detalle: 'Todo queda en la ficha: lo que se habló, lo que se hizo y en qué quedó. La próxima no empieza de cero.',
    piezas: ['Ficha al día', 'Memoria larga', 'Reportes'],
  },
] as const;

const PASO_MS = 2600;

export function RecorridoIA() {
  const [activa, setActiva] = useState(0);
  const [automatico, setAutomatico] = useState(true);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);

  const sinMovimiento = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    if (!automatico || sinMovimiento) return;
    reloj.current = setInterval(() => setActiva(a => (a + 1) % ETAPAS.length), PASO_MS);
    return () => { if (reloj.current) clearInterval(reloj.current); };
  }, [automatico, sinMovimiento]);

  function elegir(i: number) {
    setAutomatico(false);
    setActiva(i);
  }

  return (
    <div className="min-w-0">
      {/* La línea de etapas. En móvil se apilan y la barra se vuelve vertical
          por el borde izquierdo. */}
      <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-5">
        {ETAPAS.map((e, i) => {
          const on = sinMovimiento || i <= activa;
          const actual = !sinMovimiento && i === activa;
          return (
            <li key={e.clave} className="min-w-0">
              <button
                type="button"
                onClick={() => elegir(i)}
                aria-current={actual ? 'step' : undefined}
                className="w-full cursor-pointer text-left"
              >
                <span
                  className={`block h-1 rounded-full transition-all duration-500 ${
                    on ? 'bg-zero-600' : 'bg-white/20'
                  } ${actual ? 'shadow-[0_0_14px_rgba(54,88,225,.9)]' : ''}`}
                />
                <span className={`mt-2.5 block text-[11px] font-semibold uppercase tracking-[.14em] transition ${
                  on ? 'text-white' : 'text-white/35'
                }`}
                >
                  {e.rotulo}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <p className="m-0 font-[family-name:var(--font-display)] text-[clamp(1.3rem,2.6vw,1.6rem)] font-semibold leading-[1.15] tracking-[-.035em] text-balance text-white">
            {ETAPAS[activa].titulo}
          </p>
          <p className="m-0 mt-3 max-w-[460px] text-pretty text-[13.5px] leading-[1.6] text-white/70">
            {ETAPAS[activa].detalle}
          </p>
        </div>

        <ul className="m-0 flex min-w-0 list-none flex-wrap gap-2 p-0">
          {ETAPAS[activa].piezas.map(pieza => (
            <li
              key={pieza}
              className="rounded-full border border-white/15 bg-white/[.06] px-3.5 py-2 text-[12px] font-medium text-white/85"
            >
              {pieza}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
