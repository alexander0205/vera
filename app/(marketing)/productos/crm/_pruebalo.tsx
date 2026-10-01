'use client';

/**
 * Escríbele tú. Lo más cerca de probarlo sin abrir una cuenta.
 *
 * Contesta desde un guion, no desde un modelo: esto es una página pública y
 * enchufarle el agente de verdad sería pagar tokens por cada curioso y, peor,
 * dejar que cualquiera lo lleve a decir lo que le dé la gana. Lo que sí es
 * real es la FORMA: el agente piensa por pasos —lee, busca, verifica,
 * responde— y eso es exactamente lo que hace por dentro.
 *
 * Cuando la pregunta no está en el guion lo dice, que es justo la conducta que
 * se vende dos secciones más arriba: no inventar. Fingir aquí una respuesta
 * para cualquier cosa sería contradecirse en la misma página.
 */

import { useEffect, useRef, useState } from 'react';

type Respuesta = {
  /** Se elige por la primera palabra que aparezca en la pregunta. */
  claves: readonly string[];
  sugerencia: string;
  pasos: readonly string[];
  respuesta: string;
};

const GUION: Respuesta[] = [
  {
    claves: ['precio', 'costo', 'cuesta', 'mensualidad', 'inscripción', 'inscripcion', 'cuánto', 'cuanto'],
    sugerencia: '¿Cuánto cuesta la inscripción?',
    pasos: ['Leyendo el mensaje', 'Buscando en tu lista de precios', 'Redactando la respuesta'],
    respuesta: 'La inscripción de pre-primero es RD$3,500 y la mensualidad RD$4,200. ¿Quiere que le aparte una visita al plantel esta semana?',
  },
  {
    claves: ['cita', 'visita', 'agendar', 'turno', 'reunión', 'reunion', 'horario'],
    pasos: ['Leyendo el mensaje', 'Consultando la agenda de quien atiende', 'Apartando el espacio'],
    sugerencia: 'Quiero agendar una cita',
    respuesta: 'Tengo jueves 10:30 a.m. y viernes 8:00 a.m. ¿Cuál le sirve? Se la dejo apartada y le mando el recordatorio un día antes.',
  },
  {
    claves: ['debo', 'balance', 'deuda', 'pagar', 'pago', 'saldo'],
    sugerencia: '¿Cuánto debo y cómo lo pago?',
    pasos: ['Leyendo el mensaje', 'Pidiendo confirmar identidad', 'Consultando el estado de cuenta'],
    respuesta: 'Para darle su balance necesito confirmar quién es: ¿me indica su cédula? Le mando un código y enseguida le paso el monto con su enlace de pago.',
  },
  {
    claves: ['documento', 'requisito', 'papeles', 'necesito llevar', 'acta'],
    sugerencia: '¿Qué documentos necesito?',
    pasos: ['Leyendo el mensaje', 'Buscando en los documentos cargados', 'Citando la fuente'],
    respuesta: 'Se piden acta de nacimiento, récord de notas del año anterior y copia de la cédula del tutor. Está en el instructivo de admisiones, página 2. Puede subirlos por aquí mismo en foto o PDF.',
  },
  {
    claves: ['hablar', 'persona', 'humano', 'encargado', 'llamar'],
    sugerencia: 'Quiero hablar con una persona',
    pasos: ['Leyendo el mensaje', 'Buscando quién está disponible', 'Pasando la conversación'],
    respuesta: 'Claro. Le paso con alguien del equipo ahora mismo y le dejo arriba todo lo que hemos hablado, para que no tenga que repetirlo.',
  },
];

const NO_SE: Respuesta = {
  claves: [],
  sugerencia: '',
  pasos: ['Leyendo el mensaje', 'Buscando en lo que tengo cargado'],
  respuesta: 'Eso no está en lo que me cargaron para esta demostración, así que no me lo voy a inventar. En tu institución lo contestaría con tus documentos y tus sistemas: cárgamelos y lo sabe.',
};

function elegir(pregunta: string): Respuesta {
  const limpia = pregunta.toLowerCase();
  return GUION.find(r => r.claves.some(c => limpia.includes(c))) ?? NO_SE;
}

export function Pruebalo() {
  const [texto, setTexto] = useState('');
  const [pregunta, setPregunta] = useState<string | null>(null);
  const [paso, setPaso] = useState(0);
  const elegida = useRef<Respuesta>(NO_SE);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pasos = elegida.current.pasos;
  const pensando = pregunta !== null && paso < pasos.length;

  useEffect(() => {
    if (!pensando) return;
    reloj.current = setTimeout(() => setPaso(p => p + 1), 620);
    return () => { if (reloj.current) clearTimeout(reloj.current); };
  }, [pensando, paso]);

  function preguntar(q: string) {
    const limpia = q.trim();
    if (!limpia) return;
    if (reloj.current) clearTimeout(reloj.current);
    elegida.current = elegir(limpia);
    setPregunta(limpia);
    setPaso(0);
    setTexto('');
  }

  return (
    <div className="min-w-0 rounded-2xl border border-[#e7edfb] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-[#edf1fe] px-2.5 text-[10.5px] font-semibold uppercase tracking-[.4px] text-zero-600">
          <span className="size-1.5 animate-pulse rounded-full bg-zero-600" />
          En vivo
        </span>
        <span className="text-[12.5px] font-semibold text-[#102a72]">Pregúntale tú</span>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); preguntar(texto); }}
        className="mt-3.5 flex gap-2"
      >
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Escribe como le escribirías por WhatsApp…"
          aria-label="Escríbele al agente"
          className="h-11 min-w-0 flex-1 rounded-xl border border-[#e4e8f4] px-3.5 text-[13px] text-[#102a72] outline-none transition placeholder:text-[#6b7183] focus:border-zero-300"
        />
        <button
          type="submit"
          className="h-11 shrink-0 cursor-pointer rounded-xl bg-zero-600 px-4 text-[13px] font-semibold text-white transition hover:bg-zero-700"
        >
          Enviar
        </button>
      </form>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {GUION.map(r => (
          <button
            key={r.sugerencia}
            type="button"
            onClick={() => preguntar(r.sugerencia)}
            className="cursor-pointer rounded-full border border-[#e4e8f4] px-3 py-1 text-[11.5px] text-[#5c6373] transition hover:border-zero-200 hover:text-zero-600"
          >
            {r.sugerencia}
          </button>
        ))}
      </div>

      {pregunta && (
        <div className="mt-4 flex flex-col gap-2.5 rounded-xl bg-[#fbfcff] p-4">
          <p className="m-0 max-w-[85%] self-start text-pretty rounded-2xl border border-[#eaeef8] bg-white px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-[#3b4252]">
            {pregunta}
          </p>

          {/* El razonamiento a la vista. Es lo que de verdad hace por dentro y
              es lo que separa a esto de un menú de opciones. */}
          <ul className="m-0 flex list-none flex-col gap-1 self-end p-0 text-right">
            {pasos.slice(0, Math.min(paso + 1, pasos.length)).map((p, i) => (
              <li key={p} className="text-[11px] font-medium text-[#666d80]">
                {i < paso ? '✓' : '•'} {p}
              </li>
            ))}
          </ul>

          {!pensando && (
            <p className="m-0 max-w-[85%] self-end text-pretty rounded-2xl bg-[#edf1fe] px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-[#102a72]">
              {elegida.current.respuesta}
            </p>
          )}
        </div>
      )}

      <p className="m-0 mt-3 text-[11px] leading-[1.5] text-[#666d80]">
        Demostración con respuestas preparadas. El agente de tu institución contesta con tus
        documentos, tus precios y tus sistemas.
      </p>
    </div>
  );
}
