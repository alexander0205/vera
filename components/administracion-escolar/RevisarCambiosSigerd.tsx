'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle, ArrowRight, ArrowRightLeft, CalendarClock, Check, ChevronDown, ChevronRight,
  ArrowLeft, LayoutGrid, Loader2, Pencil, UserMinus, UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ObtenerSigerd } from '@/components/administracion-escolar/ObtenerSigerd';
import type { RevisionSigerd, ResultadoMover } from '@/lib/administracion-escolar/cambios-sigerd';
import type { CambioDeSeccion } from '@/lib/sigerd/comparar-cambios';

/**
 * «Revisar cambios de SIGERD».
 *
 * Compara Zero con la ÚLTIMA DESCARGA del portal —no con el portal— y enseña
 * cinco grupos: alumnos nuevos, alumnos que ya no están, cambios de sección,
 * secciones nuevas y secciones renombradas. Lo único que escribe es «Mover a la
 * sección de SIGERD»; el resto solo informa y dice por dónde se arregla.
 *
 * La fecha de la descarga va arriba y bien visible, junto al botón para volver
 * a bajar: sin eso, «no hay cambios» se lee como «SIGERD no ha cambiado», y lo
 * que dice es «no ha cambiado desde que se bajó».
 */

const URL_CAMBIOS = '/api/administracion-escolar/sigerd/cambios';

const traer = async (url: string): Promise<RevisionSigerd> => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? 'No se pudo cargar la comparación.');
  return j as RevisionSigerd;
};

/** Filas que se pintan de golpe por grupo; el resto, con «Ver más». */
const TOPE = 100;

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' });

export function RevisarCambiosSigerd() {
  const { data, error, mutate } = useSWR<RevisionSigerd>(URL_CAMBIOS, traer, {
    // Lee un volcado de varios MB: no se repite solo al volver a la pestaña.
    revalidateOnFocus: false,
  });

  // `data` y no `isLoading`: con datos ya en caché hay que enseñarlos mientras
  // se revalida, no volver a la pantalla de carga.
  if (!data && !error) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Comparando con la última descarga…
      </p>
    );
  }
  if (error || !data) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error instanceof Error ? error.message : 'No se pudo cargar la comparación.'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/escolar/configuracion/sigerd"
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Traer datos de SIGERD
        </Link>
        <h2 className="text-xl font-semibold text-gray-900">Revisar cambios de SIGERD</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Qué es distinto entre SIGERD y tu sistema: alumnos que entraron o salieron, cambios de
          sección y secciones nuevas.
        </p>
      </div>

      <FechaDeLaDescarga data={data} onBajada={() => void mutate()} />

      {!data.disponible || !data.cambios ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {data.motivo ?? 'No hay con qué comparar.'}{' '}
            {!data.periodo && <Link href="/escolar/configuracion/estructura" className="font-medium underline">Configurar el año escolar</Link>}
          </span>
        </p>
      ) : (
        <Comparacion data={data} onCambio={() => void mutate()} />
      )}
    </div>
  );
}

// ── De qué descarga sale todo esto ──────────────────────────────────────────

function FechaDeLaDescarga({ data, onBajada }: { data: RevisionSigerd; onBajada: () => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
          <CalendarClock className="h-4 w-4" />
        </span>
        <div className="min-w-0 text-sm">
          {data.descargadaEl ? (
            <p className="font-semibold text-sky-950">
              Comparando con la descarga del {fechaLarga(data.descargadaEl)}
              {data.periodo ? <span className="font-normal text-sky-800"> · año escolar {data.periodo.nombre}</span> : null}
            </p>
          ) : (
            <p className="font-semibold text-sky-950">Todavía no hay una descarga de SIGERD</p>
          )}
          <p className="mt-0.5 text-sky-900">
            Esto compara tu sistema con <b>la última descarga</b>, no con SIGERD en vivo. Lo que
            cambió en el portal después de esa fecha no aparece hasta que vuelvas a bajar.
          </p>
        </div>
      </div>
      <div className="pl-12">
        <ObtenerSigerd onCompletado={onBajada} />
      </div>
    </div>
  );
}

// ── La comparación ──────────────────────────────────────────────────────────

function Comparacion({ data, onCambio }: { data: RevisionSigerd; onCambio: () => void }) {
  const c = data.cambios!;
  const n = {
    cambios: c.cambiaronDeSeccion.length,
    nuevos: c.nuevos.length,
    yaNoEstan: c.yaNoEstan.length,
    seccionesNuevas: c.seccionesNuevas.length,
    renombradas: c.seccionesRenombradas.length,
  };
  const total = n.cambios + n.nuevos + n.yaNoEstan + n.seccionesNuevas + n.renombradas;

  return (
    <div className="space-y-4">
      {c.seccionesConError.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            La descarga no pudo leer {c.seccionesConError.length === 1 ? 'una sección' : `${c.seccionesConError.length} secciones`}{' '}
            ({c.seccionesConError.slice(0, 3).join(', ')}{c.seccionesConError.length > 3 ? '…' : ''}).
            Sus alumnos pueden salir abajo como «ya no están» solo porque no se leyeron. Vuelve a bajar
            antes de fiarte de esa lista.
          </span>
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Ficha ancla="cambios" icono={<ArrowRightLeft className="h-4 w-4" />} n={n.cambios} texto="Cambiaron de sección" />
        <Ficha ancla="nuevos" icono={<UserPlus className="h-4 w-4" />} n={n.nuevos} texto="Alumnos nuevos" />
        <Ficha ancla="ya-no-estan" icono={<UserMinus className="h-4 w-4" />} n={n.yaNoEstan} texto="Ya no están" />
        <Ficha ancla="secciones-nuevas" icono={<LayoutGrid className="h-4 w-4" />} n={n.seccionesNuevas} texto="Secciones nuevas" />
        <Ficha ancla="renombradas" icono={<Pencil className="h-4 w-4" />} n={n.renombradas} texto="Secciones renombradas" />
      </div>

      {total === 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Tu sistema coincide con la descarga: {c.totales.emparejados} alumnos emparejados, ningún cambio de
            sección y ninguna sección nueva. Para ver si SIGERD cambió desde entonces, vuelve a bajar.
          </span>
        </p>
      )}

      {c.totales.enCursoSinEnlace > 0 && (
        <p className="text-xs text-gray-500">
          {c.totales.enCursoSinEnlace} alumno{c.totales.enCursoSinEnlace !== 1 ? 's' : ''} está
          {c.totales.enCursoSinEnlace !== 1 ? 'n' : ''} matriculado{c.totales.enCursoSinEnlace !== 1 ? 's' : ''} en
          una sección sin enlace a SIGERD: de esos no se puede saber si cambiaron de sección.
        </p>
      )}

      <CambiosDeSeccion cambios={c.cambiaronDeSeccion} onMovido={onCambio} />

      <Grupo id="nuevos" icono={<UserPlus className="h-4 w-4" />} titulo="Alumnos nuevos en SIGERD" n={n.nuevos}
        ayuda={<>
          Están en SIGERD y no tienen ficha en Zero. Se traen en{' '}
          <Link href="/escolar/configuracion/sigerd" className="font-medium text-zero-700 underline">Configuración › SIGERD › Estudiantes</Link>{' '}
          (entran sin matricular) y después se matriculan desde «Matricular desde SIGERD».
        </>}>
        <Filas items={c.nuevos} clave={(a) => a.idSigerd}
          fila={(a) => (
            <>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{a.nombre}</span>
              <span className="hidden shrink-0 text-xs text-gray-400 md:inline">{a.ubicacion}</span>
            </>
          )} />
      </Grupo>

      <Grupo id="ya-no-estan" icono={<UserMinus className="h-4 w-4" />} titulo="Ya no están en SIGERD" n={n.yaNoEstan}
        ayuda="Son alumnos activos en Zero que SIGERD ya no lista en ninguna sección. Zero no los da de baja solo: revisa cada caso y, si se fueron del colegio, dalos de baja desde su ficha.">
        <Filas items={c.yaNoEstan} clave={(a) => a.estudianteId}
          fila={(a) => (
            <>
              <Link href={`/escolar/estudiantes/${a.estudianteId}`}
                className="min-w-0 flex-1 truncate text-sm font-medium text-zero-700 hover:underline">{a.nombre}</Link>
              <span className="hidden shrink-0 text-xs text-gray-400 md:inline">
                {a.cursoEtiqueta ? `En Zero: ${a.cursoEtiqueta}` : 'Sin matrícula activa'}
              </span>
            </>
          )} />
      </Grupo>

      <Grupo id="secciones-nuevas" icono={<LayoutGrid className="h-4 w-4" />} titulo="Secciones nuevas en SIGERD" n={n.seccionesNuevas}
        ayuda={<>
          Existen en SIGERD y ninguna sección de tu estructura está enlazada a ellas. Se crean en{' '}
          <Link href="/escolar/configuracion/sigerd" className="font-medium text-zero-700 underline">Configuración › SIGERD › Estructura</Link>.
        </>}>
        <Filas items={c.seccionesNuevas} clave={(s) => s.idSeccion}
          fila={(s) => (
            <>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{s.ubicacion}</span>
              <span className="shrink-0 text-xs text-gray-400">{s.estudiantes} alumno{s.estudiantes !== 1 ? 's' : ''}</span>
            </>
          )} />
      </Grupo>

      <Grupo id="renombradas" icono={<Pencil className="h-4 w-4" />} titulo="Secciones renombradas" n={n.renombradas}
        ayuda="La sección está enlazada, pero su nombre en Zero no es el del portal. No pasa nada si tu colegio las llama distinto a propósito; si quieres igualarlas, cambia el nombre en Configuración › Estructura.">
        <Filas items={c.seccionesRenombradas} clave={(s) => s.idSeccion}
          fila={(s) => (
            <>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                «{s.nombreZero}» <ArrowRight className="mx-1 inline h-3 w-3 text-gray-400" /> «{s.nombreSigerd}»
              </span>
              <span className="hidden shrink-0 text-xs text-gray-400 md:inline">{s.ubicacion}</span>
            </>
          )} />
      </Grupo>
    </div>
  );
}

function Ficha({ ancla, icono, n, texto }: { ancla: string; icono: ReactNode; n: number; texto: string }) {
  return (
    <a href={`#${ancla}`}
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-gray-50 ${
        n > 0 ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
        n > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>{icono}</span>
      <span className="min-w-0">
        <span className="block text-xl font-semibold leading-none text-gray-900">{n}</span>
        <span className="mt-1 block truncate text-xs text-gray-500">{texto}</span>
      </span>
    </a>
  );
}

/** Un grupo desplegable. Abierto por defecto si tiene algo que mirar. */
function Grupo({ id, icono, titulo, n, ayuda, children, acciones }: {
  id: string; icono: ReactNode; titulo: string; n: number;
  ayuda?: ReactNode; children?: ReactNode; acciones?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(n > 0);
  // Si tras volver a comparar aparece algo en un grupo que estaba vacío, se abre.
  useEffect(() => { if (n > 0) setAbierto(true); }, [n]);

  return (
    <section id={id} className="scroll-mt-20 rounded-xl border border-gray-200 bg-white">
      <button type="button" onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left">
        {abierto ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        <span className="text-gray-500">{icono}</span>
        <span className="flex-1 text-sm font-semibold text-gray-900">{titulo}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          n > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>{n}</span>
      </button>
      {abierto && (
        <div className="border-t border-gray-100">
          {ayuda && <p className="px-4 py-2.5 text-xs text-gray-500">{ayuda}</p>}
          {acciones}
          {n === 0
            ? <p className="px-4 pb-4 text-sm text-gray-400">Sin diferencias.</p>
            : children}
        </div>
      )}
    </section>
  );
}

/** Lista de filas con tope y «Ver más». */
function Filas<T>({ items, clave, fila }: {
  items: T[]; clave: (x: T) => string | number; fila: (x: T) => ReactNode;
}) {
  const [tope, setTope] = useState(TOPE);
  return (
    <>
      <div className="divide-y divide-gray-100 border-t border-gray-100">
        {items.slice(0, tope).map((x) => (
          <div key={clave(x)} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50/60">{fila(x)}</div>
        ))}
      </div>
      {items.length > tope && (
        <button type="button" onClick={() => setTope((t) => t + TOPE)}
          className="w-full border-t border-gray-100 py-2.5 text-sm text-zero-700 hover:bg-gray-50">
          Ver {Math.min(TOPE, items.length - tope)} más ({items.length - tope} restantes)
        </button>
      )}
    </>
  );
}

// ── Cambios de sección + «Mover a la sección de SIGERD» ─────────────────────

const MOTIVO_SIN_DESTINO: Record<NonNullable<CambioDeSeccion['sinDestino']>, string> = {
  'varias-secciones': 'SIGERD lo tiene en varias secciones',
  'seccion-sin-enlazar': 'Esa sección no está enlazada en Zero',
  'enlace-duplicado': 'Dos secciones de Zero enlazadas a esa',
};

function CambiosDeSeccion({ cambios, onMovido }: { cambios: CambioDeSeccion[]; onMovido: () => void }) {
  const movibles = useMemo(() => cambios.filter((c) => c.destino), [cambios]);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [moviendo, setMoviendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoMover | null>(null);

  // Tras mover y volver a comparar, lo elegido que ya no está en la lista se descarta.
  useEffect(() => {
    setElegidos((previos) => {
      const vigentes = new Set(movibles.map((c) => c.estudianteId));
      const nuevos = new Set([...previos].filter((id) => vigentes.has(id)));
      return nuevos.size === previos.size ? previos : nuevos;
    });
  }, [movibles]);

  const todosElegidos = movibles.length > 0 && elegidos.size === movibles.length;
  const alternar = (id: number, v: boolean) =>
    setElegidos((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  async function mover() {
    setMoviendo(true);
    setError(null);
    try {
      const r = await fetch('/api/administracion-escolar/sigerd/cambios/mover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estudianteIds: [...elegidos] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError((j as { error?: string }).error ?? 'No se pudo mover.'); return; }
      setResultado(j as ResultadoMover);
      setElegidos(new Set());
      onMovido();
    } catch {
      setError('Se cortó la conexión. Vuelve a revisar antes de repetirlo.');
    } finally {
      setMoviendo(false);
      setConfirmando(false);
    }
  }

  const acciones = (
    <div className="space-y-2 border-t border-gray-100 px-4 py-3">
      <p className="text-xs text-gray-600">
        <b>Mover a la sección de SIGERD</b> cambia la matrícula activa del alumno a la sección que dice
        la descarga. Los cargos ya creados se quedan como están; lo que falte se cobra con la tarifa
        de la nueva sección.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={todosElegidos} disabled={movibles.length === 0}
            onChange={(e) => setElegidos(e.target.checked ? new Set(movibles.map((c) => c.estudianteId)) : new Set())}
            className="h-4 w-4 cursor-pointer accent-zero-600 disabled:opacity-40" />
          Elegir todos los que tienen destino ({movibles.length})
        </label>
        <Tooltip text="Pasa a los alumnos marcados a la sección que tiene SIGERD; te pedirá confirmar"><Button size="sm" className="ml-auto bg-zero-600 hover:bg-zero-700"
          disabled={elegidos.size === 0 || moviendo} onClick={() => setConfirmando(true)}>
          {moviendo && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Mover a la sección de SIGERD{elegidos.size > 0 ? ` (${elegidos.size})` : ''}
        </Button></Tooltip>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {resultado && <ResultadoDelMovimiento r={resultado} />}
    </div>
  );

  return (
    <>
      <Grupo id="cambios" icono={<ArrowRightLeft className="h-4 w-4" />} titulo="Cambiaron de sección" n={cambios.length}
        ayuda="Están matriculados en una sección de Zero y SIGERD los pone en otra. «Matricular desde SIGERD» no los toca porque ya tienen matrícula."
        acciones={cambios.length > 0 ? acciones : (resultado || error ? acciones : undefined)}>
        <Filas items={cambios} clave={(c) => c.estudianteId}
          fila={(c) => (
            <>
              <input type="checkbox" checked={elegidos.has(c.estudianteId)} disabled={!c.destino}
                onChange={(e) => alternar(c.estudianteId, e.target.checked)}
                aria-label={`Elegir a ${c.nombre}`}
                className="h-4 w-4 shrink-0 cursor-pointer accent-zero-600 disabled:cursor-not-allowed disabled:opacity-40" />
              <div className="min-w-0 flex-1">
                <Link href={`/escolar/estudiantes/${c.estudianteId}`}
                  className="block truncate text-sm font-medium text-zero-700 hover:underline">{c.nombre}</Link>
                <p className="truncate text-xs text-gray-500">
                  {c.desde} <ArrowRight className="mx-1 inline h-3 w-3 text-gray-400" />
                  {c.destino ? c.destino.etiqueta : c.hacia}
                </p>
              </div>
              {c.destino
                ? <span className="hidden shrink-0 text-xs text-gray-400 md:inline">SIGERD: {c.hacia}</span>
                : <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
                    title={c.hacia}>
                    {c.sinDestino ? MOTIVO_SIN_DESTINO[c.sinDestino] : 'Sin destino'}
                  </span>}
            </>
          )} />
      </Grupo>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="Mover a la sección de SIGERD"
        description={
          <>
            Se va a pasar la matrícula de <b>{elegidos.size}</b> alumno{elegidos.size !== 1 ? 's' : ''} a la
            sección que dice SIGERD. <b>Los cargos ya creados se quedan; lo que falte se cobra con la
            tarifa de la nueva sección.</b> Cada movimiento queda registrado.
          </>
        }
        confirmLabel="Mover"
        loading={moviendo}
        onConfirm={() => void mover()} />
    </>
  );
}

function ResultadoDelMovimiento({ r }: { r: ResultadoMover }) {
  return (
    <div className="space-y-1.5">
      <p className={`rounded-lg border px-3 py-2 text-sm ${
        r.omitidos.length ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
        <Check className="mr-1.5 inline h-3.5 w-3.5" />
        <b>{r.movidos}</b> {r.movidos === 1 ? 'alumno movido' : 'alumnos movidos'}
        {r.omitidos.length > 0 && <> · <b>{r.omitidos.length}</b> no se {r.omitidos.length === 1 ? 'movió' : 'movieron'}</>}
      </p>
      {r.omitidos.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {r.omitidos.map((o) => <li key={o.estudianteId}><b>{o.nombre}</b> — {o.motivo}</li>)}
        </ul>
      )}
    </div>
  );
}
