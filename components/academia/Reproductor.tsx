'use client';

/**
 * Página de un video: reproductor, capítulos clicables, transcripción y
 * videos relacionados. Con `?t=83` en la dirección arranca en ese segundo.
 * El guardado de avance y el «visto» están en PlayerVideo.
 */

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ChevronDown, FileText } from 'lucide-react';
import { formatearTiempo } from '@/lib/academia/tiempo';
import { nombreDeModulo } from '@/lib/academia/reglas';
import type { VideoDetalle, VideoLista } from '@/lib/academia/tipos';
import { Miniatura } from './TarjetaVideo';
import { PlayerVideo, type ControlPlayer } from './PlayerVideo';

export function Reproductor({ video, relacionados, inicioSeg }: { video: VideoDetalle; relacionados: VideoLista[]; inicioSeg: number }) {
  const control = useRef<ControlPlayer>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(inicioSeg);
  const [visto, setVisto] = useState(video.visto);
  const [verTranscripcion, setVerTranscripcion] = useState(false);

  function irA(seg: number) {
    control.current?.irA(seg);
    contenedor.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const capituloActivo = useMemo(() => {
    let i = -1;
    video.capitulos.forEach((c, n) => { if (c.t <= actual + 0.5) i = n; });
    return i;
  }, [video.capitulos, actual]);

  return (
    <section className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <Link href="/academia" className="inline-flex items-center gap-1.5 text-sm font-medium text-zero-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Academia
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div ref={contenedor}>
            <PlayerVideo ref={control} video={video} inicioSeg={inicioSeg} alTiempo={setActual} alVisto={() => setVisto(true)} />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-zero-700">{nombreDeModulo(video.modulo)}</span>
            <h1 className="text-2xl font-bold text-gray-900">{video.titulo}</h1>
            {visto && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Ya viste este video
              </p>
            )}
            {video.descripcion && <p className="text-base text-gray-700">{video.descripcion}</p>}
          </div>

          {video.transcripcion.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white">
              <button type="button" onClick={() => setVerTranscripcion((v) => !v)} aria-expanded={verTranscripcion}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-900">
                <FileText className="h-4 w-4 text-gray-500" aria-hidden /> Transcripción
                <ChevronDown className={`ml-auto h-4 w-4 text-gray-500 transition-transform ${verTranscripcion ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {verTranscripcion && (
                <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto border-t border-gray-100">
                  {video.transcripcion.map((s, i) => (
                    <li key={i}>
                      <button type="button" onClick={() => irA(s.t)} className="flex w-full gap-3 px-4 py-2 text-left text-sm hover:bg-zero-50">
                        <span className="w-12 shrink-0 font-semibold text-zero-700">{formatearTiempo(s.t)}</span>
                        <span className="text-gray-800">{s.texto}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-6">
          {video.capitulos.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Capítulos</h2>
              <ol className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                {video.capitulos.map((c, i) => (
                  <li key={i} className="border-b border-gray-100 last:border-b-0">
                    <button type="button" onClick={() => irA(c.t)} aria-current={i === capituloActivo ? 'true' : undefined}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left text-sm ${i === capituloActivo ? 'bg-zero-50 font-semibold text-zero-800' : 'text-gray-800 hover:bg-gray-50'}`}>
                      <span className="w-12 shrink-0 font-semibold text-zero-700">{formatearTiempo(c.t)}</span>
                      <span>{c.titulo}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {relacionados.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-900">Videos relacionados</h2>
              <ul className="space-y-3">
                {relacionados.map((r) => (
                  <li key={r.id}>
                    <Link href={`/academia/${r.slug}`} className="flex gap-3 rounded-xl border border-gray-200 bg-white p-2 hover:border-zero-300">
                      <Miniatura video={r} className="w-28 shrink-0" />
                      <span className="min-w-0 self-center text-sm font-semibold leading-snug text-gray-900">{r.titulo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
