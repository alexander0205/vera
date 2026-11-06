'use client';

/**
 * La ayuda en video de una pantalla. `pantalla` es el `id` del catálogo
 * (lib/config/pantallas.ts). Si no hay video publicado para esa pantalla —o la
 * Academia no responde, o la migración no se ha corrido— no dibuja NADA.
 *
 * Se usa en dos sitios de la misma pantalla:
 *
 *   <TutorialDePantalla pantalla="fact-cxc" modo="boton" />   → «Aprender», en la cabecera,
 *       siempre visible cuando hay video. Abre el panel con los videos de la pantalla.
 *   <TutorialDePantalla pantalla="fact-cxc" modo="tarjeta" /> → la tarjeta grande y descartable
 *       («Ahora no» / «No mostrar más», con «Deshacer»). En el estado vacío o encima de la tabla.
 *
 * El video se reproduce en un cuadro ENCIMA de la pantalla (VideoDialogo): al
 * cerrarlo se sigue donde se estaba. Los dos modos se hablan por un evento del
 * navegador (el panel puede pedir «Volver a mostrar la tarjeta»).
 *
 * El estado de la tarjeta vive en la base (por persona). Cuándo sale: lib/academia/tarjeta.ts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { GraduationCap, X } from 'lucide-react';
import { enlaceVideo, formatearTiempo } from '@/lib/academia/tiempo';
import type { VideoLista } from '@/lib/academia/tipos';
import { Miniatura } from './TarjetaVideo';

const VideoDialogo = dynamic(() => import('./VideoDialogo').then((m) => m.VideoDialogo), { ssr: false });
const PanelAprender = dynamic(() => import('./PanelAprender').then((m) => m.PanelAprender), { ssr: false });

type Accion = 'mostrada' | 'ahora_no' | 'nunca' | 'deshacer';
interface Respuesta { mostrar: boolean; videos: VideoLista[] }

const EVENTO_MOSTRAR = 'academia:mostrar-tarjeta';
/** La tarjeta avisa si está en esta pantalla y si se ve; el botón «Aprender» lo pregunta al montar. */
const EVENTO_ESTADO = 'academia:estado-tarjeta';
const EVENTO_PREGUNTA = 'academia:pregunta-tarjeta';
/** Un video se vio completo: la tarjeta se esconde y el panel lo marca sin recargar. */
const EVENTO_VISTO = 'academia:video-visto';
interface EstadoTarjetaPantalla { pantalla: string; montada: boolean; visible: boolean }

async function enviar(pantalla: string, accion: Accion) {
  // La respuesta guardada de 3 s ya no vale: si se vuelve a la pantalla, debe verse lo nuevo.
  enVuelo.delete(pantalla);
  try {
    await fetch('/api/academia/tarjeta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pantalla, accion }),
    });
  } catch { /* sin red: ya se escondió en pantalla y la próxima carga vuelve a decidir */ }
}

// Los dos modos de una pantalla piden lo mismo: una sola petición a la vez.
const enVuelo = new Map<string, Promise<Respuesta>>();
function pedir(pantalla: string): Promise<Respuesta> {
  let p = enVuelo.get(pantalla);
  if (!p) {
    p = (async () => {
      try {
        const r = await fetch(`/api/academia/tarjeta?pantalla=${encodeURIComponent(pantalla)}`);
        if (!r.ok) return { mostrar: false, videos: [] };
        const j = (await r.json()) as Partial<Respuesta>;
        return { mostrar: j.mostrar === true, videos: Array.isArray(j.videos) ? j.videos : [] };
      } catch {
        return { mostrar: false, videos: [] };
      }
    })();
    enVuelo.set(pantalla, p);
    setTimeout(() => enVuelo.delete(pantalla), 3000);
  }
  return p;
}

function useRespuesta(pantalla: string): Respuesta {
  const [r, setR] = useState<Respuesta>({ mostrar: false, videos: [] });
  // Sin ningún video publicado (o mientras se sabe) no se pide nada: no hay tarjeta ni «Aprender».
  const { academiaActiva } = usePermissions();
  useEffect(() => {
    if (!academiaActiva) { setR({ mostrar: false, videos: [] }); return; }
    let vivo = true;
    void pedir(pantalla).then((x) => { if (vivo) setR(x); });
    return () => { vivo = false; };
  }, [pantalla, academiaActiva]);
  return r;
}

export function TutorialDePantalla({ pantalla, modo = 'tarjeta', className = '' }: {
  pantalla: string;
  modo?: 'boton' | 'tarjeta';
  className?: string;
}) {
  const { videos: videosServidor, mostrar: mostrarInicial } = useRespuesta(pantalla);
  const [mostrar, setMostrar] = useState(false);
  // «Volver a mostrar la tarjeta» la enseña aunque ya se hayan visto los videos.
  const [forzada, setForzada] = useState(false);
  const [vistos, setVistos] = useState<ReadonlySet<number>>(new Set());
  const [panel, setPanel] = useState(false);
  const [viendo, setViendo] = useState<VideoLista | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const contada = useRef(false);
  // Del lado del botón: ¿hay una tarjeta en esta pantalla y está oculta?
  const [tarjeta, setTarjeta] = useState<{ montada: boolean; visible: boolean }>({ montada: false, visible: true });

  // Lo visto en esta sesión pisa lo que dijo el servidor al cargar.
  const videos = videosServidor.map((v) => (vistos.has(v.id) ? { ...v, visto: true } : v));
  const todoVisto = videos.length > 0 && videos.every((v) => v.visto);
  const tarjetaVisible = (mostrar && !todoVisto) || forzada;

  useEffect(() => {
    const alVisto = (e: Event) => {
      const d = (e as CustomEvent<{ pantalla: string; id: number }>).detail;
      if (d.pantalla === pantalla) setVistos((p) => new Set(p).add(d.id));
    };
    window.addEventListener(EVENTO_VISTO, alVisto);
    return () => window.removeEventListener(EVENTO_VISTO, alVisto);
  }, [pantalla]);

  const marcarVisto = useCallback((v: VideoLista) => {
    enVuelo.delete(pantalla);
    window.dispatchEvent(new CustomEvent(EVENTO_VISTO, { detail: { pantalla, id: v.id } }));
  }, [pantalla]);

  useEffect(() => {
    setMostrar(mostrarInicial);
    // Sale una sola vez por día: se anota en cuanto se enseña (modo tarjeta).
    if (modo === 'tarjeta' && mostrarInicial && !contada.current) { contada.current = true; void enviar(pantalla, 'mostrada'); }
  }, [mostrarInicial, modo, pantalla]);

  // El panel «Aprender» (otro componente de la misma pantalla) puede pedir la tarjeta de vuelta.
  useEffect(() => {
    const alPedir = (e: Event) => {
      if ((e as CustomEvent<string>).detail === pantalla) { setMostrar(true); setForzada(true); setAviso(null); }
    };
    window.addEventListener(EVENTO_MOSTRAR, alPedir);
    return () => window.removeEventListener(EVENTO_MOSTRAR, alPedir);
  }, [pantalla]);

  // Modo tarjeta: dice a los demás si está y si se ve (y contesta cuando se le pregunta).
  useEffect(() => {
    if (modo !== 'tarjeta' || videos.length === 0) return;
    const avisar = () => window.dispatchEvent(new CustomEvent<EstadoTarjetaPantalla>(EVENTO_ESTADO, { detail: { pantalla, montada: true, visible: tarjetaVisible } }));
    avisar();
    window.addEventListener(EVENTO_PREGUNTA, avisar);
    return () => {
      window.removeEventListener(EVENTO_PREGUNTA, avisar);
      window.dispatchEvent(new CustomEvent<EstadoTarjetaPantalla>(EVENTO_ESTADO, { detail: { pantalla, montada: false, visible: false } }));
    };
  }, [modo, videos.length, pantalla, tarjetaVisible]);

  // Modo botón: escucha a la tarjeta.
  useEffect(() => {
    if (modo !== 'boton') return;
    const alEstado = (e: Event) => {
      const d = (e as CustomEvent<EstadoTarjetaPantalla>).detail;
      if (d.pantalla === pantalla) setTarjeta({ montada: d.montada, visible: d.visible });
    };
    window.addEventListener(EVENTO_ESTADO, alEstado);
    window.dispatchEvent(new Event(EVENTO_PREGUNTA));
    return () => window.removeEventListener(EVENTO_ESTADO, alEstado);
  }, [modo, pantalla]);

  const descartar = useCallback((accion: 'ahora_no' | 'nunca') => {
    setMostrar(false);
    setForzada(false);
    setAviso(accion === 'ahora_no' ? 'Te lo mostramos otra vez mañana.' : 'No te vamos a mostrar más este tutorial. Siempre lo encuentras en «Aprender».');
    void enviar(pantalla, accion);
  }, [pantalla]);

  const deshacer = useCallback(() => {
    setAviso(null);
    setMostrar(true);
    void enviar(pantalla, 'deshacer');
  }, [pantalla]);

  const volverAMostrar = useCallback(() => {
    setPanel(false);
    void enviar(pantalla, 'deshacer');
    window.dispatchEvent(new CustomEvent(EVENTO_MOSTRAR, { detail: pantalla }));
  }, [pantalla]);

  if (videos.length === 0) return null;
  const principal = videos[0];

  if (modo === 'boton') {
    return (
      <>
        <button type="button" onClick={() => setPanel(true)}
          className={`inline-flex min-h-9 items-center gap-2 rounded-full border border-zero-200 bg-zero-50 px-4 text-sm font-semibold text-zero-700 hover:bg-zero-100 ${className}`}>
          <GraduationCap className="h-4 w-4" aria-hidden /> Aprender
        </button>

        {/* El panel y el cuadro del video se bajan solo cuando se abren (dynamic): no pesan en la pantalla. */}
        {panel && (
          <PanelAprender
            videos={videos}
            puedeVolverAMostrar={tarjeta.montada && !tarjeta.visible}
            alCerrar={() => setPanel(false)}
            alElegir={(v) => { setPanel(false); setViendo(v); }}
            alVolverAMostrar={volverAMostrar}
          />
        )}

        {viendo && <VideoDialogo video={viendo} alCerrar={() => setViendo(null)} alVisto={marcarVisto} />}
      </>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {tarjetaVisible && (
        <section aria-label="Tutorial de esta pantalla"
          className="relative flex flex-wrap items-center gap-5 rounded-xl border border-zero-200 bg-white p-4 pr-12 text-left">
          <button type="button" onClick={() => descartar('ahora_no')} aria-label="Cerrar el tutorial"
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
            <X className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setViendo(principal)} aria-label={`Ver el video ${principal.titulo}`} className="w-44 max-w-full">
            <Miniatura video={principal} />
          </button>
          <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-zero-700">¿Primera vez aquí?</span>
            <span className="text-lg font-semibold text-gray-900">{principal.titulo}</span>
            {principal.descripcion && <span className="text-sm leading-snug text-gray-600">{principal.descripcion}</span>}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setViendo(principal)}
                className="inline-flex min-h-10 items-center rounded-lg bg-zero-600 px-4 text-sm font-semibold text-white hover:bg-zero-700">
                Ver el video{principal.duracionSeg > 0 ? ` · ${formatearTiempo(principal.duracionSeg)}` : ''}
              </button>
              <button type="button" onClick={() => descartar('ahora_no')}
                className="min-h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50">
                Ahora no
              </button>
              <button type="button" onClick={() => descartar('nunca')}
                className="min-h-10 px-2 text-sm text-gray-600 underline hover:text-gray-900">
                No mostrar más
              </button>
            </div>
          </div>
        </section>
      )}

      {aviso && (
        <div role="status" className="flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 text-left text-sm text-white">
          <span className="flex-1">{aviso}</span>
          <button type="button" onClick={deshacer} className="min-h-9 px-2 font-semibold text-zero-300 hover:text-white">Deshacer</button>
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar el aviso" className="text-gray-400 hover:text-white">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {viendo && <VideoDialogo video={viendo} alCerrar={() => setViendo(null)} alVisto={marcarVisto} />}
    </div>
  );
}
