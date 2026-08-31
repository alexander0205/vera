'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, ScreenShare, ScreenShareOff, PhoneOff, Volume2, MonitorUp, Maximize, Minimize, ChevronsLeftRight, ChevronsRightLeft } from 'lucide-react';
import type { EstadoLlamada } from '@/lib/webrtc/useLlamada';
import { PulsoLlamada } from './pulso-llamada';

// Fuera del componente: es el mismo objeto siempre, no hay por qué rehacerlo
// en cada render.
const BOTON_ESQUINA: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: 'none',
  cursor: 'pointer', background: 'rgba(15, 23, 42, 0.6)', color: 'white',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export function PanelLlamada({
  estado,
  error,
  micActivo,
  compartiendoPantalla,
  remoteStream,
  videoRemotoActivo,
  onAlternarMicrofono,
  onAlternarPantalla,
  onColgar,
  ancho,
  onAlternarAncho,
}: {
  estado: EstadoLlamada;
  error: string | null;
  micActivo: boolean;
  compartiendoPantalla: boolean;
  remoteStream: MediaStream | null;
  videoRemotoActivo: boolean;
  onAlternarMicrofono: () => void;
  onAlternarPantalla: () => void;
  onColgar: () => void;
  /** El panel ocupa el área principal en vez de la columna angosta. */
  ancho?: boolean;
  /** Si no se pasa, no se dibuja el botón de ensanchar. */
  onAlternarAncho?: () => void;
}) {
  // Dos elementos separados, no uno. Confirmado con logs reales: un único
  // <video> reproduciendo un MediaStream que todavía es solo-audio (sin
  // ningún track de video, que es el estado normal al arrancar la llamada
  // hasta que alguien comparte pantalla) se queda esperando indefinidamente
  // — su promesa de `.play()` ni resuelve ni rechaza, se queda colgada.
  // <video> está pensado para tener video; sin ningún frame que mostrar
  // varios navegadores nunca lo dan por "listo para reproducir", aunque el
  // audio del stream esté disponible y sonando perfectamente bien. Recién
  // al aparecer el track de video (compartir pantalla) el elemento se
  // "despierta" y ahí resuelve — de ahí el patronazo de todas las pruebas
  // anteriores: "el audio arranca justo cuando se comparte pantalla".
  //
  // <audio> no tiene ese problema — nunca espera un frame de video, así que
  // es el que se encarga de TODO el audio, siempre. <video> queda con
  // `muted` fijo y solo se usa para mostrar la imagen cuando hay pantalla
  // compartida real — si también reprodujera audio, se escucharía doble.
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // `.play()` sin gesto reciente del usuario puede quedar bloqueado por la
  // política de autoplay del navegador — no alcanza con que la llamada
  // conecte. Arranca en `false`: el intento automático de abajo es el que
  // decide si hace falta pedir el click. Importante no ponerlo en `true` de
  // entrada y "gastarlo" con el primer click que llegue antes de que exista
  // `remoteStream` (p.ej. tocar silenciar mic apenas se acepta la llamada):
  // el click NO apaga la bandera directamente, solo dispara otro intento de
  // `.play()`, y es ESE intento el que la apaga si sale bien.
  const [necesitaGesto, setNecesitaGesto] = useState(false);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  useEffect(() => {
    const onCambio = () => setPantallaCompleta(document.fullscreenElement === panelRef.current);
    document.addEventListener('fullscreenchange', onCambio);
    return () => document.removeEventListener('fullscreenchange', onCambio);
  }, []);

  function alternarPantallaCompleta() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      panelRef.current?.requestFullscreen().catch(() => {});
    }
  }

  // Separado del efecto de audio/`.play()` de abajo: este SOLO reacciona a
  // que aparezca o desaparezca video real (`videoRemotoActivo`), no a cada
  // cambio de referencia de `remoteStream` — nunca hace falta reiniciar el
  // audio por esto.
  //
  // `videoRemotoActivo` viene de medir frames decodificados de verdad
  // (ConexionLlamada), no de `track.muted` — esa señal del navegador
  // resultó no ser confiable: confirmado dos veces que, al dejar de
  // compartir pantalla, nunca volvía a marcar el track como `muted`, y el
  // <video> se quedaba con el último frame decodificado adentro para
  // siempre. Vaciar `srcObject` acá fuerza al navegador a soltar ese frame
  // apenas la medición real dice que ya no hay video, sin depender de
  // ningún evento del navegador.
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = videoRemotoActivo ? remoteStream : null;
    if (videoRemotoActivo) videoRef.current.play().catch(() => {});
  }, [videoRemotoActivo, remoteStream]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = remoteStream;
    if (!remoteStream || !audioRef.current) return;
    audioRef.current.volume = 1;
    audioRef.current.play()
      .then(() => setNecesitaGesto(false))
      .catch(() => setNecesitaGesto(true));
  }, [remoteStream]);

  function desbloquearAudio() {
    // Disparado DENTRO del handler de click — esto es lo que lo distingue
    // del intento automático de arriba: para el navegador, este `.play()`
    // sí cuenta como "el usuario lo pidió", así que no lo silencia. Se
    // reintenta en CADA click (no una sola vez) hasta que uno funcione.
    audioRef.current?.play().then(() => setNecesitaGesto(false)).catch(() => {});
  }

  return (
    <div
      ref={panelRef}
      onClickCapture={desbloquearAudio}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', borderRadius: pantallaCompleta ? 0 : 12, overflow: 'hidden' }}
    >
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {remoteStream && <audio ref={audioRef} />}
        {/* `autoPlay` de respaldo — está `muted`, así que el navegador lo
            permite siempre sin gesto. El `.play()` explícito del efecto de
            arriba (el que mira `videoRemotoActivo`) es el que realmente
            importa; esto es solo el segundo seguro. */}
        {remoteStream && <video ref={videoRef} muted autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />}

        {remoteStream && necesitaGesto ? (
          <button
            onClick={desbloquearAudio}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              background: 'rgba(15, 23, 42, 0.85)', color: 'white', border: 'none',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 10, textAlign: 'center', padding: '0 20px',
            }}
          >
            <Volume2 size={24} />
            <span style={{ fontSize: 13.5 }}>Click para activar el audio</span>
          </button>
        ) : remoteStream && !videoRemotoActivo ? (
          // `position: absolute` a propósito — el <video> siempre está en
          // el flujo, así que sin esto este ícono competiría por espacio en
          // el mismo contenedor flex en vez de taparlo.
          //
          // `videoRemotoActivo` mira lo que este lado RECIBE, no lo que
          // manda — así que quien está compartiendo su propia pantalla
          // nunca lo ve reflejado acá y, sin este chequeo aparte, se
          // quedaba viendo "Llamada de audio en curso" mientras compartía,
          // que es información falsa: si SOS vos el que comparte, hay que
          // decir eso, no que la llamada es de solo audio.
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#0f172a', pointerEvents: 'none' }}>
            <PulsoLlamada icono={compartiendoPantalla ? MonitorUp : Phone} />
            <span style={{ color: '#cbd5e1', fontSize: 13.5 }}>
              {compartiendoPantalla ? 'Estás compartiendo tu pantalla' : 'Llamada de audio en curso'}
            </span>
          </div>
        ) : !remoteStream ? (
          <span style={{ color: '#94a3b8', fontSize: 13.5, padding: '0 20px', textAlign: 'center' }}>
            {estado === 'conectando' && 'Conectando…'}
            {(estado === 'error' || error) && (error ?? 'No se pudo conectar')}
            {estado === 'activa' && !error && 'Conectando audio…'}
          </span>
        ) : null}

        {/* En pantalla completa el ancho del panel dentro de la página ya no
            significa nada, así que el botón de ensanchar desaparece ahí. */}
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
          {onAlternarAncho && !pantallaCompleta ? (
            <button
              onClick={onAlternarAncho}
              title={ancho ? 'Achicar el video' : 'Agrandar el video'}
              aria-label={ancho ? 'Achicar el video' : 'Agrandar el video'}
              style={BOTON_ESQUINA}
            >
              {ancho ? <ChevronsRightLeft size={16} /> : <ChevronsLeftRight size={16} />}
            </button>
          ) : null}
          <button
            onClick={alternarPantallaCompleta}
            title={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
            aria-label={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
            style={BOTON_ESQUINA}
          >
            {pantallaCompleta ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>
      {estado === 'activa' && (
        <div style={{ padding: '4px 14px', fontSize: 11, color: '#94a3b8', textAlign: 'center', background: '#1e293b', borderTop: '1px solid #334155' }}>
          Esta llamada se está grabando
        </div>
      )}
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
