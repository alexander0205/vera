'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, ScreenShare, ScreenShareOff, PhoneOff } from 'lucide-react';
import type { EstadoLlamada } from '@/lib/webrtc/useLlamada';

export function PanelLlamada({
  estado,
  error,
  micActivo,
  compartiendoPantalla,
  remoteStream,
  onAlternarMicrofono,
  onAlternarPantalla,
  onColgar,
}: {
  estado: EstadoLlamada;
  error: string | null;
  micActivo: boolean;
  compartiendoPantalla: boolean;
  remoteStream: MediaStream | null;
  onAlternarMicrofono: () => void;
  onAlternarPantalla: () => void;
  onColgar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [autoplayBloqueado, setAutoplayBloqueado] = useState(false);

  useEffect(() => {
    setAutoplayBloqueado(false);
    if (!videoRef.current) return;
    videoRef.current.srcObject = remoteStream;
    if (!remoteStream) return;
    videoRef.current.play().catch(() => {
      setAutoplayBloqueado(true);
    });
  }, [remoteStream]);

  function reintentarReproduccion() {
    if (!videoRef.current) return;
    videoRef.current
      .play()
      .then(() => setAutoplayBloqueado(false))
      .catch(() => setAutoplayBloqueado(true));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {remoteStream ? (
          <>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            {autoplayBloqueado && (
              <button
                onClick={reintentarReproduccion}
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  background: 'rgba(15, 23, 42, 0.85)', color: 'white', border: 'none',
                  cursor: 'pointer', fontSize: 13.5, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', textAlign: 'center', padding: '0 20px',
                }}
              >
                Click para activar audio y video
              </button>
            )}
          </>
        ) : (
          <span style={{ color: '#94a3b8', fontSize: 13.5, padding: '0 20px', textAlign: 'center' }}>
            {estado === 'conectando' && 'Conectando…'}
            {estado === 'error' && (error ?? 'No se pudo conectar')}
            {estado === 'activa' && 'Esperando a que comparta pantalla…'}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: 14, background: '#1e293b' }}>
        <button
          onClick={onAlternarMicrofono}
          title={micActivo ? 'Silenciar micrófono' : 'Activar micrófono'}
          aria-label={micActivo ? 'Silenciar micrófono' : 'Activar micrófono'}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: micActivo ? '#334155' : '#dc2626', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {micActivo ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button
          onClick={onAlternarPantalla}
          title={compartiendoPantalla ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
          aria-label={compartiendoPantalla ? 'Dejar de compartir pantalla' : 'Compartir pantalla'}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: compartiendoPantalla ? '#3658e1' : '#334155', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {compartiendoPantalla ? <ScreenShareOff size={18} /> : <ScreenShare size={18} />}
        </button>
        <button
          onClick={onColgar}
          title="Colgar"
          aria-label="Colgar"
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: '#dc2626', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}
