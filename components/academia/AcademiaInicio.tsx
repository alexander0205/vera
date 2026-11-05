'use client';

/**
 * Inicio de la Academia: buscador, filtro por módulo y lista de videos.
 *
 * Mientras se escribe busca solo en los títulos, descripciones y
 * transcripciones (sin IA). Al enviar la pregunta —Enter o «Buscar»—, si no hay
 * coincidencias o es una pregunta de verdad («cómo cobro una cuenta»), contesta
 * el asistente y enlaza al minuto exacto del video.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Search, Sparkles, PlayCircle } from 'lucide-react';
import { MODULOS_ACADEMIA } from '@/lib/academia/reglas';
import { enlaceVideo, formatearTiempo } from '@/lib/academia/tiempo';
import type { RespuestaAcademia } from '@/lib/academia/respuesta';
import type { ResultadoLista, VideoLista } from '@/lib/academia/tipos';
import { enCurso } from '@/lib/academia/progreso';
import { TarjetaVideo } from './TarjetaVideo';

const SUGERENCIAS = ['Cómo cobro una cuenta', 'Cómo emito una factura', 'Cómo anulo una factura'];

interface Estado {
  resultados: ResultadoLista[];
  /** Si se le ofrece al usuario el botón del asistente (ver `ofertaAsistente`). */
  oferta: 'ninguna' | 'sugerida' | 'disponible';
}

export function AcademiaInicio({ videos, esAdmin }: { videos: VideoLista[]; esAdmin: boolean }) {
  const [q, setQ] = useState('');
  const [modulo, setModulo] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState<Estado | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaAcademia | null>(null);
  const [preguntando, setPreguntando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turno = useRef(0);

  const modulosConVideos = useMemo(
    () => MODULOS_ACADEMIA.filter((m) => videos.some((v) => v.modulo === m.id)),
    [videos],
  );
  const seguir = useMemo(() => enCurso(videos).slice(0, 3), [videos]);
  const visibles = useMemo(
    () => (modulo === 'todos' ? videos : videos.filter((v) => v.modulo === modulo)),
    [videos, modulo],
  );

  // Buscar mientras se escribe, con una pausa para no pedir en cada letra.
  useEffect(() => {
    const texto = q.trim();
    setRespuesta(null);
    setError(null);
    if (!texto) { setBusqueda(null); setBuscando(false); return; }
    const mio = ++turno.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/academia/buscar?q=${encodeURIComponent(texto)}`);
        if (!r.ok) throw new Error();
        const j = (await r.json()) as Estado;
        if (mio === turno.current) setBusqueda(j);
      } catch {
        if (mio === turno.current) setBusqueda({ resultados: [], oferta: 'ninguna' });
      } finally {
        if (mio === turno.current) setBuscando(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function preguntar(texto: string) {
    const pregunta = texto.trim();
    if (!pregunta) return;
    setPreguntando(true);
    setError(null);
    try {
      const r = await fetch('/api/academia/buscar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: pregunta }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudo contestar');
      setRespuesta(j.respuesta as RespuestaAcademia);
      setBusqueda({ resultados: j.resultados as ResultadoLista[], oferta: 'disponible' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo contestar');
    } finally {
      setPreguntando(false);
    }
  }

  const buscandoAlgo = q.trim().length > 0;
  const sinResultados = buscandoAlgo && !buscando && busqueda !== null && busqueda.resultados.length === 0;

  return (
    <section className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Academia</h1>
        <p className="text-sm text-gray-600">Aprende a usar Zero con videos cortos. Escribe lo que quieres hacer y te llevamos al minuto exacto.</p>
      </header>

      <form
        role="search"
        // Enter solo busca (gratis): el asistente es un botón aparte.
        onSubmit={(e) => { e.preventDefault(); }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <label className="relative flex-1">
          <span className="sr-only">Buscar en la Academia</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={300}
            placeholder="Por ejemplo: cómo cobro una cuenta"
            className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-4 text-base text-gray-900 outline-none focus:border-zero-600 focus:ring-2 focus:ring-zero-200"
          />
        </label>
        <button
          type="submit"
          disabled={!buscandoAlgo}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-zero-600 px-6 text-base font-semibold text-white hover:bg-zero-700 disabled:opacity-50"
        >
          <Search className="h-4 w-4" aria-hidden />
          Buscar
        </button>
      </form>

      {!buscandoAlgo && videos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">Prueba con:</span>
          {SUGERENCIAS.map((s) => (
            <button key={s} type="button" onClick={() => setQ(s)}
              className="rounded-full border border-zero-200 bg-zero-50 px-3 py-1.5 text-sm font-medium text-zero-700 hover:bg-zero-100">
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {(preguntando || respuesta) && (
        <div className="space-y-3 rounded-xl border border-zero-200 bg-zero-50 p-5" aria-live="polite">
          <div className="flex items-center gap-2 text-sm font-semibold text-zero-700">
            <Sparkles className="h-4 w-4" aria-hidden /> Respuesta del asistente
          </div>
          {preguntando && !respuesta ? (
            <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando en los videos…</p>
          ) : respuesta && (
            <div className="space-y-2 text-base leading-relaxed text-gray-900">
              <p>
                {respuesta.partes.map((p, i) => p.tipo === 'texto'
                  ? <span key={i}>{p.texto}</span>
                  : (
                    <Link key={i} href={enlaceVideo(p.slug, p.t)}
                      className="mx-1 inline-flex items-center gap-1 rounded-lg border border-zero-300 bg-white px-2 py-0.5 text-sm font-semibold text-zero-700 hover:bg-zero-100">
                      <PlayCircle className="h-3.5 w-3.5" aria-hidden /> {p.etiqueta}
                    </Link>
                  ))}
              </p>
            </div>
          )}
        </div>
      )}

      {!buscandoAlgo && seguir.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Sigue donde te quedaste</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seguir.map((v) => {
              const pct = v.duracionSeg > 0 ? Math.min(100, Math.round((v.avanceSeg / v.duracionSeg) * 100)) : 0;
              return (
                <li key={v.id}>
                  <Link href={enlaceVideo(v.slug, v.avanceSeg)} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 hover:border-zero-300">
                    <span className="text-base font-semibold text-gray-900">{v.titulo}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance">
                      <span className="block h-full rounded-full bg-zero-600" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-xs text-gray-500">Vas en {formatearTiempo(v.avanceSeg)}{v.duracionSeg > 0 ? ` de ${formatearTiempo(v.duracionSeg)}` : ''}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {buscandoAlgo ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {buscando ? 'Buscando…' : sinResultados ? 'No hay videos que coincidan' : 'Videos que coinciden'}
          </h2>
          {sinResultados && (
            <p className="text-sm text-gray-600">
              Todavía no hay un video que hable de eso. Prueba con otras palabras.
            </p>
          )}
          {!buscando && busqueda && busqueda.oferta !== 'ninguna' && !respuesta && (
            <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${busqueda.oferta === 'sugerida' ? 'border-zero-200 bg-zero-50' : 'border-gray-200 bg-white'}`}>
              <p className="flex-1 text-sm text-gray-700">
                {busqueda.oferta === 'sugerida'
                  ? 'Lo que salió no responde del todo. El asistente puede redactarte la respuesta con lo que dicen los videos.'
                  : '¿Quieres una respuesta redactada? El asistente la arma con lo que dicen estos videos.'}
              </p>
              <button type="button" onClick={() => void preguntar(q)} disabled={preguntando}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zero-300 bg-white px-4 text-sm font-semibold text-zero-700 hover:bg-zero-100 disabled:opacity-50">
                {preguntando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                Preguntarle al asistente
              </button>
            </div>
          )}
          <ul className="grid gap-3">
            {busqueda?.resultados.map(({ video, momento }) => (
              <li key={video.id}>
                <Link href={enlaceVideo(video.slug, momento?.t ?? 0)}
                  className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white p-4 hover:border-zero-300">
                  <span className="text-base font-semibold text-gray-900">{video.titulo}</span>
                  {momento && (
                    <span className="text-sm text-gray-600">
                      <span className="mr-2 rounded bg-zero-50 px-1.5 py-0.5 font-semibold text-zero-700">{formatearTiempo(momento.t)}</span>
                      {momento.texto}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {modulosConVideos.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por módulo">
              {[{ id: 'todos', label: 'Todos' }, ...modulosConVideos].map((m) => (
                <button key={m.id} type="button" onClick={() => setModulo(m.id)} aria-pressed={modulo === m.id}
                  className={`rounded-full border px-4 py-2 text-sm font-medium ${modulo === m.id
                    ? 'border-zero-600 bg-zero-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {visibles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <PlayCircle className="mx-auto h-8 w-8 text-gray-400" aria-hidden />
              <p className="mt-3 text-base font-semibold text-gray-900">Todavía no hay videos</p>
              <p className="mt-1 text-sm text-gray-600">
                {esAdmin
                  ? <>Sube el primero desde <Link href="/admin/academia" className="font-semibold text-zero-700 underline">Administrar videos</Link>.</>
                  : 'Muy pronto vas a ver aquí los videos para aprender a usar Zero.'}
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibles.map((v) => <li key={v.id}><TarjetaVideo video={v} /></li>)}
            </ul>
          )}
        </>
      )}

      {esAdmin && videos.length > 0 && (
        <p className="text-sm text-gray-500">
          <Link href="/admin/academia" className="font-semibold text-zero-700 underline">Administrar videos</Link>
        </p>
      )}
    </section>
  );
}
