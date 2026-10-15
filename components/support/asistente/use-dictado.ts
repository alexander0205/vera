'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dictado de la pregunta con el reconocimiento de voz del navegador (Web Speech
 * API). No pasa por el servidor de Zero: lo transcribe el navegador. El texto
 * entra al campo para revisarlo; nunca se envía solo.
 */

interface ResultadoVoz { isFinal: boolean; 0: { transcript: string } }
interface EventoVoz { results: { length: number; [i: number]: ResultadoVoz } }
interface ReconocedorVoz {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoVoz) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type ConstructorVoz = new () => ReconocedorVoz;

const MAX_CARACTERES = 1500;

/** Lo ya escrito más lo dictado, con un solo espacio entre ambos y dentro del tope del campo. */
export function unirDictado(base: string, dictado: string): string {
  const a = base.trimEnd();
  const d = dictado.trim().replace(/\s+/g, ' ');
  if (!d) return a;
  return (a ? `${a} ${d}` : d).slice(0, MAX_CARACTERES);
}

const MENSAJES: Record<string, string> = {
  'not-allowed': 'El navegador no tiene permiso para usar el micrófono.',
  'service-not-allowed': 'El navegador no tiene permiso para usar el micrófono.',
  'no-speech': 'No te escuché. Intenta de nuevo.',
  'audio-capture': 'No encontré un micrófono.',
  network: 'No hay conexión para transcribir la voz.',
};

function constructor(): ConstructorVoz | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: ConstructorVoz; webkitSpeechRecognition?: ConstructorVoz };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictado(alTexto: (texto: string) => void) {
  const [soportado, setSoportado] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<ReconocedorVoz | null>(null);

  useEffect(() => {
    setSoportado(constructor() != null);
    return () => rec.current?.abort();
  }, []);

  /** `base` es lo que ya estaba escrito: el dictado se agrega al final. */
  const iniciar = useCallback((base: string) => {
    const C = constructor();
    if (!C) return;
    setError(null);
    const r = new C();
    r.lang = 'es-DO';
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += `${e.results[i][0].transcript} `;
      alTexto(unirDictado(base, t));
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(MENSAJES[e.error] ?? 'No pude usar el dictado.');
    };
    r.onend = () => setEscuchando(false);
    rec.current = r;
    try {
      r.start();
      setEscuchando(true);
    } catch {
      setEscuchando(false);
    }
  }, [alTexto]);

  const detener = useCallback(() => rec.current?.stop(), []);

  return { soportado, escuchando, error, iniciar, detener };
}
