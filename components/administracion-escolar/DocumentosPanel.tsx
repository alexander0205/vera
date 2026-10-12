'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FileCheck, Loader2, Plus, Trash2, AlertTriangle, Copy, Pencil, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Los listados de documentos del colegio.
 *
 * Un listado es un juego de papeles con nombre —«Admisión inicial», «Traslado
 * de otro centro»— y al matricular se elige uno. Antes esto se deducía cruzando
 * el nivel del alumno con el tipo de inscripción: doce listas en un colegio de
 * seis niveles, todas casi iguales, y ninguna describía lo que de verdad pasa
 * en recepción. Quien recibe a la familia no piensa «Primario · reinscripción»,
 * piensa «este viene de traslado».
 *
 * Por eso el listado se elige a mano y no se adivina: el colegio sabe cuál
 * toca, y cualquier regla automática que se invente aquí se equivocará
 * justamente en los casos raros, que son los que importan.
 */

interface Lista {
  id: number;
  nombre: string;
  documentos: number;
}

interface DocumentoRequerido {
  id: number;
  listaId: number | null;
  nombre: string;
  exigencia: 'requerido' | 'si_aplica';
  cantidad: number;
  ayuda: string | null;
  orden: number;
  activo: boolean;
}

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());
const API_LISTAS = '/api/administracion-escolar/documentos/listas';
const API_DOCS = '/api/administracion-escolar/documentos/requeridos';

export function DocumentosPanel() {
  const listasSWR = useSWR<{ listas: Lista[] }>(API_LISTAS, fetcher, { revalidateOnFocus: false });
  const docsSWR = useSWR<{ documentos: DocumentoRequerido[] }>(API_DOCS, fetcher, { revalidateOnFocus: false });

  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [nuevoDoc, setNuevoDoc] = useState('');
  const [nuevaLista, setNuevaLista] = useState('');
  const [creandoLista, setCreandoLista] = useState(false);
  const [renombrando, setRenombrando] = useState<Lista | null>(null);
  const [porBorrarDoc, setPorBorrarDoc] = useState<DocumentoRequerido | null>(null);
  const [porBorrarLista, setPorBorrarLista] = useState<Lista | null>(null);
  const [guardando, setGuardando] = useState(false);

  const listas = useMemo(() => listasSWR.data?.listas ?? [], [listasSWR.data]);
  const documentos = useMemo(() => docsSWR.data?.documentos ?? [], [docsSWR.data]);

  // La primera de la lista mientras no se elija otra. Se resuelve al vuelo y no
  // con un efecto: así no hay un parpadeo enseñando el listado equivocado.
  const activa = seleccionada ?? listas[0]?.id ?? null;

  // Si el listado abierto desaparece —lo quitó otro usuario— se vuelve al
  // primero en vez de dejar la derecha en blanco sin explicación.
  useEffect(() => {
    if (seleccionada != null && listas.length > 0 && !listas.some((l) => l.id === seleccionada)) {
      setSeleccionada(null);
    }
  }, [listas, seleccionada]);

  const delListado = useMemo(
    () => documentos.filter((d) => d.activo && d.listaId === activa),
    [documentos, activa],
  );

  async function llamar(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { error?: string }).error ?? 'No se pudo guardar');
    return json as Record<string, unknown>;
  }

  function recargar() {
    // Los dos: crear un documento cambia el conteo que enseña el listado.
    return Promise.all([listasSWR.mutate(), docsSWR.mutate()]);
  }

  async function crearLista(copiarDe?: number) {
    const nombre = nuevaLista.trim();
    if (!nombre) return;
    setCreandoLista(true);
    try {
      const json = await llamar(API_LISTAS, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, copiarDe }),
      });
      setNuevaLista('');
      await recargar();
      const creada = (json.lista as Lista | undefined)?.id;
      if (creada) setSeleccionada(creada);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear');
    } finally { setCreandoLista(false); }
  }

  async function renombrarLista(l: Lista, nombre: string) {
    try {
      await llamar(API_LISTAS, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: l.id, nombre }),
      });
      await recargar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo renombrar');
    } finally { setRenombrando(null); }
  }

  async function duplicarLista(l: Lista) {
    setCreandoLista(true);
    try {
      const json = await llamar(API_LISTAS, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: `${l.nombre} (copia)`, copiarDe: l.id }),
      });
      await recargar();
      const creada = (json.lista as Lista | undefined)?.id;
      if (creada) setSeleccionada(creada);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo duplicar');
    } finally { setCreandoLista(false); }
  }

  async function borrarLista() {
    if (!porBorrarLista) return;
    try {
      const json = await llamar(`${API_LISTAS}?id=${porBorrarLista.id}`, { method: 'DELETE' });
      setSeleccionada(null);
      await recargar();
      toast.success((json.aviso as string) ?? 'Listado quitado.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo quitar');
    } finally { setPorBorrarLista(null); }
  }

  async function agregarDoc() {
    const nombre = nuevoDoc.trim();
    if (!nombre || !activa) return;
    setGuardando(true);
    try {
      await llamar(API_DOCS, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre, listaId: activa, exigencia: 'requerido',
          // La columna del tipo sigue siendo NOT NULL en la base aunque ya no
          // decida nada: el listado es quien manda desde 0129.
          tipoInscripcion: 'nuevo',
        }),
      });
      setNuevoDoc('');
      await recargar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo añadir');
    } finally { setGuardando(false); }
  }

  async function cambiarDoc(d: DocumentoRequerido, parche: Record<string, unknown>) {
    try {
      await llamar(`${API_DOCS}/${d.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parche),
      });
      await docsSWR.mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

  /**
   * Sube o baja un documento dentro de su listado.
   *
   * Manda la lista COMPLETA de ids en su nuevo orden, que es lo que la API ya
   * espera: con dos personas tocando la pantalla, mandar «sube este» deja el
   * orden dependiendo de quién guardó último.
   */
  const [sembrando, setSembrando] = useState(false);

  /**
   * Trae la lista que dictó el colegio.
   *
   * `sembrarDocumentos` existía en el servidor desde el principio y ningún
   * botón la llamaba: los listados nacían vacíos y había que teclear diez
   * documentos uno a uno. Es idempotente por (nivel, tipo, nombre).
   */
  async function sembrar() {
    setSembrando(true);
    try {
      const r = await llamar(API_DOCS, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sembrar: true }),
      }) as { creados?: number };
      toast.success(r.creados
        ? `${r.creados} documento(s) traídos. Repártelos por listado y ajusta lo que haga falta.`
        : 'Ya estaban todos.');
      await docsSWR.mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo traer la lista');
    } finally {
      setSembrando(false);
    }
  }

  async function moverDoc(indice: number, direccion: -1 | 1) {
    const destino = indice + direccion;
    if (destino < 0 || destino >= delListado.length) return;
    const ids = delListado.map((d) => d.id);
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    try {
      await llamar(`${API_DOCS}/${ids[0]}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden: ids }),
      });
      await docsSWR.mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo reordenar');
    }
  }

  async function borrarDoc() {
    if (!porBorrarDoc) return;
    try {
      const json = await llamar(`${API_DOCS}/${porBorrarDoc.id}`, { method: 'DELETE' });
      await recargar();
      // El servidor decide si borra o desactiva: él sabe en cuántas matrículas
      // se entregó ya.
      toast.success((json.aviso as string) ?? 'Documento quitado.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar');
    } finally { setPorBorrarDoc(null); }
  }

  if (listasSWR.isLoading || docsSWR.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-zero-600" /></div>;
  }

  const listaActiva = listas.find((l) => l.id === activa) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-start">

        {/* ── Los listados ─────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <p className="border-b border-gray-100 bg-gray-50/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Listados
          </p>

          {listas.length === 0 ? (
            <p className="px-3 py-4 text-xs text-gray-400">
              Ninguno todavía. Crea el primero abajo.
            </p>
          ) : (
            <ul>
              {listas.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => setSeleccionada(l.id)}
                    className={`flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2.5 text-left transition-colors ${
                      l.id === activa ? 'bg-zero-50' : 'hover:bg-gray-50'
                    }`}>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${l.id === activa ? 'font-medium text-zero-700' : 'text-gray-900'}`}>
                        {l.nombre}
                      </span>
                      {/* Un listado vacío no pide nada, y eso hay que verlo sin
                          abrirlo: si se elige al matricular, esa familia entra
                          sin entregar un solo papel. */}
                      <span className={`block text-xs ${l.documentos === 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {l.documentos === 0 ? 'sin documentos' : `${l.documentos} documento${l.documentos === 1 ? '' : 's'}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2 border-t border-gray-100 p-2.5">
            <Input placeholder="Nuevo listado…" value={nuevaLista}
              onChange={(e) => setNuevaLista(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void crearLista(); } }}
              className="h-9 min-w-0 flex-1 text-sm" />
            <Button size="sm" variant="outline" onClick={() => void crearLista()}
              disabled={creandoLista || !nuevaLista.trim()} className="shrink-0">
              {creandoLista ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* ── Los documentos del listado abierto ───────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {!listaActiva ? (
            <div className="p-10 text-center">
              <FileCheck className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="font-medium text-gray-600">Sin listados</p>
              <p className="mt-1 text-sm text-gray-400">
                Un listado es lo que se le pide a una familia al matricular. Crea uno
                —«Admisión», «Traslado»— y ponle sus documentos.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2.5">
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                  {listaActiva.nombre}
                </h2>
                <button type="button" title="Renombrar" aria-label={`Renombrar ${listaActiva.nombre}`}
                  onClick={() => setRenombrando(listaActiva)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" title="Duplicar" aria-label={`Duplicar ${listaActiva.nombre}`}
                  onClick={() => void duplicarLista(listaActiva)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <Copy className="h-4 w-4" />
                </button>
                <button type="button" title="Quitar listado" aria-label={`Quitar ${listaActiva.nombre}`}
                  onClick={() => setPorBorrarLista(listaActiva)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="hidden items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:flex">
                <span className="min-w-0 flex-1">Documento</span>
                <span className="w-32 shrink-0">Exigencia</span>
                <span className="w-16 shrink-0 text-center">Cant.</span>
                <span className="w-8 shrink-0" />
              </div>

              {delListado.length === 0 ? (
                <div className="flex flex-wrap items-start gap-2.5 bg-amber-50 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="min-w-[220px] flex-1 text-xs text-amber-900">
                    Este listado está vacío. Si se elige al matricular, esa familia
                    entra sin entregar nada.
                  </p>
                  {/* La semilla llevaba escrita desde el principio y no la
                      llamaba ningún botón: llenar un listado a mano son diez
                      documentos escritos uno a uno. Es idempotente, así que
                      pulsarlo dos veces no duplica nada. */}
                  <Button size="sm" variant="outline" disabled={sembrando}
                    onClick={() => void sembrar()}>
                    {sembrando
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                    Traer los documentos habituales
                  </Button>
                </div>
              ) : (
                <ul>
                  {delListado.map((d, i) => (
                    <li key={d.id}
                      className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50/60">
                      {/* Subir y bajar: el orden es el que verá la familia, y
                          hasta ahora era el de creación y punto. */}
                      <div className="flex shrink-0 flex-col">
                        <button type="button" aria-label={`Subir ${d.nombre}`} title="Subir"
                          disabled={i === 0}
                          onClick={() => void moverDoc(i, -1)}
                          className="rounded p-0.5 text-gray-300 transition-colors hover:text-gray-600 disabled:opacity-30">
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" aria-label={`Bajar ${d.nombre}`} title="Bajar"
                          disabled={i === delListado.length - 1}
                          onClick={() => void moverDoc(i, 1)}
                          className="rounded p-0.5 text-gray-300 transition-colors hover:text-gray-600 disabled:opacity-30">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-900" title={d.nombre}>{d.nombre}</p>
                        {/* La instrucción para la FAMILIA. Se edita aquí mismo
                            porque escribirla es parte de definir el documento:
                            «acta de nacimiento» sin decir «original con sello»
                            se cumple mandando una foto de una fotocopia. */}
                        <input
                          defaultValue={d.ayuda ?? ''}
                          placeholder="Instrucción para la familia (opcional): «original con sello», «las dos caras»…"
                          aria-label={`Instrucción de ${d.nombre}`}
                          maxLength={300}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (d.ayuda ?? '')) void cambiarDoc(d, { ayuda: v });
                          }}
                          className="mt-0.5 w-full border-0 bg-transparent p-0 text-xs text-gray-500 placeholder:text-gray-300 focus:outline-none focus:ring-0"
                        />
                      </div>

                      <div className="w-32 shrink-0">
                        <NativeSelect value={d.exigencia} aria-label={`Exigencia de ${d.nombre}`}
                          onChange={(e) => void cambiarDoc(d, { exigencia: e.target.value })}
                          className="text-xs">
                          <option value="requerido">Requerido</option>
                          <option value="si_aplica">Si aplica</option>
                        </NativeSelect>
                      </div>

                      {/* `Input` lleva `fullWidth` de MUI, que gana a cualquier
                          `w-*` de Tailwind: envuelto en una caja llena la caja
                          y no la fila —sin esto el nombre se quedaba sin sitio. */}
                      <div className="w-16 shrink-0">
                        <Input type="number" min={1} max={20} value={d.cantidad}
                          aria-label={`Cantidad de ${d.nombre}`}
                          onChange={(e) => void cambiarDoc(d, { cantidad: Number(e.target.value) || 1 })}
                          className="text-center text-xs" />
                      </div>

                      <button type="button" aria-label={`Quitar ${d.nombre}`} title="Quitar"
                        onClick={() => setPorBorrarDoc(d)}
                        className="w-8 shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2 border-t border-gray-100 p-3">
                <Input placeholder="Añadir documento…" value={nuevoDoc}
                  onChange={(e) => setNuevoDoc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregarDoc(); } }}
                  className="h-9 flex-1 text-sm" />
                <Button size="sm" variant="outline" onClick={() => void agregarDoc()}
                  disabled={guardando || !nuevoDoc.trim()} className="shrink-0">
                  {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Al matricular se elige uno de estos listados. <b>Si aplica</b> no es opcional:
        hay que resolverlo (por ejemplo, el acta de divorcio solo si los padres lo están).
      </p>

      {renombrando && (
        <RenombrarDialog
          lista={renombrando}
          onCerrar={() => setRenombrando(null)}
          onGuardar={(n) => void renombrarLista(renombrando, n)}
        />
      )}

      <ConfirmDialog
        open={porBorrarDoc !== null}
        onOpenChange={(o) => { if (!o) setPorBorrarDoc(null); }}
        title="Quitar documento"
        description={porBorrarDoc
          ? `«${porBorrarDoc.nombre}» deja de pedirse en este listado. Si ya se entregó en alguna matrícula no se borra: se desactiva, y lo escaneado se conserva.`
          : ''}
        confirmLabel="Quitar"
        destructive
        onConfirm={borrarDoc}
      />

      <ConfirmDialog
        open={porBorrarLista !== null}
        onOpenChange={(o) => { if (!o) setPorBorrarLista(null); }}
        title="Quitar listado"
        description={porBorrarLista
          ? `«${porBorrarLista.nombre}» deja de aparecer al matricular. Sus documentos y lo que las familias ya entregaron se conservan.`
          : ''}
        confirmLabel="Quitar"
        destructive
        onConfirm={borrarLista}
      />
    </div>
  );
}

/** Renombrar en un diálogo y no en línea: el nombre se lee en el desplegable de
 *  matriculación, y merece confirmarse antes de cambiarlo. */
function RenombrarDialog({ lista, onCerrar, onGuardar }: {
  lista: Lista; onCerrar: () => void; onGuardar: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState(lista.nombre);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => { if (!o) onCerrar(); }}
      title="Renombrar listado"
      description={
        <div className="pt-1">
          <Input value={nombre} autoFocus onChange={(e) => setNombre(e.target.value)}
            aria-label="Nombre del listado" className="text-sm" />
        </div>
      }
      confirmLabel="Guardar"
      onConfirm={() => { if (nombre.trim()) onGuardar(nombre.trim()); }}
    />
  );
}

/** Etiqueta suelta, por si hace falta fuera de la lista. */
export function ExigenciaBadge({ exigencia }: { exigencia: 'requerido' | 'si_aplica' }) {
  return exigencia === 'requerido'
    ? <span className="rounded bg-zero-50 px-1.5 py-0.5 text-[11px] font-medium text-zero-700">Requerido</span>
    : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Si aplica</span>;
}

export { Label };
