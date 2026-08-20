'use client';

/**
 * Elegir un archivo: clic, cámara, arrastrar o pegar.
 *
 * Salió de `ComprobantesUploader`, que ya resolvía las cuatro formas, para que
 * la página pública de pago no las reimplementara peor. Los detalles que se
 * pierden al reescribirlo son justo los que importan:
 *
 *  · `capture` en el input de la cámara — en el móvil abre la cámara en vez del
 *    explorador, y así paga casi todo el mundo: el comprobante está en la
 *    pantalla del banco.
 *  · La compresión ANTES de subir. Una foto de celular pesa 3–8 MB y el body de
 *    una función de Vercel topa en 4.5 MB: sin comprimir, el caso más común de
 *    todos falla.
 *  · Pegar con ⌘V, que es el camino más corto del flujo real — la captura de la
 *    app del banco va al portapapeles y de ahí aquí, sin guardar el archivo.
 *  · La cuenta de profundidad del drag: `dragenter`/`dragleave` también saltan
 *    al pasar por encima de los hijos, y sin llevarla el resaltado parpadea.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Plus, Upload } from 'lucide-react';
import { comprimirImagen } from '@/lib/utils/comprimir-imagen';

export const ACEPTA_COMPROBANTE = 'image/jpeg,image/png,image/webp,application/pdf';

/**
 * Soltar archivos sobre CUALQUIER contenedor, no solo sobre el botón.
 *
 * Se expone aparte porque quien mete la zona dentro de una tarjeta quiere que
 * se pueda soltar en toda la tarjeta: apuntar a un botón de 70px con el ratón y
 * un archivo encima es más difícil de lo que parece.
 *
 * `profundidad` lleva la cuenta de entradas y salidas: `dragenter`/`dragleave`
 * también saltan al pasar por encima de los hijos, y sin contarlas el
 * resaltado parpadea al mover el ratón por dentro.
 */
export function useSoltarArchivos(
  onSoltar: (files: FileList) => void,
  activo = true,
) {
  const profundidad = useRef(0);
  const [arrastrando, setArrastrando] = useState(false);

  // Solo reacciona a archivos: arrastrar texto o un enlace no debe encenderla.
  const traeArchivos = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

  return {
    arrastrando,
    handlers: {
      onDragEnter: (e: React.DragEvent) => {
        if (!activo || !traeArchivos(e)) return;
        e.preventDefault();
        profundidad.current += 1;
        setArrastrando(true);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!activo || !traeArchivos(e)) return;
        e.preventDefault();
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!activo || !traeArchivos(e)) return;
        e.preventDefault();
        profundidad.current = Math.max(0, profundidad.current - 1);
        if (profundidad.current === 0) setArrastrando(false);
      },
      onDrop: (e: React.DragEvent) => {
        if (!activo || !traeArchivos(e)) return;
        e.preventDefault();
        profundidad.current = 0;
        setArrastrando(false);
        onSoltar(e.dataTransfer.files);
      },
    },
  };
}

interface Props {
  /** Ya comprimidos y listos para subir. */
  onArchivos: (archivos: File[]) => void;
  disabled?: boolean;
  /** Hay una subida en curso: se bloquea y se enseña el giro. */
  ocupado?: boolean;
  multiple?: boolean;
  accept?: string;
  /**
   * `grande` es la zona con texto, para una pantalla que solo hace esto.
   * `compacta` son dos botones cuadrados, para meterla entre otras cosas.
   */
  variante?: 'grande' | 'compacta';
  titulo?: string;
  ayuda?: string;
  /** Escucha ⌘V en todo el documento. Solo donde haya UNA zona en pantalla. */
  pegar?: boolean;
}

export function ZonaArchivo({
  onArchivos,
  disabled = false,
  ocupado = false,
  multiple = false,
  accept = ACEPTA_COMPROBANTE,
  variante = 'grande',
  titulo = 'Haz clic aquí y adjunta tu comprobante',
  ayuda = 'Una foto o un PDF',
  pegar = false,
}: Props) {
  const inputArchivo = useRef<HTMLInputElement>(null);
  const inputCamara = useRef<HTMLInputElement>(null);
  const activo = !disabled && !ocupado;

  const entregar = useCallback(async (files: FileList | File[] | null) => {
    if (!files?.length || !activo) return;
    const lista = Array.from(files).slice(0, multiple ? undefined : 1);
    // Comprimir aquí y no en el llamador: el que solo quiere un archivo no
    // tiene por qué acordarse de que una foto de celular no cabe en el request.
    const listos = await Promise.all(lista.map((f) => comprimirImagen(f)));
    onArchivos(listos);
    if (inputArchivo.current) inputArchivo.current.value = '';
    if (inputCamara.current) inputCamara.current.value = '';
  }, [activo, multiple, onArchivos]);

  useEffect(() => {
    if (!pegar || !activo) return;
    const alPegar = (e: ClipboardEvent) => {
      const archivos = Array.from(e.clipboardData?.files ?? []);
      if (!archivos.length) return;
      // Si además hay texto y el foco está en un campo, el pegado es suyo:
      // copiar una referencia bancaria no debe subir nada.
      const hayTexto = (e.clipboardData?.getData('text') ?? '') !== '';
      const destino = e.target as HTMLElement | null;
      if (hayTexto && destino?.closest('input, textarea, [contenteditable]')) return;
      e.preventDefault();
      entregar(archivos);
    };
    document.addEventListener('paste', alPegar);
    return () => document.removeEventListener('paste', alPegar);
  }, [pegar, activo, entregar]);

  // En `compacta` el contenedor de arriba ya recoge el soltar; atarlo también
  // aquí haría que un archivo soltado sobre el botón se procesara dos veces.
  const propio = useSoltarArchivos((files) => entregar(files), activo && variante === 'grande');
  const dnd = variante === 'grande' ? propio.handlers : {};
  const arrastrando = variante === 'grande' && propio.arrastrando;

  const inputs = (
    <>
      <input ref={inputArchivo} type="file" accept={accept} multiple={multiple} hidden
        onChange={(e) => entregar(e.target.files)} />
      {/* `capture` hace que en el celular abra la cámara en vez del explorador.
          En escritorio el navegador lo ignora, por eso el botón se esconde. */}
      <input ref={inputCamara} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => entregar(e.target.files)} />
    </>
  );

  if (variante === 'compacta') {
    return (
      <>
        <button type="button" onClick={() => inputArchivo.current?.click()} disabled={!activo}
          title="Elegir archivo (o arrastra, o pega con Ctrl+V)"
          {...dnd}
          className={`flex h-[64px] w-[70px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-white text-zero-600 hover:bg-zero-50 disabled:opacity-50 ${
            arrastrando ? 'border-zero-500 bg-zero-50' : 'border-zero-300'
          }`}>
          {ocupado
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><Plus className="h-4 w-4" /><span className="text-[9px]">Subir</span></>}
        </button>

        <button type="button" onClick={() => inputCamara.current?.click()} disabled={!activo}
          title="Tomar foto con la cámara"
          className="flex h-[64px] w-[70px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zero-300 bg-white text-zero-600 hover:bg-zero-50 disabled:opacity-50 sm:hidden">
          <Camera className="h-4 w-4" />
          <span className="text-[9px]">Foto</span>
        </button>
        {inputs}
      </>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => inputArchivo.current?.click()} disabled={!activo}
        {...dnd}
        className={`flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-7 transition disabled:opacity-60 ${
          arrastrando
            ? 'border-zero-600 bg-zero-50'
            : 'border-gray-300 bg-white hover:border-zero-400 hover:bg-gray-50'
        }`}>
        {ocupado
          ? <Loader2 className="h-7 w-7 animate-spin text-zero-600" />
          : <Upload className="h-7 w-7 text-zero-600" />}
        <span className="text-[15px] font-bold text-zero-700">{titulo}</span>
        <span className="text-xs text-gray-500">{ayuda}</span>
      </button>

      {/* Se esconde en pantallas grandes: sin cámara, `capture` no hace nada y
          el botón abriría un segundo explorador idéntico al de arriba. */}
      <button type="button" onClick={() => inputCamara.current?.click()} disabled={!activo}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-[15px] font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-60 sm:hidden">
        <Camera className="h-[18px] w-[18px]" />
        Tomar una foto
      </button>

      {inputs}
    </div>
  );
}
