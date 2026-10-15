'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Loader2, PencilLine, Send, Sparkles, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * El asistente de plantillas (Gemini). No solo redacta: crea las plantillas, las
 * manda a aprobación y las asigna a cada aviso. Lo que hizo llega en `acciones`
 * y se pinta debajo de su respuesta; al terminar la pantalla se vuelve a cargar.
 */

type Accion =
  | { tipo: 'creada' | 'editada' | 'enviada' | 'asignada' | 'pendiente' | 'desasignada'; nombre?: string; aviso?: string }
  | { tipo: 'error'; texto: string };

interface Mensaje { role: 'user' | 'assistant'; content: string; acciones?: Accion[] }

const TEXTO: Record<string, string> = {
  creada: 'Plantilla creada',
  editada: 'Borrador actualizado',
  enviada: 'Enviada a aprobación',
  asignada: 'Asignada a',
  pendiente: 'Se asignará al aprobarse a',
  desasignada: 'Vuelve al default en',
};

const SUGERENCIAS = [
  'Crea las plantillas de los 5 avisos de cobro con tono amable y asígnalas',
  'Crea un recordatorio de reunión de padres',
  '¿Cómo van mis plantillas?',
];

export function Asistente({ inicial, onCerrar, onCambios }: {
  /** Mensaje que se manda solo al abrir (p. ej. desde el botón de un caso de uso). */
  inicial: string | null;
  onCerrar: () => void;
  /** Se llama cuando el asistente creó o cambió algo, para refrescar la pantalla. */
  onCambios: () => void;
}) {
  const [chat, setChat] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  const arrancado = useRef(false);

  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, pensando]);

  async function enviar(texto: string, previo: Mensaje[] = chat) {
    const t = texto.trim();
    if (!t || pensando) return;
    const historial: Mensaje[] = [...previo, { role: 'user', content: t }];
    setChat(historial); setEntrada(''); setPensando(true); setError(null);
    try {
      const r = await fetch('/api/administracion-escolar/whatsapp-plantillas/ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Las acciones son para la pantalla; el modelo no necesita verlas.
        body: JSON.stringify({ mensajes: historial.map(({ role, content }) => ({ role, content })) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'El asistente no respondió');
      setChat([...historial, { role: 'assistant', content: d.respuesta, acciones: d.acciones ?? [] }]);
      if ((d.acciones ?? []).some((a: Accion) => a.tipo !== 'error')) onCambios();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setPensando(false);
    }
  }

  useEffect(() => {
    if (inicial && !arrancado.current) { arrancado.current = true; void enviar(inicial, []); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <Sparkles className="h-4 w-4 text-zero-600" />
        <p className="flex-1 text-sm font-semibold text-gray-900">Asistente de plantillas</p>
        <button onClick={onCerrar} aria-label="Cerrar asistente" className="rounded p-1 text-gray-400 hover:bg-gray-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4">
        {chat.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              Dime qué necesitas y lo hago: creo las plantillas, las mando a aprobación y las dejo asignadas a cada aviso.
            </p>
            {SUGERENCIAS.map((s) => (
              <button key={s} onClick={() => void enviar(s)}
                className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 hover:border-zero-600">
                {s}
              </button>
            ))}
          </div>
        )}

        {chat.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
              m.role === 'user' ? 'bg-zero-600 text-white' : 'border border-gray-200 bg-white text-gray-800'}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.acciones && m.acciones.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                  {m.acciones.map((a, j) => (
                    <li key={j} className={`flex items-start gap-1.5 text-xs ${a.tipo === 'error' ? 'text-red-600' : 'text-gray-700'}`}>
                      {a.tipo === 'error' ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        : a.tipo === 'pendiente' ? <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                        : a.tipo === 'editada' ? <PencilLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />}
                      <span>
                        {a.tipo === 'error' ? a.texto : (
                          <>{TEXTO[a.tipo]}{a.aviso ? ` «${a.aviso}»` : ''}{a.nombre ? <> · <span className="font-mono">{a.nombre}</span></> : null}</>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}

        {pensando && (
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Trabajando…
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div ref={fin} />
      </div>

      <form className="flex gap-2 border-t border-gray-200 p-3"
        onSubmit={(e) => { e.preventDefault(); void enviar(entrada); }}>
        <input value={entrada} onChange={(e) => setEntrada(e.target.value)}
          placeholder="Escribe lo que necesitas…" disabled={pensando}
          className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-zero-600" />
        <Button type="submit" disabled={pensando || !entrada.trim()} aria-label="Enviar">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
