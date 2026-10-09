'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, FileUp, Images, Loader2, RefreshCw, X } from 'lucide-react';
import { comprimirImagen } from '@/lib/utils/comprimir-imagen';

/**
 * Enviar una factura de proveedor con el teléfono.
 *
 * La cámara se abre SOLA al entrar por el enlace: quien llega ya tiene el papel
 * en la mano, y un botón más entre él y la foto es un paso de más. Se usa
 * `getUserMedia` con un visor dentro de la página —que sí se puede abrir sin que
 * nadie toque nada— y se dispara a resolución alta, porque de esa foto hay que
 * leer el QR del e-CF y la letra pequeña.
 *
 * Si el navegador no da la cámara (página sin HTTPS, permiso denegado, portátil
 * sin webcam) quedan los dos caminos de siempre: la cámara del sistema, que en
 * un teléfono enfoca mejor, y la galería o un PDF.
 *
 * Una factura larga cabe en varias fotos (hasta 4). Todo se comprime aquí antes
 * de subir: una función de Vercel no acepta más de 4.5 MB.
 *
 * No se pregunta nada más: ni quién la manda ni para qué. Todo sale de la foto
 * (QR del e-CF e IA); pedir datos al teléfono solo es un paso para equivocarse.
 */

const MAX_FOTOS = 4;
const MAX_PDF = 4 * 1024 * 1024;
const LADO_MAX = 2200;

type Camara = 'apagada' | 'pidiendo' | 'encendida';
interface Foto { file: File; url: string | null }

export default function SubirFacturaClient({ token }: { token: string }) {
  const [empresa, setEmpresa] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [camara, setCamara] = useState<Camara>('apagada');
  const [camaraError, setCamaraError] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviada, setEnviada] = useState<'nueva' | 'repetida' | null>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pararCamara = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamara('apagada');
  }, []);

  const abrirCamara = useCallback(async () => {
    setCamaraError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCamara('apagada');
      setCamaraError('Este navegador no deja abrir la cámara aquí. Usa los botones de abajo.');
      return;
    }
    setCamara('pidiendo');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamara('encendida');
    } catch (e: unknown) {
      const nombreError = e instanceof DOMException ? e.name : '';
      setCamara('apagada');
      setCamaraError(
        nombreError === 'NotAllowedError'
          ? 'No diste permiso a la cámara. Ábrela desde el candado de la barra de direcciones, o usa los botones de abajo.'
          : nombreError === 'NotFoundError'
            ? 'Este aparato no tiene cámara. Usa los botones de abajo.'
            : 'No se pudo abrir la cámara. Usa los botones de abajo.',
      );
    }
  }, []);

  // Validar el enlace y, si vale, abrir la cámara sin esperar a que toquen nada.
  useEffect(() => {
    let vivo = true;
    fetch(`/api/subir-factura/${token}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) { setError(j.error ?? 'Este enlace no es válido.'); return; }
        setEmpresa(j.empresa);
        void abrirCamara();
      })
      .catch(() => vivo && setError('No se pudo conectar. Revisa la conexión e intenta otra vez.'));
    return () => { vivo = false; };
  }, [token, abrirCamara]);

  // Soltar la cámara al salir: si no, el teléfono se queda con el LED encendido.
  useEffect(() => () => pararCamara(), [pararCamara]);
  useEffect(() => () => fotos.forEach((f) => f.url && URL.revokeObjectURL(f.url)), [fotos]);

  const hayPdf = fotos.some((f) => f.file.type === 'application/pdf');
  const lleno = fotos.length >= MAX_FOTOS;

  /** Dispara desde el visor: del vídeo al lienzo y de ahí a un JPEG. */
  function disparar() {
    const video = videoRef.current;
    if (!video?.videoWidth || lleno) return;
    const escala = Math.min(1, LADO_MAX / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `factura-${fotos.length + 1}.jpg`, { type: 'image/jpeg' });
      setFotos((prev) => [...prev, { file, url: URL.createObjectURL(file) }]);
      setAviso(null);
    }, 'image/jpeg', 0.9);
  }

  async function agregar(e: React.ChangeEvent<HTMLInputElement>) {
    const nuevos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!nuevos.length) return;
    setAviso(null);
    const pdf = nuevos.find((f) => f.type === 'application/pdf');
    if (pdf) {
      if (pdf.size > MAX_PDF) { setAviso('El PDF pesa más de 4 MB. Mándale una foto a la factura en su lugar.'); return; }
      fotos.forEach((f) => f.url && URL.revokeObjectURL(f.url));
      setFotos([{ file: pdf, url: null }]);
      pararCamara();
      return;
    }
    if (hayPdf) { setAviso('Ya elegiste un PDF: quítalo para mandar fotos.'); return; }
    const espacio = MAX_FOTOS - fotos.length;
    if (espacio <= 0) { setAviso(`Una factura admite hasta ${MAX_FOTOS} fotos.`); return; }
    setPreparando(true);
    try {
      const listos = await Promise.all(nuevos.slice(0, espacio).map((f) => comprimirImagen(f, { ladoMax: LADO_MAX, calidad: 0.85 })));
      setFotos((prev) => [...prev, ...listos.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
      if (nuevos.length > espacio) setAviso(`Solo caben ${MAX_FOTOS} fotos por factura.`);
    } finally {
      setPreparando(false);
    }
  }

  function quitar(i: number) {
    setFotos((prev) => {
      const f = prev[i];
      if (f?.url) URL.revokeObjectURL(f.url);
      return prev.filter((_, j) => j !== i);
    });
  }

  async function enviar() {
    if (!fotos.length || enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      const fd = new FormData();
      fotos.forEach((f) => fd.append('archivos', f.file));
      const res = await fetch(`/api/subir-factura/${token}`, { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 410) { setError(j.error ?? 'Este enlace ya no es válido.'); return; }
      if (res.status === 413) { setAviso('Las fotos pesan demasiado. Manda menos fotos o una a la vez.'); return; }
      if (!res.ok) { setAviso(j.error ?? 'No se pudo enviar. Intenta otra vez.'); return; }
      pararCamara();
      setEnviada(j.repetida ? 'repetida' : 'nueva');
    } catch {
      setAviso('No se pudo enviar. Revisa la conexión e intenta otra vez.');
    } finally {
      setEnviando(false);
    }
  }

  function otra() {
    fotos.forEach((f) => f.url && URL.revokeObjectURL(f.url));
    setFotos([]);
    setEnviada(null);
    setAviso(null);
    void abrirCamara();
  }

  if (error) {
    return (
      <Marco>
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-xl font-semibold text-gray-900">{error}</h1>
      </Marco>
    );
  }
  if (!empresa) return <Marco><Loader2 className="mx-auto h-8 w-8 animate-spin text-zero-600" /></Marco>;

  if (enviada) {
    return (
      <Marco>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <Check className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-gray-900" data-testid="factura-enviada">
          {enviada === 'repetida' ? 'Esta factura ya se había enviado' : '¡Factura enviada!'}
        </h1>
        <p className="mt-2 text-sm text-gray-500">{empresa} la revisa y la registra.</p>
        <button type="button" onClick={otra} className="mt-6 h-12 w-full rounded-xl bg-zero-600 text-base font-semibold text-white">
          Enviar otra factura
        </button>
      </Marco>
    );
  }

  // Todo cabe en UNA pantalla, sin desplazarse: el visor toma el espacio que
  // sobra y el disparador y «Enviar» quedan siempre a la vista. Con una
  // proporción fija (3:4) el visor empujaba «Enviar» fuera de la pantalla.
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-gray-900">
      <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={agregar} data-testid="entrada-camara" />
      <input ref={archivoRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden onChange={agregar} data-testid="entrada-archivo" />

      <header className="shrink-0 px-4 pb-2 pt-3 text-center text-white">
        <p className="text-[10px] uppercase tracking-wide text-gray-400">Factura para</p>
        <h1 className="truncate text-base font-semibold" data-testid="empresa">{empresa}</h1>
      </header>

      {/* Visor: sale solo al entrar y ocupa lo que queda */}
      <div className="relative mx-auto min-h-0 w-full max-w-lg flex-1 overflow-hidden bg-black sm:rounded-xl" data-testid="visor">
        <video ref={videoRef} playsInline muted autoPlay className={`h-full w-full object-cover ${camara === 'encendida' ? '' : 'invisible'}`} />
        {camara === 'encendida' && (
          <>
            <div className="pointer-events-none absolute inset-x-4 bottom-4 top-14 rounded-lg border-2 border-white/60" />
            <p className="pointer-events-none absolute left-0 right-0 top-3 px-6 text-center text-xs leading-snug text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
              La factura completa dentro del marco. Si es electrónica, que salga el código QR.
            </p>
          </>
        )}
        {camara === 'pidiendo' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
            <Loader2 className="h-7 w-7 animate-spin" /> <span className="text-sm">Abriendo la cámara…</span>
          </div>
        )}
        {camara === 'apagada' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Camera className="h-10 w-10 text-white/60" />
            <p className="text-sm text-white/80" data-testid="camara-error">{camaraError ?? 'Cámara apagada.'}</p>
            <button type="button" onClick={() => void abrirCamara()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/40 px-3 text-sm text-white">
              <RefreshCw className="h-4 w-4" /> Intentar otra vez
            </button>
          </div>
        )}
        {fotos.length > 0 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
            {fotos.length} de {MAX_FOTOS}
          </span>
        )}
      </div>

      {/* Disparador y las dos salidas de siempre */}
      <div className="flex shrink-0 items-center justify-center gap-8 py-3">
        <button type="button" onClick={() => camaraRef.current?.click()} aria-label="Usar la cámara del teléfono"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-white">
          <Camera className="h-5 w-5" />
        </button>
        <button type="button" onClick={disparar} disabled={camara !== 'encendida' || lleno} aria-label="Tomar foto" data-testid="disparar"
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/70 bg-white/10 disabled:opacity-40">
          <span className="h-[54px] w-[54px] rounded-full bg-white" />
        </button>
        <button type="button" onClick={() => archivoRef.current?.click()} aria-label="Galería o PDF"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-white">
          <Images className="h-5 w-5" />
        </button>
      </div>

      {/* Lo tomado y «Enviar»: siempre a la vista */}
      <div className="mx-auto w-full max-w-lg shrink-0 rounded-t-2xl bg-gray-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {aviso && <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="aviso">{aviso}</p>}
        {preparando && <p className="mb-2 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Preparando la foto…</p>}

        {fotos.length === 0 ? (
          <p className="py-1 text-center text-sm text-gray-500">
            Toma la foto con el botón grande, o usa la cámara del teléfono
            <Camera className="mx-1 inline h-3.5 w-3.5" /> o la galería <Images className="mx-1 inline h-3.5 w-3.5" /> para un PDF.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex shrink-0 gap-2" data-testid="fotos">
              {fotos.map((f, i) => (
                <div key={i} className="relative h-14 w-11 overflow-hidden rounded-md border border-gray-200 bg-white">
                  {f.url
                    // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
                    ? <img src={f.url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                    : <div className="flex h-full items-center justify-center text-[10px] text-gray-600">PDF</div>}
                  <button type="button" onClick={() => quitar(i)} aria-label={`Quitar foto ${i + 1}`}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={enviar} disabled={enviando || preparando} data-testid="enviar"
              className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-zero-600 text-base font-semibold text-white disabled:opacity-60">
              {enviando ? <><Loader2 className="h-5 w-5 animate-spin" /> Enviando…</> : <><FileUp className="h-5 w-5" /> Enviar factura</>}
            </button>
          </div>
        )}
        {fotos.length > 0 && !hayPdf && !lleno && (
          <p className="mt-2 text-center text-xs text-gray-500">¿La factura es larga? Toma otra foto antes de enviar.</p>
        )}
      </div>
    </div>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center">{children}</div>
    </div>
  );
}
