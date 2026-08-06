'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, RefreshCw, SwitchCamera, AlertTriangle } from 'lucide-react';

/**
 * Pantalla de captura en el teléfono.
 *
 * Diseñada para usarse de pie, delante del alumno y con una sola mano: texto
 * grande, un botón enorme para disparar y confirmación explícita antes de subir
 * (la foto movida se repite ahí mismo, no se descubre en el ordenador).
 *
 * Dos caminos para tomar la foto:
 *   1. getUserMedia — vista en vivo dentro de la página, es el bueno.
 *   2. <input capture> — abre la cámara del sistema. Es el plan B cuando el
 *      navegador no da getUserMedia, que pasa siempre que la página no se sirve
 *      por HTTPS (una IP de red local, por ejemplo). Sin este plan B, en esa
 *      situación el módulo entero no serviría para nada.
 */

type Fase = 'cargando' | 'muerto' | 'listo' | 'previsualizando' | 'subiendo' | 'hecho';

const LADO_MAX_SUBIDA = 1600; // el servidor reduce a 800; subir más es gastar datos del móvil

export function CapturaMovilClient({ token }: { token: string }) {
  const [fase, setFase] = useState<Fase>('cargando');
  const [error, setError] = useState<string | null>(null);
  const [sujeto, setSujeto] = useState<{ tipo: string; nombre: string } | null>(null);
  const [camaraError, setCamaraError] = useState<string | null>(null);
  // La cámara no se abre sola: arranca apagada y se pide con un gesto. Ver el
  // comentario de `abrirCamara`.
  const [camara, setCamara] = useState<'apagada' | 'pidiendo' | 'encendida'>('apagada');
  const [frontal, setFrontal] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);

  // ── Validación del token ────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/fotos/captura/${token}`);
        const data = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (!res.ok) {
          setError(data.error ?? 'Enlace no válido');
          setFase('muerto');
          return;
        }
        setSujeto({ tipo: data.tipo, nombre: data.nombre });
        setFase('listo');
      } catch {
        if (!vivo) return;
        setError('No se pudo conectar');
        setFase('muerto');
      }
    })();
    return () => { vivo = false; };
  }, [token]);

  // ── Cámara en vivo ──────────────────────────────────────────────────────
  const pararCamara = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /**
   * Pide la cámara. Solo se llama desde un gesto del usuario, nunca al cargar.
   *
   * Pedirla sola tenía dos problemas. El aviso salía antes de haber pedido
   * nada, así que decía «no diste permiso» cuando lo que pasaba era que el
   * navegador la había bloqueado por no venir de HTTPS. Y en algunos
   * navegadores del teléfono la petición automática se descarta sin llegar a
   * enseñar el diálogo, con lo que el permiso no se podía conceder ni
   * queriendo.
   */
  const abrirCamara = useCallback(async () => {
    pararCamara();
    setCamaraError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCamara('apagada');
      setCamaraError(
        'Este navegador no deja abrir la cámara aquí porque la página no va por HTTPS. '
        + 'Usa el botón de abajo: abre la cámara del teléfono y funciona igual.',
      );
      return;
    }

    setCamara('pidiendo');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: frontal ? 'user' : 'environment', width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamara('encendida');
    } catch (e: unknown) {
      const nombre = e instanceof DOMException ? e.name : '';
      setCamara('apagada');
      setCamaraError(
        nombre === 'NotAllowedError'
          ? 'Bloqueaste la cámara para esta página. Ábrela desde el candado de la barra de direcciones, o usa el botón de abajo.'
          : nombre === 'NotFoundError'
            ? 'No se encontró ninguna cámara en este dispositivo. Usa el botón de abajo.'
            : 'No se pudo abrir la cámara. Usa el botón de abajo.',
      );
    }
  }, [frontal, pararCamara]);

  // Al cambiar de cámara frontal/trasera se vuelve a pedir, pero solo si ya
  // estaba encendida: si no, se estaría pidiendo permiso sin que nadie lo pida.
  useEffect(() => {
    if (camara === 'encendida') void abrirCamara();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontal]);

  // Soltar la cámara al salir: si no, el LED del teléfono se queda encendido.
  useEffect(() => () => pararCamara(), [pararCamara]);

  // ── Disparo ─────────────────────────────────────────────────────────────
  const disparar = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const escala = Math.min(1, LADO_MAX_SUBIDA / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      blobRef.current = blob;
      setPrevia(URL.createObjectURL(blob));
      setFase('previsualizando');
      pararCamara();
    }, 'image/jpeg', 0.9);
  }, [pararCamara]);

  const desdeArchivo = useCallback((archivo: File | undefined) => {
    if (!archivo) return;
    blobRef.current = archivo;
    setPrevia(URL.createObjectURL(archivo));
    setFase('previsualizando');
    pararCamara();
  }, [pararCamara]);

  const repetir = useCallback(() => {
    if (previa) URL.revokeObjectURL(previa);
    setPrevia(null);
    blobRef.current = null;
    setFase('listo');
  }, [previa]);

  const confirmar = useCallback(async () => {
    if (!blobRef.current) return;
    setFase('subiendo');
    try {
      const form = new FormData();
      form.append('foto', blobRef.current, 'foto.jpg');
      const res = await fetch(`/api/fotos/captura/${token}`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 410 = el enlace murió mientras el encargado decidía. No tiene arreglo
        // desde el teléfono: hay que pedir otro QR en el ordenador.
        if (res.status === 410) { setError(data.error ?? 'El enlace caducó'); setFase('muerto'); return; }
        setError(data.error ?? 'No se pudo subir la foto');
        setFase('previsualizando');
        return;
      }
      setFase('hecho');
    } catch {
      setError('No se pudo subir la foto. Revisa la conexión.');
      setFase('previsualizando');
    }
  }, [token]);

  // ── Pantallas ───────────────────────────────────────────────────────────
  if (fase === 'cargando') {
    return <Marco><Loader2 className="h-8 w-8 animate-spin text-zero-600 mx-auto" /></Marco>;
  }

  if (fase === 'muerto') {
    return (
      <Marco>
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
        <h1 className="text-xl font-semibold mt-4">{error ?? 'Enlace no válido'}</h1>
        <p className="text-gray-500 mt-2 text-sm">
          Vuelve al ordenador y genera un código nuevo desde la ficha.
        </p>
      </Marco>
    );
  }

  if (fase === 'hecho') {
    return (
      <Marco>
        <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
          <Check className="h-9 w-9" />
        </div>
        <h1 className="text-xl font-semibold mt-4">Foto guardada</h1>
        <p className="text-gray-500 mt-2 text-sm">
          Ya aparece en la ficha de {sujeto?.nombre}. Puedes cerrar esta página.
        </p>
      </Marco>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gray-950 text-white flex flex-col">
      <header className="px-4 py-3 text-center shrink-0">
        <p className="text-[11px] uppercase tracking-wide text-gray-400">{sujeto?.tipo}</p>
        <h1 className="text-lg font-semibold leading-tight">{sujeto?.nombre}</h1>
      </header>

      <div className="flex-1 relative bg-black overflow-hidden">
        {fase === 'previsualizando' || fase === 'subiendo' ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob local, next/image no aplica
          <img src={previa ?? ''} alt="Foto tomada" className="absolute inset-0 w-full h-full object-contain" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {camaraError && fase === 'listo' && (
          <div className="absolute inset-x-4 top-4 bg-amber-500/90 text-amber-950 text-sm rounded-lg p-3">
            {camaraError}
          </div>
        )}

        {/* Cámara apagada: el navegador solo enseña su diálogo de permiso si la
            petición sale de un gesto, así que aquí hay algo que tocar. Antes la
            pantalla salía negra con un aviso de permiso denegado sin que nadie
            hubiera pedido nada. */}
        {fase === 'listo' && camara !== 'encendida' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
            <div className="h-20 w-20 rounded-full bg-white/10 flex items-center justify-center">
              <Camera className="h-9 w-9 text-white/80" />
            </div>
            <p className="text-gray-300 text-[15px] leading-relaxed">
              Para tomar la foto de {sujeto?.nombre ?? 'esta persona'} hace falta<br />
              permiso para usar la cámara.
            </p>
            <button
              type="button"
              onClick={abrirCamara}
              disabled={camara === 'pidiendo'}
              className="h-13 rounded-xl bg-zero-600 px-7 py-3.5 font-semibold disabled:opacity-60 flex items-center gap-2"
            >
              {camara === 'pidiendo'
                ? <><Loader2 className="h-5 w-5 animate-spin" />Esperando permiso…</>
                : <><Camera className="h-5 w-5" />Activar cámara</>}
            </button>
          </div>
        )}
      </div>

      <footer className="shrink-0 px-6 py-5 space-y-3">
        {error && fase === 'previsualizando' && (
          <p className="text-center text-sm text-red-300">{error}</p>
        )}

        {fase === 'listo' && camara === 'encendida' && (
          <>
            <div className="flex items-center justify-center gap-8">
              <button
                type="button"
                onClick={() => setFrontal((f) => !f)}
                className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center"
                aria-label="Cambiar de cámara"
              >
                <SwitchCamera className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={disparar}
                className="h-20 w-20 rounded-full bg-white disabled:bg-white/30 flex items-center justify-center ring-4 ring-white/30"
                aria-label="Tomar foto"
              >
                <Camera className="h-8 w-8 text-gray-900" />
              </button>
              <span className="h-12 w-12" />
            </div>
          </>
        )}

        {fase === 'listo' && (
          <label className="block text-center text-sm text-gray-300 underline underline-offset-4 pt-1">
            Usar la cámara del teléfono
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => desdeArchivo(e.target.files?.[0])}
            />
          </label>
        )}

        {(fase === 'previsualizando' || fase === 'subiendo') && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={repetir}
              disabled={fase === 'subiendo'}
              className="flex-1 h-14 rounded-xl bg-white/10 font-medium flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <RefreshCw className="h-5 w-5" />Repetir
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={fase === 'subiendo'}
              className="flex-1 h-14 rounded-xl bg-zero-600 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {fase === 'subiendo'
                ? <><Loader2 className="h-5 w-5 animate-spin" />Enviando…</>
                : <><Check className="h-5 w-5" />Usar esta</>}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center max-w-sm w-full">
        {children}
      </div>
    </div>
  );
}
