'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Package, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Configuración › Paquetes.
 *
 * Un paquete es una lista de conceptos con nombre. Al matricular (o en la
 * cuadrícula de servicios) se elige el paquete del niño en vez de marcar
 * concepto por concepto: «Horario regular» = avance + mensualidad; «Horario
 * extendido» = lo regular + horario extendido + almuerzo; «Registro SIGERD» =
 * solo su servicio. No lleva precios: cada concepto cobra su tarifa.
 */

export interface Paquete {
  id: number;
  nombre: string;
  descripcion: string | null;
  conceptosIds: number[];
  orden: number;
}

interface ConceptoMin { id: number; nombre: string; activo: boolean; opcional?: boolean; categoria?: string | null }

const traer = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error('No se pudo cargar'))));

export function PaquetesPanel() {
  const { data, mutate, isLoading } = useSWR<{ paquetes: Paquete[] }>('/api/administracion-escolar/paquetes', traer);
  const { data: dc } = useSWR<{ conceptos: ConceptoMin[] }>('/api/administracion-escolar/conceptos', traer);
  const conceptos = (dc?.conceptos ?? []).filter((c) => c.activo);
  const [editando, setEditando] = useState<Partial<Paquete> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombreDe = (id: number) => conceptos.find((c) => c.id === id)?.nombre ?? `#${id}`;

  async function guardar() {
    if (!editando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch('/api/administracion-escolar/paquetes', {
        method: editando.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar.');
      setEditando(null);
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(p: Paquete) {
    if (!confirm(`¿Quitar el paquete «${p.nombre}»? Los niños que ya lo tienen conservan sus conceptos.`)) return;
    await fetch(`/api/administracion-escolar/paquetes?id=${p.id}`, { method: 'DELETE' });
    await mutate();
  }

  const alternar = (id: number) => setEditando((e) => {
    if (!e) return e;
    const ids = new Set(e.conceptosIds ?? []);
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    return { ...e, conceptosIds: [...ids] };
  });

  if (isLoading) {
    return <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</p>;
  }

  const paquetes = data?.paquetes ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div className="min-w-0 max-w-2xl">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-900"><Package className="h-4 w-4 text-zero-600" />Paquetes de conceptos</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Un grupo de conceptos con nombre para matricular o asignar de un clic. Por ejemplo, «Horario regular»
            con avance y mensualidad, u «Horario extendido» con lo regular más horario extendido y almuerzo.
            No lleva precios: cada concepto cobra su tarifa.
          </p>
        </div>
        <Button size="sm" className="bg-zero-600 hover:bg-zero-700" onClick={() => setEditando({ nombre: '', conceptosIds: [] })}>
          <Plus className="mr-1 h-4 w-4" />Nuevo paquete
        </Button>
      </div>

      {editando && (
        <div className="space-y-3 rounded-xl border border-zero-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Nombre</span>
              <Input autoFocus value={editando.nombre ?? ''} maxLength={80} placeholder="Ej.: Horario extendido"
                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Descripción (opcional)</span>
              <Input value={editando.descripcion ?? ''} maxLength={200} placeholder="Para quién es"
                onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} />
            </label>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-600">Conceptos del paquete</p>
            <div className="flex flex-wrap gap-1.5">
              {conceptos.map((c) => {
                const on = (editando.conceptosIds ?? []).includes(c.id);
                return (
                  <button key={c.id} type="button" onClick={() => alternar(c.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on
                      ? 'border-zero-500 bg-zero-50 font-medium text-zero-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {on ? '✓ ' : ''}{c.nombre}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditando(null); setError(null); }}>Cancelar</Button>
            <Button size="sm" className="bg-zero-600 hover:bg-zero-700" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Guardar paquete
            </Button>
          </div>
        </div>
      )}

      {paquetes.length === 0 && !editando ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
          Todavía no hay paquetes. Crea el primero con «Nuevo paquete».
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 font-medium">Paquete</th>
                <th className="px-4 py-2 font-medium">Conceptos</th>
                <th className="w-24 px-4 py-2" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {paquetes.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 align-top last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="block font-medium text-gray-900">{p.nombre}</span>
                    {p.descripcion && <span className="block text-xs text-gray-500">{p.descripcion}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.conceptosIds.map((id) => (
                        <span key={id} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{nombreDe(id)}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditando(p)}>Editar</Button>
                      <button type="button" aria-label={`Quitar ${p.nombre}`} onClick={() => void borrar(p)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
