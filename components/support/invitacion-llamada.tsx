'use client';

import { Video } from 'lucide-react';

export function InvitacionLlamada({
  nombreAgente,
  onAceptar,
  onRechazar,
}: {
  nombreAgente: string | null;
  onAceptar: () => void;
  onRechazar: () => void;
}) {
  return (
    <div style={{ padding: '12px 20px', background: '#eef1fd', borderBottom: '1px solid #c7d2fe', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
      <Video size={18} color="#3658e1" style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, color: '#1e293b', flex: 1 }}>
        {nombreAgente ?? 'El agente'} quiere iniciar una llamada con pantalla compartida.
      </span>
      <button
        onClick={onRechazar}
        style={{ border: '1px solid #cbd5e1', background: 'white', color: '#475569', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
      >
        Rechazar
      </button>
      <button
        onClick={onAceptar}
        style={{ border: 'none', background: '#3658e1', color: 'white', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
      >
        Aceptar
      </button>
    </div>
  );
}
