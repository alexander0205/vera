'use client';

/**
 * /admin/academia — alta, edición y publicación de los videos de la Academia.
 *
 * Los videos NO se alojan en Zero: se suben a Vimeo (en Privacidad, «No listado» u
 * «Ocultar de Vimeo») y aquí se pega el enlace; de él sale el id y el hash y el
 * reproductor se inserta. La miniatura y la duración se leen de Vimeo al guardar. Los capítulos
 * y la transcripción se pegan como texto, una línea por tramo: `0:45 Aquí se
 * abre la lista`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { MODULOS_ACADEMIA, pantallasParaVideos, nombreDeModulo } from '@/lib/academia/reglas';
import { formatearTiempo } from '@/lib/academia/tiempo';
import { MENSAJE_ENLACE_VIMEO, datosDeVimeo, enlaceCanonicoVimeo } from '@/lib/academia/vimeo';
import type { VideoAdmin } from '@/lib/academia/admin';
import { PlayerVideo } from '@/components/academia/PlayerVideo';

type Borrador = {
  id: number | null;
  slug: string; titulo: string; descripcion: string; modulo: string; pantalla: string;
  duracionSeg: number; orden: number; publicado: boolean;
  capitulos: string; transcripcion: string;
  enlaceVimeo: string; miniaturaUrl: string;
};

const NUEVO: Borrador = {
  id: null, slug: '', titulo: '', descripcion: '', modulo: 'general', pantalla: '', duracionSeg: 0, orden: 0,
  publicado: false, capitulos: '', transcripcion: '', enlaceVimeo: '', miniaturaUrl: '',
};

const aBorrador = (v: VideoAdmin): Borrador => ({
  id: v.id, slug: v.slug, titulo: v.titulo, descripcion: v.descripcion, modulo: v.modulo, pantalla: v.pantalla ?? '',
  duracionSeg: v.duracionSeg, orden: v.orden, publicado: v.publicado, capitulos: v.capitulos, transcripcion: v.transcripcion,
  enlaceVimeo: enlaceCanonicoVimeo({ id: v.vimeoId, hash: v.vimeoHash }), miniaturaUrl: v.miniaturaUrl ?? '',
});

const campo = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-zero-600 focus:ring-2 focus:ring-zero-200';

export default function AcademiaAdminClient() {
  const [videos, setVideos] = useState<VideoAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/academia');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Error');
      setVideos(j.videos); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error'); setVideos([]);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const pantallas = useMemo(
    () => pantallasParaVideos().filter((p) => !edit || edit.modulo === 'general' || p.modulo === edit.modulo),
    [edit],
  );

  async function guardar() {
    if (!edit) return;
    if (!datosDeVimeo(edit.enlaceVimeo)) { setError(MENSAJE_ENLACE_VIMEO); return; }
    setGuardando(true); setError(null); setMsg(null);
    const { id, ...cuerpo } = edit;
    try {
      const r = await fetch(id ? `/api/admin/academia/${id}` : '/api/admin/academia', {
        method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar');
      setEdit(aBorrador(j.video));
      setMsg('Guardado.');
      void cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(v: VideoAdmin) {
    if (!window.confirm(`¿Borrar «${v.titulo}» y sus archivos? No se puede deshacer.`)) return;
    const r = await fetch(`/api/admin/academia/${v.id}`, { method: 'DELETE' });
    if (!r.ok) { setError('No se pudo borrar'); return; }
    if (edit?.id === v.id) setEdit(null);
    void cargar();
  }

  async function alternar(v: VideoAdmin) {
    const r = await fetch(`/api/admin/academia/${v.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...aBorrador(v), id: undefined, publicado: !v.publicado }),
    });
    const j = await r.json();
    if (!r.ok) { setError(j.error ?? 'No se pudo cambiar'); return; }
    void cargar();
  }

  const datosVimeo = edit ? datosDeVimeo(edit.enlaceVimeo) : null;
  const set = <K extends keyof Borrador>(k: K, valor: Borrador[K]) => setEdit((e) => (e ? { ...e, [k]: valor } : e));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Academia · videos</h1>
          <p className="text-sm text-gray-600">Sube, edita y publica los videos. Solo los publicados los ve el público.</p>
        </div>
        <Link href="/academia" className="text-sm font-semibold text-zero-700 hover:underline">Ver la Academia</Link>
        <button type="button" onClick={() => { setEdit(NUEVO); setMsg(null); setError(null); }}
          className="inline-flex items-center gap-2 rounded-lg bg-zero-600 px-4 py-2 text-sm font-semibold text-white hover:bg-zero-700">
          <Plus className="h-4 w-4" aria-hidden /> Nuevo video
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Video</th><th className="px-4 py-3">Módulo</th><th className="px-4 py-3">Pantalla</th>
              <th className="px-4 py-3">Duración</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {videos === null && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500"><Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden /></td></tr>}
            {videos?.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Todavía no hay videos.</td></tr>}
            {videos?.map((v) => (
              <tr key={v.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-medium text-gray-900">{v.titulo}<div className="text-xs font-normal text-gray-500">/academia/{v.slug}</div></td>
                <td className="px-4 py-3 text-gray-700">{nombreDeModulo(v.modulo)}</td>
                <td className="px-4 py-3 text-gray-700">{v.pantalla ?? '—'}</td>
                <td className="px-4 py-3 text-gray-700">{v.duracionSeg ? formatearTiempo(v.duracionSeg) : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${v.publicado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {v.publicado ? 'Publicado' : 'Borrador'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button type="button" onClick={() => void alternar(v)} className="mr-3 text-sm font-semibold text-zero-700 hover:underline">
                    {v.publicado ? 'Despublicar' : 'Publicar'}
                  </button>
                  <button type="button" onClick={() => { setEdit(aBorrador(v)); setMsg(null); setError(null); }} className="mr-3 text-sm font-semibold text-zero-700 hover:underline">Editar</button>
                  <button type="button" onClick={() => void borrar(v)} aria-label={`Borrar ${v.titulo}`} className="align-middle text-gray-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <form onSubmit={(e) => { e.preventDefault(); void guardar(); }} className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">{edit.id ? 'Editar video' : 'Nuevo video'}</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2"><span className="text-sm font-medium text-gray-700">Título</span>
              <input className={campo} value={edit.titulo} onChange={(e) => set('titulo', e.target.value)} maxLength={160} required /></label>
            <label className="space-y-1 sm:col-span-2"><span className="text-sm font-medium text-gray-700">Descripción</span>
              <textarea className={campo} rows={2} value={edit.descripcion} onChange={(e) => set('descripcion', e.target.value)} maxLength={2000} /></label>
            <label className="space-y-1"><span className="text-sm font-medium text-gray-700">Módulo</span>
              <select className={campo} value={edit.modulo} onChange={(e) => setEdit((x) => x && { ...x, modulo: e.target.value, pantalla: '' })}>
                {MODULOS_ACADEMIA.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select></label>
            <label className="space-y-1"><span className="text-sm font-medium text-gray-700">Pantalla (enciende la tarjeta ahí)</span>
              <select className={campo} value={edit.pantalla} onChange={(e) => set('pantalla', e.target.value)}>
                <option value="">Ninguna en particular</option>
                {pantallas.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.id})</option>)}
              </select></label>
            <label className="space-y-1"><span className="text-sm font-medium text-gray-700">Dirección (opcional)</span>
              <input className={campo} value={edit.slug} onChange={(e) => set('slug', e.target.value)} maxLength={80} placeholder="se arma con el título" /></label>
            <label className="space-y-1"><span className="text-sm font-medium text-gray-700">Orden (menor sale primero)</span>
              <input className={campo} type="number" value={edit.orden} onChange={(e) => set('orden', Number(e.target.value) || 0)} /></label>
          </div>

          <div className="space-y-3">
            <label className="block space-y-1"><span className="text-sm font-medium text-gray-700">Enlace de Vimeo</span>
              <input className={campo} value={edit.enlaceVimeo} onChange={(e) => set('enlaceVimeo', e.target.value)} maxLength={300}
                placeholder="https://vimeo.com/123456789/abcdef1234" required /></label>
            <p className="text-sm text-gray-600">Sube el video a Vimeo y pega aquí el enlace. Con la cuenta gratis, en Privacidad elige «Público» («Privado» no se reproduce dentro de Zero).</p>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Con un plan de pago de Vimeo puedes ocultarlo mejor: «No listado» u «Ocultar de Vimeo», apagar las descargas y
              limitar dónde se inserta al dominio de Zero. Zero nunca muestra un enlace para bajarlo.
            </p>
            {edit.enlaceVimeo.trim() !== '' && !datosVimeo && <p role="alert" className="text-sm text-red-700">{MENSAJE_ENLACE_VIMEO}</p>}
            {datosVimeo && (
              <div className="max-w-xl space-y-1">
                <span className="text-sm font-medium text-gray-700">Vista previa</span>
                <PlayerVideo key={`${datosVimeo.id}/${datosVimeo.hash ?? ''}`} sinProgreso inicioSeg={0}
                  video={{ id: edit.id ?? 0, vimeoId: datosVimeo.id, vimeoHash: datosVimeo.hash, titulo: edit.titulo || 'Vista previa', duracionSeg: edit.duracionSeg, visto: false, avanceSeg: 0 }}
                  alDuracion={(d) => setEdit((x) => (x && x.duracionSeg === 0 ? { ...x, duracionSeg: d } : x))} />
                <p className="text-xs text-gray-500">
                  Al guardar se leen de Vimeo la miniatura y la duración. Si Vimeo no contesta, escríbelas abajo.
                  {edit.duracionSeg > 0 ? ` Duración leída: ${formatearTiempo(edit.duracionSeg)}.` : ''}
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1"><span className="text-sm font-medium text-gray-700">Duración en segundos</span>
                <input className={campo} type="number" min={0} value={edit.duracionSeg} onChange={(e) => set('duracionSeg', Number(e.target.value) || 0)} /></label>
              <label className="space-y-1"><span className="text-sm font-medium text-gray-700">Miniatura (opcional, https)</span>
                <input className={campo} value={edit.miniaturaUrl} onChange={(e) => set('miniaturaUrl', e.target.value)} maxLength={500} placeholder="Se lee de Vimeo al guardar" /></label>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-1"><span className="text-sm font-medium text-gray-700">Capítulos (una línea cada uno: «0:45 Abrir la lista»)</span>
              <textarea className={`${campo} font-mono`} rows={8} value={edit.capitulos} onChange={(e) => set('capitulos', e.target.value)} placeholder={'0:00 Introducción\n0:45 Abrir la lista'} /></label>
            <label className="space-y-1"><span className="text-sm font-medium text-gray-700">Transcripción con marcas de tiempo (pega el texto)</span>
              <textarea className={`${campo} font-mono`} rows={8} value={edit.transcripcion} onChange={(e) => set('transcripcion', e.target.value)} placeholder={'0:00 Hola, en este video vamos a…\n0:12 Primero entramos a…'} /></label>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" checked={edit.publicado} onChange={(e) => set('publicado', e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            Publicado (visible para todos los usuarios)
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={guardando}
              className="inline-flex items-center gap-2 rounded-lg bg-zero-600 px-5 py-2 text-sm font-semibold text-white hover:bg-zero-700 disabled:opacity-50">
              {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
            </button>
            <button type="button" onClick={() => setEdit(null)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Cerrar</button>
            {msg && <span className="text-sm font-medium text-emerald-700">{msg}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
