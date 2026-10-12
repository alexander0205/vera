'use client';

/**
 * El agente contestando, en vivo sobre la página.
 *
 * Contar que «responde al instante y verifica la identidad» no convence a
 * nadie; verlo contestar sí. Cada caso es una conversación real de las que
 * atiende —una inscripción, una cita, un balance, una consulta de normativa— y
 * se escribe sola, con su pausa entre mensaje y mensaje.
 *
 * Las notas grises entre mensajes son lo que el sistema hizo por su cuenta
 * mientras conversaba: validar contra el expediente, escribir la cita, mandar
 * el enlace de pago. Es la parte que no se ve en un chat y es justo la que se
 * está vendiendo.
 *
 * Respeta `prefers-reduced-motion`: con el sistema en «menos movimiento», la
 * conversación aparece entera y no se anima.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

type Turno =
  | { de: 'cliente' | 'agente'; texto: string }
  | { de: 'sistema'; texto: string };

type Caso = {
  clave: string;
  pestana: string;
  canal: string;
  quien: string;
  turnos: Turno[];
};

const CASOS: Caso[] = [
  {
    clave: 'inscripcion',
    pestana: 'Una inscripción',
    canal: 'WhatsApp',
    quien: 'Isabel R.',
    turnos: [
      { de: 'cliente', texto: 'Buenas, quisiera información para inscribir a mi hijo en pre-primero.' },
      { de: 'agente', texto: '¡Hola! Con gusto. Pre-primero tiene inscripción de RD$3,500 y mensualidad de RD$4,200. ¿Quiere agendar una visita al plantel?' },
      { de: 'cliente', texto: 'Sí, me interesa. ¿Qué días tienen disponibles?' },
      { de: 'sistema', texto: 'Consultó los cupos y la agenda en tiempo real' },
      { de: 'agente', texto: 'Tenemos jueves 10:30 a.m. y viernes 8:00 a.m. Le paso el enlace para que elija.' },
      { de: 'cliente', texto: 'Perfecto, jueves. Gracias.' },
      { de: 'sistema', texto: 'Cita agendada · Ficha creada · Recordatorio programado 24 h antes' },
    ],
  },
  {
    clave: 'balance',
    pestana: 'Un balance',
    canal: 'WhatsApp',
    quien: 'Ramón P.',
    turnos: [
      { de: 'cliente', texto: '¿Cuánto debo de la mensualidad de septiembre?' },
      { de: 'agente', texto: 'Para darle ese dato necesito confirmar su identidad. ¿Me indica su cédula?' },
      { de: 'cliente', texto: '001-1234567-8' },
      { de: 'sistema', texto: 'Mandó un código por SMS y lo validó contra el expediente' },
      { de: 'agente', texto: 'Gracias, don Ramón. Tiene RD$4,200 de septiembre, con vencimiento el 30. ¿Quiere pagarlo ahora?' },
      { de: 'cliente', texto: 'Sí, mándame el link.' },
      { de: 'sistema', texto: 'Enlace de pago emitido · Al pagar, el recibo entra solo' },
    ],
  },
  {
    clave: 'reglamento',
    pestana: 'Una consulta de normativa',
    canal: 'Portal web',
    quien: 'Visitante',
    turnos: [
      { de: 'cliente', texto: '¿Cuántas horas de vuelo necesito para renovar la licencia?' },
      { de: 'sistema', texto: 'Buscó en los reglamentos y manuales cargados' },
      { de: 'agente', texto: 'Para la renovación se exigen 90 días de experiencia reciente. Lo dice el Artículo 61.57, en el RAD 61 · Licencias al personal, página 34.' },
      { de: 'cliente', texto: '¿Y si me vencieron hace más de un año?' },
      { de: 'agente', texto: 'Ahí el reglamento no lo resuelve directo: no tengo ese caso en los documentos cargados. Le paso con una persona para que lo confirme.' },
      { de: 'sistema', texto: 'No inventó lo que no está. Conversación asignada a un analista' },
    ],
  },
  {
    clave: 'llamada',
    pestana: 'Una llamada',
    canal: 'Teléfono',
    quien: 'Llamada entrante',
    turnos: [
      { de: 'sistema', texto: 'Entró una llamada a la central. La contesta el agente de voz' },
      { de: 'cliente', texto: '«Buenas, llamo para reprogramar la cita del jueves.»' },
      { de: 'agente', texto: '«Con gusto. ¿Me confirma su documento para buscar el trámite?»' },
      { de: 'cliente', texto: '«Cero cero uno, uno dos tres cuatro cinco seis siete, ocho.»' },
      { de: 'sistema', texto: 'Encontró el expediente y verificó que la cita es suya' },
      { de: 'agente', texto: '«Listo. Le quedó para el martes 9:00 a.m. Le mando la confirmación por WhatsApp.»' },
      { de: 'sistema', texto: 'Cita movida en el sistema · Confirmación enviada · Llamada guardada en la ficha' },
    ],
  },
];

const PAUSA = 1100;

export function DemoConversacion() {
  const [caso, setCaso] = useState(0);
  const [visibles, setVisibles] = useState(1);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El sistema del visitante manda: con «menos movimiento» no hay animación.
  const sinMovimiento = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const turnos = CASOS[caso].turnos;

  useEffect(() => {
    if (sinMovimiento) { setVisibles(turnos.length); return; }
    if (visibles >= turnos.length) return;
    temporizador.current = setTimeout(() => setVisibles(v => v + 1), PAUSA);
    return () => { if (temporizador.current) clearTimeout(temporizador.current); };
  }, [visibles, turnos.length, sinMovimiento]);

  function elegir(i: number) {
    if (temporizador.current) clearTimeout(temporizador.current);
    setCaso(i);
    setVisibles(sinMovimiento ? CASOS[i].turnos.length : 1);
  }

  const terminado = visibles >= turnos.length;

  return (
    <div className="min-w-0">
      {/* Los casos, como pestañas. Cambiar de caso reinicia la conversación. */}
      <div className="flex flex-wrap gap-2">
        {CASOS.map((c, i) => (
          <button
            key={c.clave}
            type="button"
            onClick={() => elegir(i)}
            aria-pressed={i === caso}
            className={`h-[34px] cursor-pointer whitespace-nowrap rounded-lg px-3.5 text-[12.5px] font-semibold transition ${
              i === caso
                ? 'bg-zero-600 text-white shadow-[0_8px_18px_-10px_rgba(54,88,225,.9)]'
                : 'border border-[#e4e8f4] bg-white text-[#3b4252] hover:border-zero-200'
            }`}
          >
            {c.pestana}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[#e7edfb] bg-white">
        <div className="flex items-center gap-2.5 border-b border-[#eef1f8] bg-[#f7f9ff] px-4 py-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-zero-600 text-[11px] font-semibold text-white">
            {CASOS[caso].quien.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-[#102a72]">{CASOS[caso].quien}</span>
            <span className="block text-[11px] text-[#666d80]">{CASOS[caso].canal}</span>
          </span>
          <span className="ml-auto inline-flex h-[20px] items-center gap-1.5 rounded-full bg-[#e8f6ee] px-2 text-[10px] font-semibold uppercase tracking-[.4px] text-[#0f7a4b]">
            <span className="size-1.5 rounded-full bg-[#25a366]" />
            Atendiendo el agente
          </span>
        </div>

        {/* `min-h` fijo: sin él, la tarjeta crece mensaje a mensaje y empuja
            media página hacia abajo mientras el visitante lee. */}
        <div className="flex min-h-[340px] flex-col gap-2.5 bg-[#fbfcff] p-4 sm:min-h-[360px]">
          {turnos.slice(0, visibles).map((t, i) => {
            if (t.de === 'sistema') {
              return (
                <p
                  key={i}
                  className="m-0 self-center text-pretty px-3 py-1 text-center text-[11px] font-medium leading-[1.45] text-[#666d80]"
                >
                  ⚙ {t.texto}
                </p>
              );
            }
            const mio = t.de === 'agente';
            return (
              <p
                key={i}
                className={`m-0 max-w-[85%] text-pretty rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-[1.5] ${
                  mio
                    ? 'self-end bg-[#edf1fe] text-[#102a72]'
                    : 'self-start border border-[#eaeef8] bg-white text-[#3b4252]'
                }`}
              >
                {t.texto}
              </p>
            );
          })}

          {!terminado && (
            <span className="flex w-[52px] items-center justify-center gap-1 self-end rounded-2xl bg-[#edf1fe] px-3 py-3" aria-label="escribiendo">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="size-1.5 animate-pulse rounded-full bg-zero-600/60"
                  style={{ animationDelay: `${i * 160}ms` }}
                />
              ))}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#eef1f8] px-4 py-3">
          <span className="text-[11px] text-[#666d80]">
            Conversación de ejemplo. El agente se arma con tus servicios y tus reglas.
          </span>
          <button
            type="button"
            onClick={() => elegir(caso)}
            className="shrink-0 cursor-pointer text-[11.5px] font-semibold text-zero-600 transition hover:text-[#102a72]"
          >
            Verla de nuevo
          </button>
        </div>
      </div>
    </div>
  );
}
