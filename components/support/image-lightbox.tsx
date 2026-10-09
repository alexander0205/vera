'use client';

/**
 * Visor de imagen a pantalla completa para las capturas/adjuntos del chat de
 * soporte. Overlay simple: click en la imagen la abre, click en cualquier
 * lado o Escape la cierra.
 */

import { useEffect } from 'react';

export function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, cursor: 'zoom-out',
      }}
    >
      <img
        src={src}
        alt=""
        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
      />
      <button
        onClick={onClose}
        aria-label="Cerrar"
        style={{
          position: 'fixed', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%',
          border: 'none', background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 20, cursor: 'pointer',
        }}
      >
        ✕
      </button>
    </div>
  );
}
