'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dictar al asistente. Dos caminos, los dos gratis:
 *  1. Whisper en el servidor (`/api/asistente/voz`, Groq) si está configurado:
 *     se graba, se manda al terminar y vuelve el texto.
 *  2. Si no, el reconocimiento de voz del navegador (Chrome, Edge, Safari),
 *     que escribe mientras se habla.
 * En los dos el texto cae en la caja para revisarlo: nunca se envía solo.
 */

export type EstadoDictado = 'inactivo' | 'grabando' | 'transcribiendo';

/** Dos minutos: lo que cabe en una pregunta y en el límite de la ruta. */
const MAX_SEGUNDOS = 120;

type Reconocedor = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};

function reconocedorDelNavegador(): (new () => Reconocedor) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const puedeGrabar = () => typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function useDictado(alTexto: (texto: string) => void) {
  const [estado, setEstado] = useState<EstadoDictado>('inactivo');
  const [error, setError] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  // Se decide en el navegador, después de montar: en el servidor no hay micrófono.
  const [disponible, setDisponible] = useState(false);
  useEffect(() => { setDisponible(puedeGrabar() || reconocedorDelNavegador() != null); }, []);

  const servidor = useRef<boolean | null>(null);
  const grabador = useRef<MediaRecorder | null>(null);
  const reconocedor = useRef<Reconocedor | null>(null);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);
  const alTextoRef = useRef(alTexto);
  alTextoRef.current = alTexto;

  const pararReloj = () => { if (reloj.current) clearInterval(reloj.current); reloj.current = null; };
  useEffect(() => () => {
    pararReloj();
    grabador.current?.stream.getTracks().forEach((t) => t.stop());
    reconocedor.current?.stop();
  }, []);

  const parar = useCallback(() => {
    pararReloj();
    if (grabador.current?.state === 'recording') grabador.current.stop();
    else if (reconocedor.current) reconocedor.current.stop();
  }, []);

  const arrancarReloj = useCallback(() => {
    setSegundos(0);
    reloj.current = setInterval(() => {
      setSegundos((s) => {
        if (s + 1 >= MAX_SEGUNDOS) parar();
        return s + 1;
      });
    }, 1000);
  }, [parar]);

  const conNavegador = useCallback(() => {
    const SR = reconocedorDelNavegador();
    if (!SR) { setError('Tu navegador no permite dictar. Prueba en Chrome o escribe la pregunta.'); return; }
    const r = new SR();
    r.lang = 'es-DO'; r.continuous = true; r.interimResults = false;
    let dicho = '';
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) dicho += `${e.results[i][0].transcript} `;
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('Dale permiso al micrófono para dictar.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setError('No pude oír bien. Intenta otra vez o escribe.');
    };
    r.onend = () => {
      pararReloj(); reconocedor.current = null; setEstado('inactivo');
      if (dicho.trim()) alTextoRef.current(dicho.trim());
    };
    reconocedor.current = r;
    r.start();
    setEstado('grabando');
    arrancarReloj();
  }, [arrancarReloj]);

  const conServidor = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Dale permiso al micrófono para dictar.');
      return;
    }
    const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
    const g = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    const trozos: Blob[] = [];
    g.ondataavailable = (e) => { if (e.data.size > 0) trozos.push(e.data); };
    g.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      grabador.current = null;
      const audio = new Blob(trozos, { type: g.mimeType || tipo || 'audio/webm' });
      if (audio.size === 0) { setEstado('inactivo'); return; }
      setEstado('transcribiendo');
      try {
        const cuerpo = new FormData();
        cuerpo.append('audio', audio);
        const r = await fetch('/api/asistente/voz', { method: 'POST', body: cuerpo });
        const d = await r.json().catch(() => ({})) as { texto?: string; error?: string; navegador?: boolean };
        if (!r.ok) {
          if (d.navegador) servidor.current = false;
          setError(d.error ?? 'No pude pasar el audio a texto.');
        } else if (d.texto) alTextoRef.current(d.texto);
        else setError('No se oyó nada. Acércate al micrófono e intenta otra vez.');
      } catch {
        setError('No pude pasar el audio a texto. Revisa la conexión.');
      } finally {
        setEstado('inactivo');
      }
    };
    grabador.current = g;
    g.start();
    setEstado('grabando');
    arrancarReloj();
  }, [arrancarReloj]);

  const alternar = useCallback(async () => {
    if (estado === 'grabando') { parar(); return; }
    if (estado !== 'inactivo') return;
    setError(null);
    if (servidor.current === null) {
      try {
        const r = await fetch('/api/asistente/voz');
        servidor.current = r.ok ? Boolean(((await r.json()) as { servidor?: boolean }).servidor) : false;
      } catch {
        servidor.current = false;
      }
    }
    if (servidor.current && puedeGrabar()) await conServidor();
    else conNavegador();
  }, [estado, parar, conServidor, conNavegador]);

  return { estado, error, segundos, disponible, alternar, limpiarError: () => setError(null) };
}
