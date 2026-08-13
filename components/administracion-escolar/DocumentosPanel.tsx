'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  FileCheck, Loader2, Plus, Trash2, GripVertical, AlertTriangle, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Qué papeles pide el colegio al matricular.
 *
 * Se configura por NIVEL y no por curso a propósito. Los servicios cuelgan de
 * un período —hay un "Primario · Matutina" por año escolar, con id distinto—,
 * así que atar la lista a un id obligaría a rehacerla cada agosto. El nivel por
 * nombre sobrevive al cambio de año. Y por debajo del nivel serían unas
 * cincuenta listas casi idénticas (una por sección) que se desincronizan a la
 * primera.
 *
 * Las dos columnas son los dos momentos en que se piden papeles: entrar al
 * colegio y volver el año siguiente. No se piden los mismos, y verlos lado a
 * lado es lo que deja ver que a la reinscripción no se le exige el acta otra
 * vez.
 */

interface DocumentoRequerido {
  id: number;
  nivel: string | null;
  tipoInscripcion: 'nuevo' | 'reinscripcion';
  nombre: string;
  exigencia: 'requerido' | 'si_aplica';
  cantidad: number;
  orden: number;
  activo: boolean;
}

interface Respuesta { documentos: DocumentoRequerido[]; niveles: string[] }

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());
const API = '/api/administracion-escolar/documentos/requeridos';

const COLUMNAS = [
  { tipo: 'nuevo' as const, titulo: 'Nuevo ingreso', ayuda: 'La primera vez que entra al colegio' },
  { tipo: 'reinscripcion' as const, titulo: 'Reinscripción', ayuda: 'Cada año que vuelve' },
];

export function DocumentosPanel() {
  const { data, isLoading, mutate } = useSWR<Respuesta>(API, fetcher, { revalidateOnFocus: false });
  const [nivel, setNivel] = useState<string | null>(null);
  const [porBorrar, setPorBorrar] = useState<DocumentoRequerido | null>(null);
  const [sembrando, setSembrando] = useState(false);

  const documentos = useMemo(() => data?.documentos ?? [], [data]);
  const niveles = data?.niveles ?? [];

  // El nivel elegido, o el primero que exista. Se resuelve al vuelo en vez de
  // con un efecto: así no hay un parpadeo con la lista de otro nivel.
  const nivelActivo = nivel ?? niveles[0] ?? null;

  const delNivel = useMemo(
    () => documentos.filter((d) => d.activo && (d.nivel == null || d.nivel === nivelActivo)),
    [documentos, nivelActivo],
  );

  async function sembrar() {
    setSembrando(true);
    try {
      const res = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sembrar: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo');
      await mutate();
      toast.success(json.creados === 0
        ? 'Ya estaban todos: no se creó nada.'
        : `${json.creados} documento(s) añadidos.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo');
    } finally { setSembrando(false); }
  }

  async function borrar() {
    if (!porBorrar) return;
    try {
      const res = await fetch(`${API}/${porBorrar.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo borrar');
      await mutate();
      // El servidor decide si borra o desactiva; el aviso viene de él porque es
      // quien sabe en cuántas matrículas se entregó ya.
      toast.success(json.aviso ?? 'Documento borrado.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar');
    } finally { setPorBorrar(null); }
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-zero-600" /></div>;
  }

  if (niveles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
        <FileCheck className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="font-medium text-gray-600">Primero hace falta la estructura</p>
        <p className="mt-1 text-sm text-gray-400">
          Los documentos se piden por nivel, y todavía no hay ningún servicio creado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {niveles.map((n) => (
            <button key={n} type="button" onClick={() => setNivel(n)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                n === nivelActivo
                  ? 'bg-zero-600 text-white'
                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {n}
            </button>
          ))}
        </div>
        {documentos.length === 0 && (
          <Button variant="outline" size="sm" onClick={sembrar} disabled={sembrando}>
            {sembrando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Cargar las listas del colegio
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {COLUMNAS.map((col) => (
          <Columna
            key={col.tipo}
            titulo={col.titulo}
            ayuda={col.ayuda}
            tipo={col.tipo}
            nivel={nivelActivo}
            documentos={delNivel.filter((d) => d.tipoInscripcion === col.tipo)}
            onCambio={mutate}
            onBorrar={setPorBorrar}
          />
        ))}
      </div>

      <ConfirmDialog
        open={porBorrar !== null}
        onOpenChange={(o) => { if (!o) setPorBorrar(null); }}
        title="Quitar documento"
        description={porBorrar
          ? `«${porBorrar.nombre}» deja de pedirse. Si ya se entregó en alguna matrícula no se borra: se desactiva, y lo escaneado se conserva.`
          : ''}
        confirmLabel="Quitar"
        destructive
        onConfirm={borrar}
      />
    </div>
  );
}

function Columna({ titulo, ayuda, tipo, nivel, documentos, onCambio, onBorrar }: {
  titulo: string; ayuda: string;
  tipo: 'nuevo' | 'reinscripcion';
  nivel: string | null;
  documentos: DocumentoRequerido[];
  onCambio: () => void;
  onBorrar: (d: DocumentoRequerido) => void;
}) {
  const [nuevo, setNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const requeridos = documentos.filter((d) => d.exigencia === 'requerido').length;

  async function agregar() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    setGuardando(true);
    try {
      const res = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, nivel, tipoInscripcion: tipo, exigencia: 'requerido' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo añadir');
      setNuevo('');
      onCambio();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo añadir');
    } finally { setGuardando(false); }
  }

  async function cambiar(id: number, parche: Record<string, unknown>) {
    try {
      const res = await fetch(`${API}/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parche),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo guardar');
      onCambio();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
          <p className="text-xs text-gray-400">{ayuda}</p>
        </div>
        <span className="shrink-0 text-xs text-gray-500">
          {documentos.length === 0 ? '—' : `${documentos.length} · ${requeridos} requeridos`}
        </span>
      </div>

      {/* Una lista vacía tiene que gritar, no esconderse: un nivel sin
          documentos deja matricular sin pedir un solo papel. */}
      {documentos.length === 0 ? (
        <div className="flex items-start gap-2.5 border-b border-gray-100 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs text-amber-900">
            Sin documentos. Ahora mismo se puede matricular aquí sin entregar nada.
          </p>
        </div>
      ) : (
        <ul>
          {documentos.map((d) => (
            <li key={d.id}
              className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50/60">
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300" />

              <span className="min-w-0 flex-1 truncate text-sm text-gray-900" title={d.nombre}>
                {d.nombre}
              </span>

              {/* Los controles van dentro de cajas de ancho fijo: `Input` lleva
                  `fullWidth` de MUI, que gana a cualquier `w-*` de Tailwind y
                  hacía que el campo se estirara hasta dejar el nombre sin
                  sitio —la fila salía sin nombre—. Envuelto, `fullWidth` llena
                  la caja en vez de la fila. */}
              <div className="w-16 shrink-0">
                <Input type="number" min={1} max={20} value={d.cantidad}
                  aria-label={`Cantidad de ${d.nombre}`}
                  onChange={(e) => cambiar(d.id, { cantidad: Number(e.target.value) || 1 })}
                  className="text-center text-xs" />
              </div>

              <div className="w-32 shrink-0">
                <NativeSelect value={d.exigencia} aria-label={`Exigencia de ${d.nombre}`}
                  onChange={(e) => cambiar(d.id, { exigencia: e.target.value })}
                  className="text-xs">
                  <option value="requerido">Requerido</option>
                  <option value="si_aplica">Si aplica</option>
                </NativeSelect>
              </div>

              <button type="button" aria-label={`Quitar ${d.nombre}`} title="Quitar"
                onClick={() => onBorrar(d)}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 border-t border-gray-100 p-3">
        <Input placeholder="Añadir documento…" value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void agregar(); } }}
          className="h-9 flex-1 text-sm" />
        <Button size="sm" variant="outline" onClick={() => void agregar()}
          disabled={guardando || !nuevo.trim()} className="shrink-0">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

/** Etiqueta suelta, por si hace falta fuera de la lista. */
export function ExigenciaBadge({ exigencia }: { exigencia: 'requerido' | 'si_aplica' }) {
  return exigencia === 'requerido'
    ? <span className="rounded bg-zero-50 px-1.5 py-0.5 text-[11px] font-medium text-zero-700">Requerido</span>
    : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">Si aplica</span>;
}

export { Label };
