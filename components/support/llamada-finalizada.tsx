'use client';

import { PhoneOff } from 'lucide-react';

/**
 * Reemplaza a PanelLlamada por ~2.5s justo después de que la llamada
 * termina (ver useLlamadaFinalizadaReciente) — sin esto el panel
 * desaparecía de golpe y no quedaba claro si la llamada se cortó por un
 * error o porque alguien colgó a propósito.
 */
export function LlamadaFinalizada() {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        height: '100%', background: '#0f172a', borderRadius: 12,
        animation: 'zt-llamada-finalizada-fade 2.5s ease-in forwards',
      }}
    >
      <style>{`
        @keyframes zt-llamada-finalizada-fade {
          0%, 40% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#334155', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PhoneOff size={20} />
      </div>
      <span style={{ color: '#94a3b8', fontSize: 13.5 }}>Llamada finalizada</span>
    </div>
  );
}
