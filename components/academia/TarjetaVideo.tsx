import Link from 'next/link';
import { CheckCircle2, Play } from 'lucide-react';
import { formatearTiempo, enlaceVideo } from '@/lib/academia/tiempo';
import { nombreDeModulo } from '@/lib/academia/reglas';
import type { VideoLista } from '@/lib/academia/tipos';

/** La miniatura de un video; sin imagen, un fondo con el botón de reproducir. */
export function Miniatura({ video, className = '' }: { video: Pick<VideoLista, 'miniaturaUrl' | 'titulo' | 'duracionSeg'>; className?: string }) {
  return (
    <div className={`relative aspect-video overflow-hidden rounded-lg bg-zero-900 ${className}`}>
      {video.miniaturaUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura externa (Vimeo o URL propia), no pasa por next/image
        <img src={video.miniaturaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-zero-600 shadow">
          <Play className="h-4 w-4 translate-x-px fill-current" aria-hidden />
        </span>
      </span>
      {video.duracionSeg > 0 && (
        <span className="absolute bottom-2 right-2 rounded-md bg-gray-900/75 px-1.5 py-0.5 text-xs font-semibold text-white">
          {formatearTiempo(video.duracionSeg)}
        </span>
      )}
    </div>
  );
}

/** Una tarjeta de la lista de videos. Con `segundos`, el enlace cae en ese minuto. */
export function TarjetaVideo({ video, segundos = 0 }: { video: VideoLista; segundos?: number }) {
  return (
    <Link
      href={enlaceVideo(video.slug, segundos)}
      className="group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-zero-300"
    >
      <Miniatura video={video} />
      <div className="flex min-w-0 flex-col gap-1 px-1 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-zero-700">{nombreDeModulo(video.modulo)}</span>
        <span className="text-base font-semibold leading-snug text-gray-900 group-hover:text-zero-700">{video.titulo}</span>
        {video.descripcion && <span className="line-clamp-2 text-sm text-gray-600">{video.descripcion}</span>}
        <span className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          {!video.publicado && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Borrador</span>}
          {video.visto && (
            <span className="flex items-center gap-1 font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Visto
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
