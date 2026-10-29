'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { MessageCircle, X } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Si quien mira no tiene su WhatsApp guardado, se lo pide: es por donde le
 * llegan los avisos de sus tareas (le respondieron, quedó en revisión, lleva 24
 * horas sin respuesta). Se dice para qué es, y se puede dejar para después: el
 * «Ahora no» se recuerda en este navegador.
 */

const CLAVE = '/api/cuenta/whatsapp';
const OCULTO = 'zero:pedir-whatsapp-oculto';

const traer = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { tieneWhatsapp: true }));

export function PedirWhatsApp() {
  const { data, mutate } = useSWR<{ tieneWhatsapp: boolean }>(CLAVE, traer, { revalidateOnFocus: false });
  const [oculto, setOculto] = useState(true);
  const [telefono, setTelefono] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    try { setOculto(localStorage.getItem(OCULTO) === '1'); } catch { setOculto(false); }
  }, []);

  if (!data || data.tieneWhatsapp || oculto) return null;

  async function guardar() {
    setGuardando(true);
    try {
      const r = await fetch(CLAVE, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefono }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? 'No se pudo guardar');
      toast.success('Listo: te avisaremos por WhatsApp');
      void mutate({ tieneWhatsapp: true }, { revalidate: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally { setGuardando(false); }
  }

  function despues() {
    try { localStorage.setItem(OCULTO, '1'); } catch { /* sin almacenamiento: vuelve a salir la próxima vez */ }
    setOculto(true);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <MessageCircle className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">¿A qué WhatsApp te avisamos de tus tareas?</p>
        <p className="text-xs text-gray-600">
          Solo lo usamos para avisarte cuando te respondan o una tarea necesite tu revisión.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" aria-label="Tu WhatsApp"
          placeholder="809 555 1234"
          onKeyDown={(e) => { if (e.key === 'Enter' && telefono.trim()) void guardar(); }}
          className="h-9 w-36 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
        <button type="button" onClick={() => void guardar()} disabled={guardando || !telefono.trim()}
          className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          Guardar
        </button>
        <button type="button" onClick={despues} aria-label="Ahora no" title="Ahora no"
          className="rounded-md p-1.5 text-gray-500 hover:bg-emerald-100"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
