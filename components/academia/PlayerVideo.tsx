'use client';

/**
 * El reproductor de un video de la Academia: un iframe de Vimeo
 * (player.vimeo.com, con `dnt=1`, sin cookies de rastreo) controlado con el
 * paquete oficial `@vimeo/player`. Lo usan la página del video, el cuadro encima
 * de las pantallas y la vista previa del administrador.
 *
 * `@vimeo/player` se carga con import dinámico, solo al abrir el video. El iframe
 * NO se renderiza en el servidor ni con React: se crea a mano en el cliente
 * DESPUÉS de que el paquete cargó y, en el mismo tick, se crea el `Player`. El
 * iframe avisa `ready` una sola vez; si ya estaba en la página cuando el `Player`
 * llegó, ese aviso se perdía y no se recibía ningún evento (lib/academia/montaje.ts).
 * Los eventos se registran solo después de `ready()`.
 *
 * El avance y el «visto» salen de los eventos `timeupdate`, `seeked`, `pause` y
 * `ended`. Se guardan cada pocos segundos, al pausar, al terminar y al salir
 * (también al cerrar la pestaña), pero SOLO si se reprodujo de verdad
 * (lib/academia/progreso.ts): un salto con `?t=` o a un capítulo no cuenta como
 * ver el video, y llegar por un enlace y salir no pisa el avance. Si no se pudo
 * guardar, el video se sigue viendo igual.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type Player from '@vimeo/player';
import {
  REPRODUCCION_NUEVA, acumularReproduccion, debeGuardarAvance, esVisto, type Reproduccion,
} from '@/lib/academia/progreso';
import { mensajeDeErrorVimeo, montarVimeo } from '@/lib/academia/montaje';
import { urlEmbedVimeo } from '@/lib/academia/vimeo';

const CADA_MS = 10_000;

export interface ControlPlayer { irA(seg: number): void }

export const PlayerVideo = forwardRef<ControlPlayer, {
  video: { id: number; vimeoId: string; vimeoHash: string | null; titulo: string; duracionSeg: number; visto: boolean; avanceSeg: number };
  inicioSeg: number;
  alTiempo?: (seg: number) => void;
  alVisto?: () => void;
  /** Cuando el reproductor conoce la duración real (la vista previa del admin la usa para llenar el campo). */
  alDuracion?: (seg: number) => void;
  /** Vista previa: no guarda avance. */
  sinProgreso?: boolean;
}>(function PlayerVideo({ video, inicioSeg, alTiempo, alVisto, alDuracion, sinProgreso = false }, control) {
  const contenedor = useRef<HTMLDivElement>(null);
  const jugador = useRef<Player | null>(null);
  const reproduccion = useRef<Reproduccion>(REPRODUCCION_NUEVA);
  const posicion = useRef(0);
  const duracion = useRef(video.duracionSeg);
  const ultimoGuardado = useRef(0);
  const vistoRef = useRef(video.visto);
  const [fallo, setFallo] = useState(false);
  const [errorVideo, setErrorVideo] = useState<string | null>(null);

  // Por ref: el padre puede pasar funciones nuevas en cada render sin reiniciar nada.
  const cb = useRef({ alTiempo, alVisto, alDuracion });
  cb.current = { alTiempo, alVisto, alDuracion };
  // El título solo se lee al crear el iframe: cambiarlo (la vista previa del admin lo cambia al teclear) no debe recrear el reproductor.
  const titulo = useRef(video.titulo);
  titulo.current = video.titulo;

  // Dónde arrancar: se fija al montar.
  const inicio = useRef(inicioSeg > 0 ? inicioSeg : (video.visto ? 0 : video.avanceSeg));
  const src = useMemo(() => urlEmbedVimeo({ id: video.vimeoId, hash: video.vimeoHash }), [video.vimeoId, video.vimeoHash]);

  const guardar = useCallback((terminado: boolean) => {
    if (sinProgreso) return;
    const r = reproduccion.current.total;
    if (!debeGuardarAvance(r)) return;
    const pos = posicion.current;
    const visto = esVisto({ posicion: pos, duracion: duracion.current, reproducidoSeg: r, terminado });
    if (visto && !vistoRef.current) { vistoRef.current = true; cb.current.alVisto?.(); }
    // `keepalive`: la petición sobrevive aunque la página se cierre en ese momento.
    void fetch('/api/academia/progreso', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ videoId: video.id, avanceSeg: Math.floor(pos), visto }),
    }).catch(() => undefined);
  }, [sinProgreso, video.id]);

  useImperativeHandle(control, () => ({
    irA(seg: number) {
      const p = jugador.current;
      if (!p) return;
      // El salto no cuenta como reproducción.
      reproduccion.current = { ...reproduccion.current, ultimo: seg };
      posicion.current = seg;
      // Los dos mensajes salen en el mismo tick del clic (si `play()` esperara a
      // `setCurrentTime`, la activación del clic ya se habría perdido). Si el
      // navegador no deja arrancar solo, el video queda pausado en el segundo
      // correcto, listo para darle play.
      void p.setCurrentTime(seg).catch(() => undefined);
      void p.play().catch(() => undefined);
    },
  }), []);

  useEffect(() => {
    const caja = contenedor.current;
    if (!caja) return;
    let vivo = true;
    let p: Player | null = null;
    let iframe: HTMLIFrameElement | null = null;

    montarVimeo<Player, HTMLIFrameElement>({
      // Import dinámico: el paquete no entra en el JS de la pantalla, solo al abrir el video.
      cargar: async () => (await import('@vimeo/player')).default,
      insertarIframe: () => {
        iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.title = titulo.current;
        iframe.allow = 'autoplay; fullscreen; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.className = 'absolute inset-0 h-full w-full border-0';
        caja.appendChild(iframe);
        return iframe;
      },
      activo: () => vivo,
      alCrear: (nuevo) => { p = nuevo; },
      alListo: async (jug) => {
        jugador.current = jug;
        jug.getDuration().then((d) => {
          if (d > 0) { duracion.current = d; cb.current.alDuracion?.(Math.round(d)); }
        }).catch(() => undefined);

        if (inicio.current > 0) {
          posicion.current = inicio.current;
          reproduccion.current = { ...reproduccion.current, ultimo: inicio.current };
          await jug.setCurrentTime(inicio.current).catch(() => undefined);
        }

        jug.on('timeupdate', (d) => {
          posicion.current = d.seconds;
          if (d.duration > 0) duracion.current = d.duration;
          cb.current.alTiempo?.(d.seconds);
          reproduccion.current = acumularReproduccion(reproduccion.current, d.seconds);
          if (Date.now() - ultimoGuardado.current > CADA_MS) { ultimoGuardado.current = Date.now(); guardar(false); }
        });
        // Un salto (barra, capítulo, enlace) no suma reproducción: la referencia se mueve al nuevo punto.
        jug.on('seeked', (d) => {
          posicion.current = d.seconds;
          reproduccion.current = { ...reproduccion.current, ultimo: d.seconds };
        });
        jug.on('pause', () => guardar(false));
        jug.on('ended', () => guardar(true));
        // Vimeo a veces avisa un error de reproducción (DRM, privacidad): se dice, no se deja mudo.
        jug.on('error', (e) => { if (vivo) setErrorVideo(mensajeDeErrorVimeo(e)); });
      },
    }).catch(() => { if (vivo) setFallo(true); });

    // Cerrar la pestaña o cambiar de app: se guarda lo reproducido.
    const alOcultar = () => { if (document.visibilityState === 'hidden') guardar(false); };
    window.addEventListener('pagehide', alOcultar as EventListener);
    document.addEventListener('visibilitychange', alOcultar);

    return () => {
      vivo = false;
      window.removeEventListener('pagehide', alOcultar as EventListener);
      document.removeEventListener('visibilitychange', alOcultar);
      // Al salir (cerrar el cuadro o cambiar de página) se guarda lo reproducido.
      guardar(false);
      jugador.current = null;
      // El iframe es nuestro (React no lo maneja): se destruye el Player y se quita, una sola vez.
      try { void p?.destroy(); } catch { /* ya no está */ }
      (iframe as HTMLIFrameElement | null)?.remove();
    };
  }, [guardar, src]);

  if (fallo) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-gray-100 px-4 text-center text-sm text-gray-600">
        No se pudo cargar el reproductor. Revisa tu conexión.
      </div>
    );
  }
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {/* Vacío para React: el iframe lo pone montarVimeo en el cliente. */}
      <div ref={contenedor} className="absolute inset-0" />
      {errorVideo && (
        <div role="alert" className="absolute inset-x-0 bottom-0 bg-red-700/95 px-4 py-3 text-sm text-white">
          {errorVideo}
        </div>
      )}
    </div>
  );
});
