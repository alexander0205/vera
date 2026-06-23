'use client';

/**
 * Sección "Atributos" del formulario de producto. Carga los maestros del equipo
 * aplicables al producto (auto por tipo + manuales agregados) y guarda las
 * asignaciones de inmediato vía PUT /api/productos/[id]/maestros.
 *
 * Aislado a propósito: se monta solo en modo edición (el producto ya existe).
 * Tras fusionar la rama inventario, su hogar natural es /dashboard/productos/[id].
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Check } from 'lucide-react';

interface Valor { id: number; valor: string; }
interface Maestro {
  id: number;
  nombre: string;
  aplicaA: 'bien' | 'servicio' | 'ambos' | 'manual';
  multiple: boolean;
  auto: boolean;
  valores: Valor[];
}
interface Asignacion { maestroId: number; valorId: number; }

const NONE = '__none__';

export default function MaestrosProductoSection({ productId }: { productId: number }) {
  const [maestros, setMaestros]   = useState<Maestro[]>([]);
  const [sel, setSel]             = useState<Map<number, Set<number>>>(new Map());
  const [extra, setExtra]         = useState<Set<number>>(new Set()); // manuales agregados manualmente
  const [loading, setLoading]     = useState(true);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/productos/${productId}/maestros`);
      const data = await res.json();
      const ms: Maestro[] = data.maestros ?? [];
      const asg: Asignacion[] = data.asignaciones ?? [];
      const map = new Map<number, Set<number>>();
      for (const a of asg) {
        if (!map.has(a.maestroId)) map.set(a.maestroId, new Set());
        map.get(a.maestroId)!.add(a.valorId);
      }
      setMaestros(ms);
      setSel(map);
      // Manuales con asignación previa quedan visibles
      setExtra(new Set(ms.filter(m => !m.auto && map.has(m.id)).map(m => m.id)));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = useCallback(async (map: Map<number, Set<number>>) => {
    setSavingState('saving');
    const asignaciones: Asignacion[] = [];
    for (const [maestroId, set] of map) {
      for (const valorId of set) asignaciones.push({ maestroId, valorId });
    }
    try {
      const res = await fetch(`/api/productos/${productId}/maestros`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asignaciones }),
      });
      setSavingState(res.ok ? 'saved' : 'error');
      if (res.ok) setTimeout(() => setSavingState('idle'), 1500);
    } catch {
      setSavingState('error');
    }
  }, [productId]);

  function setSingle(maestroId: number, valorId: number | null) {
    setSel((prev) => {
      const next = new Map(prev);
      if (valorId == null) next.delete(maestroId);
      else next.set(maestroId, new Set([valorId]));
      guardar(next);
      return next;
    });
  }

  function toggleMulti(maestroId: number, valorId: number) {
    setSel((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(maestroId) ?? []);
      if (set.has(valorId)) set.delete(valorId);
      else set.add(valorId);
      if (set.size) next.set(maestroId, set);
      else next.delete(maestroId);
      guardar(next);
      return next;
    });
  }

  const visibles = useMemo(
    () => maestros.filter(m => m.auto || extra.has(m.id)),
    [maestros, extra],
  );
  const agregables = useMemo(
    () => maestros.filter(m => !m.auto && !extra.has(m.id)),
    [maestros, extra],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando atributos…
      </div>
    );
  }

  if (maestros.length === 0) return null;

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <Label>Atributos</Label>
        {savingState === 'saving' && <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Guardando…</span>}
        {savingState === 'saved'  && <span className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3 w-3" />Guardado</span>}
        {savingState === 'error'  && <span className="text-xs text-red-600">Error al guardar</span>}
      </div>

      {visibles.length === 0 && (
        <p className="text-xs text-gray-400">No hay atributos aplicables. Agrega uno manual abajo.</p>
      )}

      {visibles.map((m) => {
        const set = sel.get(m.id) ?? new Set<number>();
        return (
          <div key={m.id} className="space-y-1.5">
            <Label className="text-xs text-gray-500">{m.nombre}</Label>
            {m.multiple ? (
              m.valores.length === 0 ? (
                <p className="text-xs text-gray-300">Sin valores definidos en este maestro.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {m.valores.map((v) => {
                    const on = set.has(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => toggleMulti(m.id, v.id)}
                        className={`text-sm rounded-full px-3 py-1 border transition ${
                          on ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'
                        }`}
                      >
                        {v.valor}
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              <Select
                value={set.size ? String([...set][0]) : NONE}
                onValueChange={(val) => setSingle(m.id, val === NONE ? null : parseInt(val))}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Ninguno —</SelectItem>
                  {m.valores.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.valor}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        );
      })}

      {agregables.length > 0 && (
        <div className="pt-1">
          <Select value="" onValueChange={(v) => setExtra((p) => new Set(p).add(parseInt(v)))}>
            <SelectTrigger className="w-auto gap-2 text-teal-700 border-dashed">
              <Plus className="h-4 w-4" />
              <SelectValue placeholder="Agregar atributo" />
            </SelectTrigger>
            <SelectContent>
              {agregables.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
