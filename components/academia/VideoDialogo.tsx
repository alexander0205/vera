'use client';

/**
 * El video en un cuadro ENCIMA de la pantalla donde se está: se ve, se cierra y
 * se sigue trabajando donde se estaba (Facturas, Cuentas por cobrar…). Trae un
 * enlace a la página completa del video, con capítulos y transcripción.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Dialog from '@mui/material/Dialog';
import { ExternalLink, X } from 'lucide-react';
import { enlaceVideo, formatearTiempo } from '@/lib/academia/tiempo';
import type { VideoDetalle, VideoLista } from '@/lib/academia/tipos';
import { PlayerVideo, type ControlPlayer } from './PlayerVideo';

export function VideoDialogo({ video, alCerrar, alVisto }: { video: VideoLista | null; alCerrar: () => void; alVisto?: (v: VideoLista) => void }) {
  const [detalle, setDetalle] = useState<VideoDetalle | null>(null);
  const [fallo, setFallo] = useState(false);
  const control = useRef<ControlPlayer>(null);

  useEffect(() => {
    setDetalle(null); setFallo(false);
    if (!video) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/academia/video?slug=${encodeURIComponent(video.slug)}`);
        if (!r.ok) throw new Error();
        const j = (await r.json()) as { video: VideoDetalle };
        if (vivo) setDetalle(j.video);
      } catch {
        if (vivo) setFallo(true);
      }
    })();
    return () => { vivo = false; };
  }, [video]);

  return (
    <Dialog open={video !== null} onClose={alCerrar} fullWidth maxWidth="md" aria-labelledby="video-dialogo-titulo">
      {video && (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <h2 id="video-dialogo-titulo" className="flex-1 text-lg font-semibold text-gray-900">{video.titulo}</h2>
            <button type="button" onClick={alCerrar} aria-label="Cerrar el video"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {/* El reproductor sale ya con lo de la lista; los capítulos llegan después. */}
          <PlayerVideo ref={control} video={video} inicioSeg={0} alVisto={() => alVisto?.(video)} />
          {fallo && <p className="text-xs text-gray-500">No se pudieron cargar los capítulos.</p>}

          {detalle && detalle.capitulos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {detalle.capitulos.map((c, i) => (
                <li key={i}>
                  <button type="button" onClick={() => control.current?.irA(c.t)}
                    className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-zero-50">
                    <span className="mr-1.5 font-semibold text-zero-700">{formatearTiempo(c.t)}</span>{c.titulo}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-gray-600">Puedes seguir trabajando al cerrarlo.</span>
            <Link href={enlaceVideo(video.slug)} className="ml-auto inline-flex items-center gap-1.5 font-semibold text-zero-700 hover:underline">
              Abrir la página completa <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </Dialog>
  );
}
