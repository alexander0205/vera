'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Plus, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConceptoDetalle, leerDias, type Concepto } from './ConceptoDetalle';

/**
 * El catálogo de conceptos: qué cobra el colegio y con qué ritmo.
 *
 * Está separado de la pantalla de tarifas a propósito. Definir un concepto
 * —cómo se llama, si es mensual, cuándo vence, cuándo se avisa— se hace una
 * vez al montar el colegio; ponerle precio a cada grado se repite cada año al
 * subir la colegiatura. Mezclarlas obligaba a atravesar el árbol de grados
 * para cambiar un nombre.
 *
 * El ciclo de cobro vive en el concepto y no en un ajuste único del colegio
 * porque no todo se cobra igual: la colegiatura puede vencer el día 5 y el
 * transporte el 10, y un solo número no puede decir eso.
 */

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function ConceptosCatalogo() {
  const { data, isLoading, mutate } = useSWR<{ conceptos: Concepto[] }>(
    '/api/administracion-escolar/conceptos', fetcher,
  );
  const conceptos = useMemo(() => data?.conceptos ?? [], [data]);

  const [selId, setSelId] = useState<number | null>(null);
  const [borrador, setBorrador] = useState<Concepto | null>(null);
  const [diasTexto, setDiasTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [creando, setCreando] = useState(false);

  // Al abrir, el primero de la lista: una pantalla de detalle vacía no dice
  // nada sobre lo que hay dentro.
  useEffect(() => {
    if (selId == null && conceptos.length > 0) setSelId(conceptos[0].id);
  }, [conceptos, selId]);

  const seleccionado = conceptos.find((c) => c.id === selId) ?? null;

  useEffect(() => {
    setBorrador(seleccionado ? { ...seleccionado } : null);
    setDiasTexto((seleccionado?.avisoVencidoDias ?? []).join(', '));
    setError(null);
  }, [seleccionado]);

  async function guardar() {
    if (!borrador) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/administracion-escolar/conceptos/${borrador.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...borrador, avisoVencidoDias: leerDias(diasTexto) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar');
      await mutate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function crear() {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setCreando(true);
    try {
      const res = await fetch('/api/administracion-escolar/conceptos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, tipo: 'otro', recurrente: false }),
      });
      const json = await res.json();
      if (res.ok && json.concepto) {
        setNuevoNombre('');
        await mutate();
        setSelId(json.concepto.id);
      }
    } finally {
      setCreando(false);
    }
  }

  async function borrar(c: Concepto) {
    if (!confirm(`¿Eliminar el concepto "${c.nombre}"?`)) return;
    const res = await fetch(`/api/administracion-escolar/conceptos/${c.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'No se pudo eliminar');
      return;
    }
    if (selId === c.id) setSelId(null);
    await mutate();
  }

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />Cargando conceptos…
      </p>
    );
  }

  const mensual = borrador?.tipo === 'mensualidad' || borrador?.recurrente;

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">

      {/* ── Lista ──────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <p className="border-b border-gray-100 px-3 py-2 text-xs font-medium text-gray-500">
          Conceptos
        </p>
        {conceptos.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-500">Todavía no hay ninguno.</p>
        ) : conceptos.map((c) => (
          <button key={c.id} type="button" onClick={() => setSelId(c.id)}
            className={`flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-sm transition-colors ${
              c.id === selId
                ? 'border-zero-600 bg-zero-50 text-zero-800'
                : 'border-transparent text-gray-700 hover:bg-gray-50'
            }`}>
            <span className={`min-w-0 flex-1 truncate ${c.activo ? '' : 'text-gray-400 line-through'}`}>
              {c.nombre}
            </span>
            {c.recurrente && <Repeat className="h-3.5 w-3.5 shrink-0 opacity-60" aria-label="mensual" />}
          </button>
        ))}
        <div className="flex gap-1.5 border-t border-gray-100 p-2">
          <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void crear(); }}
            placeholder="Nuevo concepto" className="h-8 text-sm" />
          <Button size="sm" variant="outline" onClick={() => void crear()}
            disabled={creando || !nuevoNombre.trim()} className="h-8 shrink-0 px-2">
            {creando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {!borrador ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Elige un concepto para configurarlo.
        </div>
      ) : (
        <ConceptoDetalle
          borrador={borrador}
          setBorrador={setBorrador}
          diasTexto={diasTexto}
          setDiasTexto={setDiasTexto}
          guardando={guardando}
          error={error}
          onGuardar={() => void guardar()}
          onBorrar={() => void borrar(borrador)}
        />
      )}
    </div>
  );
}
