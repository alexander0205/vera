'use client';

/**
 * Visor de comprobantes — lightbox reutilizable.
 *
 * Recibe la lista completa y cuál está abierto, así se puede pasar de uno a
 * otro sin cerrar. Sirve para cualquier pantalla que muestre comprobantes; no
 * sabe nada de facturas ni de pagos, solo de adjuntos.
 *
 * Solo muestra imágenes. Los PDF y cualquier otro documento se abren en una
 * pestaña aparte, con el visor nativo del navegador: incrustarlos daba una
 * experiencia peor (sin zoom decente, sin imprimir, y en blanco cuando el
 * navegador tiene el visor inline desactivado). Quien llama al componente le
 * pasa solo las imágenes.
 */

import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2 } from 'lucide-react';

export interface ComprobanteVisible {
  id:          number;
  nombre:      string;
  mime:        string;
  tamanoBytes: number;
}

interface Props {
  adjuntos: ComprobanteVisible[];
  /** Índice abierto. null = cerrado. */
  indice:   number | null;
  onClose:  () => void;
  onIndice: (i: number) => void;
}

function pesoLegible(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ComprobanteVisor({ adjuntos, indice, onClose, onIndice }: Props) {
  const [cargando, setCargando] = useState(true);
  const abierto = indice != null ? adjuntos[indice] : null;

  const anterior = useCallback(() => {
    if (indice == null) return;
    onIndice((indice - 1 + adjuntos.length) % adjuntos.length);
  }, [indice, adjuntos.length, onIndice]);

  const siguiente = useCallback(() => {
    if (indice == null) return;
    onIndice((indice + 1) % adjuntos.length);
  }, [indice, adjuntos.length, onIndice]);

  useEffect(() => { setCargando(true); }, [indice]);

  // Teclado: Esc cierra, flechas navegan. Sin esto el lightbox se siente roto.
  useEffect(() => {
    if (indice == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  anterior();
      if (e.key === 'ArrowRight') siguiente();
    };
    window.addEventListener('keydown', onKey);
    // Congelar el scroll del fondo mientras el visor está abierto.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [indice, onClose, anterior, siguiente]);

  if (!abierto || typeof document === 'undefined') return null;

  const url = `/api/pagos/adjuntos/${abierto.id}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex flex-col"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Comprobante ${abierto.nombre}`}
    >
      {/* Barra superior */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-white shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{abierto.nombre}</p>
          <p className="text-[11px] text-white/60">
            {pesoLegible(abierto.tamanoBytes)}
            {adjuntos.length > 1 && ` · ${(indice ?? 0) + 1} de ${adjuntos.length}`}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            title="Abrir en pestaña nueva"
            className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={url}
            download={abierto.nombre}
            title="Descargar"
            className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar (Esc)"
            className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 flex items-center justify-center px-4 pb-4 min-h-0">
        {adjuntos.length > 1 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); anterior(); }}
            aria-label="Anterior"
            title="Anterior (←)"
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white shrink-0 mr-2"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <div
          className="flex-1 h-full flex items-center justify-center min-w-0"
          onClick={e => e.stopPropagation()}
        >
          {cargando && <Loader2 className="h-6 w-6 animate-spin text-white/70 absolute" />}
          <img
            src={url}
            alt={abierto.nombre}
            onLoad={() => setCargando(false)}
            onError={() => setCargando(false)}
            className="max-h-full max-w-full object-contain rounded-lg"
          />
        </div>

        {adjuntos.length > 1 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); siguiente(); }}
            aria-label="Siguiente"
            title="Siguiente (→)"
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white shrink-0 ml-2"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
