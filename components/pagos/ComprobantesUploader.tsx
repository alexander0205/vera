'use client';

/**
 * Comprobantes de pago — subida y galería.
 *
 * Los archivos se suben APENAS se eligen, no al enviar el formulario. Dos
 * razones: el servidor puede exigir el comprobante antes de crear el cobro
 * (recibe los ids ya subidos), y el usuario ve el error de un archivo malo en el
 * momento en vez de perder el formulario completo al final.
 *
 * Contrapartida: si cierran el modal sin registrar el pago, los comprobantes
 * quedan colgando de la factura. Se ven en su detalle y se pueden borrar ahí.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Plus, Camera, X, FileText, AlertTriangle, Upload } from 'lucide-react';
import { comprimirImagen } from '@/lib/utils/comprimir-imagen';
import ComprobanteVisor from '@/components/pagos/ComprobanteVisor';

export interface AdjuntoSubido {
  id:          number;
  nombre:      string;
  mime:        string;
  tamanoBytes: number;
  /** false en PDF: no hay miniatura y se pinta el ícono. */
  tieneThumb?: boolean;
}

interface Props {
  docId:            number;
  /** Ids ya subidos. El padre los manda al registrar el pago. */
  adjuntos:         AdjuntoSubido[];
  onChange:         (adjuntos: AdjuntoSubido[]) => void;
  disabled?:        boolean;
  /** El método elegido exige comprobante: cambia el copy y marca el bloque. */
  obligatorio?:     boolean;
  max?:             number;
}

const ACEPTA = 'image/jpeg,image/png,image/webp,application/pdf';

function kb(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ComprobantesUploader({
  docId, adjuntos, onChange, disabled = false, obligatorio = false, max = 5,
}: Props) {
  const [subiendo, setSubiendo]     = useState(false);
  const [viendo, setViendo]         = useState<number | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const inputCamara  = useRef<HTMLInputElement>(null);
  // dragenter/dragleave también disparan al pasar sobre los hijos. Sin llevar
  // la cuenta, el resaltado parpadea al mover el mouse por dentro de la zona.
  const profundidadDrag = useRef(0);

  const lleno = adjuntos.length >= max;
  const aceptaSoltar = !disabled && !lleno && !subiendo;

  const subir = useCallback(async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    setError(null);
    setSubiendo(true);

    const nuevos: AdjuntoSubido[] = [];
    try {
      for (const original of Array.from(files).slice(0, max - adjuntos.length)) {
        const archivo = await comprimirImagen(original);
        const fd = new FormData();
        fd.append('docId', String(docId));
        fd.append('archivo', archivo);

        const res  = await fetch('/api/pagos/adjuntos', { method: 'POST', body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'No se pudo subir el archivo');
        nuevos.push(json.adjunto);
      }
      if (nuevos.length) onChange([...adjuntos, ...nuevos]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el archivo');
      if (nuevos.length) onChange([...adjuntos, ...nuevos]);
    } finally {
      setSubiendo(false);
      if (inputArchivo.current) inputArchivo.current.value = '';
      if (inputCamara.current)  inputCamara.current.value  = '';
    }
  }, [adjuntos, docId, max, onChange]);

  // Pegar con ⌘V / Ctrl+V. Es el camino más corto del flujo real: la captura de
  // la app del banco va al portapapeles y de ahí al comprobante, sin pasar por
  // guardar el archivo. El listener es de documento porque el evento `paste`
  // llega al elemento con foco, y en un modal casi nunca es esta zona.
  useEffect(() => {
    if (!aceptaSoltar) return;
    const onPaste = (e: ClipboardEvent) => {
      const archivos = Array.from(e.clipboardData?.files ?? []);
      if (!archivos.length) return;
      // Si además hay texto y el foco está en un campo, el pegado es suyo:
      // copiar una referencia bancaria no debe subir nada.
      const hayTexto = (e.clipboardData?.getData('text') ?? '') !== '';
      const destino  = e.target as HTMLElement | null;
      if (hayTexto && destino?.closest('input, textarea, [contenteditable]')) return;
      e.preventDefault();
      subir(archivos);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [aceptaSoltar, subir]);

  async function quitar(id: number) {
    onChange(adjuntos.filter(a => a.id !== id));
    // Si el usuario no tiene permiso de borrar, el archivo queda en la factura
    // pero fuera de este pago. No es un error que valga la pena mostrar.
    await fetch(`/api/pagos/adjuntos/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  // ── Arrastrar y soltar ────────────────────────────────────────────────────
  // Solo reacciona cuando lo que se arrastra son archivos: arrastrar texto o un
  // link dentro del formulario no debe encender la zona.
  const traeArchivos = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

  function onDragEnter(e: React.DragEvent) {
    if (!aceptaSoltar || !traeArchivos(e)) return;
    e.preventDefault();
    profundidadDrag.current += 1;
    setArrastrando(true);
  }

  function onDragOver(e: React.DragEvent) {
    if (!aceptaSoltar || !traeArchivos(e)) return;
    // Sin esto el navegador abre el archivo soltado en la pestaña y se pierde
    // el formulario con lo que el usuario llevaba escrito.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function onDragLeave(e: React.DragEvent) {
    if (!aceptaSoltar) return;
    e.preventDefault();
    profundidadDrag.current -= 1;
    if (profundidadDrag.current <= 0) {
      profundidadDrag.current = 0;
      setArrastrando(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    if (!aceptaSoltar) return;
    e.preventDefault();
    profundidadDrag.current = 0;
    setArrastrando(false);
    const archivos = Array.from(e.dataTransfer.files);
    if (archivos.length) subir(archivos);
  }

  const marco = arrastrando
    ? 'border-teal-500 bg-teal-50 border-dashed'
    : obligatorio
      ? 'border-amber-300 bg-amber-50/60'
      : 'border-gray-200 bg-gray-50/60';

  // El visor solo maneja imágenes. Un PDF (o cualquier otro documento) se abre
  // en una pestaña, donde el navegador usa su propio visor: zoom, buscar,
  // imprimir y guardar salen gratis, y no hay que reimplementar nada.
  const esImagen = (a: AdjuntoSubido) => a.mime.startsWith('image/');
  const imagenes = adjuntos.filter(esImagen);

  function abrir(a: AdjuntoSubido) {
    if (esImagen(a)) {
      setViendo(imagenes.findIndex(i => i.id === a.id));
      return;
    }
    window.open(`/api/pagos/adjuntos/${a.id}`, '_blank', 'noopener');
  }

  return (
    <div
      className={`relative rounded-lg border transition-colors ${marco} p-3`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {arrastrando && (
        <div className="absolute inset-0 z-10 rounded-lg bg-teal-50/90 flex flex-col items-center justify-center gap-1 pointer-events-none">
          <Upload className="h-5 w-5 text-teal-600" />
          <span className="text-xs font-medium text-teal-700">Suelta aquí el comprobante</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-medium text-gray-700">
          Comprobante de pago {obligatorio && <span className="text-amber-700">· requerido</span>}
        </span>
        <span className="text-[10px] text-gray-400">
          {obligatorio ? 'Este método lo exige' : 'Opcional'} · arrastra, pega o elige · hasta {max}, 3 MB c/u
        </span>
      </div>

      <div className="flex gap-2 flex-wrap items-start">
        {adjuntos.map(a => (
          <div key={a.id} className="flex flex-col gap-1 w-[70px] group">
            <div className="relative h-[64px] w-[70px] rounded-lg border border-gray-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => abrir(a)}
                title={esImagen(a) ? `Ver ${a.nombre}` : `Abrir ${a.nombre} en una pestaña`}
                className={`h-full w-full flex items-center justify-center hover:opacity-90 ${
                  esImagen(a) ? 'cursor-zoom-in' : 'cursor-pointer'
                }`}
              >
                {esImagen(a) ? (
                  // `size=thumb` trae ~5 KB en vez del original completo. El
                  // binario sale del proxy con sesión; no hay URL pública.
                  <img
                    src={`/api/pagos/adjuntos/${a.id}?size=thumb`}
                    alt={a.nombre}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-0.5 text-red-500">
                    <FileText className="h-5 w-5" />
                    <span className="text-[8px] font-medium uppercase tracking-wide">
                      {(a.nombre.split('.').pop() ?? 'doc').slice(0, 4)}
                    </span>
                  </span>
                )}
              </button>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => quitar(a.id)}
                  aria-label={`Quitar ${a.nombre}`}
                  title={`Quitar ${a.nombre}`}
                  className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-gray-900/70 text-white flex items-center justify-center hover:bg-gray-900 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            <span className="text-[9px] text-gray-500 truncate" title={a.nombre}>
              {kb(a.tamanoBytes)}
            </span>
          </div>
        ))}

        {!lleno && !disabled && (
          <>
            <button
              type="button"
              onClick={() => inputArchivo.current?.click()}
              disabled={subiendo}
              title="Elegir archivo (o arrastra, o pega con Ctrl+V)"
              className="h-[64px] w-[70px] rounded-lg border border-dashed border-teal-300 bg-white text-teal-600 flex flex-col items-center justify-center gap-1 hover:bg-teal-50 disabled:opacity-50"
            >
              {subiendo
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><Plus className="h-4 w-4" /><span className="text-[9px]">Subir</span></>}
            </button>

            {/* `capture` hace que en el celular abra la cámara en vez del
                explorador de archivos. En escritorio el browser lo ignora. */}
            <button
              type="button"
              onClick={() => inputCamara.current?.click()}
              disabled={subiendo}
              title="Tomar foto con la cámara"
              className="h-[64px] w-[70px] rounded-lg border border-dashed border-teal-300 bg-white text-teal-600 flex flex-col items-center justify-center gap-1 hover:bg-teal-50 disabled:opacity-50 sm:hidden"
            >
              <Camera className="h-4 w-4" />
              <span className="text-[9px]">Foto</span>
            </button>
          </>
        )}
      </div>

      <input
        ref={inputArchivo} type="file" accept={ACEPTA} multiple hidden
        onChange={e => subir(e.target.files)}
      />
      <input
        ref={inputCamara} type="file" accept="image/*" capture="environment" hidden
        onChange={e => subir(e.target.files)}
      />

      {error && (
        <div className="flex items-start gap-1.5 mt-2 text-[11px] text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      {/* Solo las imágenes entran al visor; así las flechas ‹ › no caen nunca
          en un PDF que no se puede mostrar. */}
      <ComprobanteVisor
        adjuntos={imagenes}
        indice={viendo}
        onClose={() => setViendo(null)}
        onIndice={setViendo}
      />
    </div>
  );
}
