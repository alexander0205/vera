'use client';

import { useEffect, useState } from 'react';
import { Video } from 'lucide-react';
import { PulsoLlamada } from './pulso-llamada';

export function InvitacionLlamada({
  nombreAgente,
  onAceptar,
  onRechazar,
}: {
  nombreAgente: string | null;
  onAceptar: () => Promise<void>;
  onRechazar: () => Promise<void>;
}) {
  // Optimista: se pone en 'aceptando'/'rechazando' en el mismo click, ANTES
  // de esperar la respuesta del POST — sin esto, el banner no cambiaba en
  // nada hasta que volvía la red, el cliente dudaba y clickeaba de nuevo, y
  // el segundo POST chocaba contra la llamada que ya se estaba respondiendo
  // (409) con un `window.alert` feo. Si el POST sale bien, el padre deja de
  // renderizar este banner solo (el poll trae `call.status` distinto de
  // 'pendiente') — no hace falta resetear el estado en ese caso.
  const [accion, setAccion] = useState<'aceptando' | 'rechazando' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  async function responder(accept: boolean) {
    if (accion) return; // ya hay una respuesta en vuelo — ambos botones quedan deshabilitados
    setAccion(accept ? 'aceptando' : 'rechazando');
    setError(null);
    try {
      await (accept ? onAceptar() : onRechazar());
    } catch (e) {
      setAccion(null);
      setError(e instanceof Error ? e.message : 'No se pudo responder la llamada.');
    }
  }

  return (
    <div style={{ padding: '12px 20px', background: '#eef1fd', borderBottom: '1px solid #c7d2fe', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {accion ? <PulsoLlamada icono={Video} diametro={22} iconoTamano={13} /> : <Video size={18} color="#3658e1" style={{ flexShrink: 0 }} />}
        <span style={{ fontSize: 13.5, color: '#1e293b', flex: 1 }}>
          {accion === 'aceptando' ? 'Conectando…' : accion === 'rechazando' ? 'Rechazando…'
            : `${nombreAgente ?? 'El agente'} quiere iniciar una llamada con pantalla compartida.`}
        </span>
        <button
          onClick={() => responder(false)}
          disabled={Boolean(accion)}
          style={{ border: '1px solid #cbd5e1', background: 'white', color: '#475569', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: accion ? 'default' : 'pointer', fontWeight: 600, opacity: accion ? 0.5 : 1 }}
        >
          Rechazar
        </button>
        <button
          onClick={() => responder(true)}
          disabled={Boolean(accion)}
          style={{ border: 'none', background: '#3658e1', color: 'white', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: accion ? 'default' : 'pointer', fontWeight: 600, opacity: accion ? 0.5 : 1 }}
        >
          Aceptar
        </button>
      </div>
      {error && <span style={{ fontSize: 12, color: '#dc2626' }}>{error}</span>}
    </div>
  );
}
