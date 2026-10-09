'use client';

/**
 * Aviso de "tomando/subiendo captura" — vive AFUERA del panel del chat a
 * propósito: mientras se captura, el panel entero se pone `visibility:hidden`
 * (para no salir en su propia foto), así que un overlay adentro de ese mismo
 * nodo tampoco se vería. Este es un elemento hermano, siempre visible.
 */

import { Loader2 } from 'lucide-react';

export function CapturaOverlay({ stage }: { stage: 'capturando' | 'subiendo' }) {
  return (
    <div
      data-capture-exclude
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 10001,
        width: 340, maxWidth: 'calc(100vw - 40px)',
        background: 'rgba(17, 24, 39, 0.92)', color: 'white',
        borderRadius: 8, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
    >
      <Loader2 size={18} style={{ animation: 'captura-overlay-girar 0.8s linear infinite', flexShrink: 0 }} />
      {stage === 'capturando' ? 'Tomando captura de pantalla…' : 'Subiendo captura…'}
      <style>{'@keyframes captura-overlay-girar { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
