'use client';

/**
 * Plan A — Clasificación de la factura con maestros target='factura'.
 * Controlado por el padre (value/onChange) porque la persistencia ocurre
 * después de guardar la factura (cuando ya hay documentoId).
 *
 * - Catálogo: GET /api/facturas/maestros (no depende de doc).
 * - Si editás un borrador (docId), precarga las asignaciones existentes.
 * Devuelve null si el equipo no tiene maestros de factura.
 */

import { useState, useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tags } from 'lucide-react';

interface Valor { id: number; valor: string; }
interface Maestro { id: number; nombre: string; multiple: boolean; valores: Valor[]; }
export interface ClasifAsig { maestroId: number; valorId: number; }

const NONE = '__none__';

export function ClasificacionFactura({
  docId, value, onChange,
}: {
  docId?: number;
  value: ClasifAsig[];
  onChange: (a: ClasifAsig[]) => void;
}) {
  const [maestros, setMaestros] = useState<Maestro[]>([]);
  const [loaded, setLoaded]     = useState(false);
  const preloadedRef = useRef(false);

  // Catálogo de maestros de factura
  useEffect(() => {
    fetch('/api/facturas/maestros')
      .then(r => r.json())
      .then(d => setMaestros(d.maestros ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Precarga de asignaciones al editar un borrador
  useEffect(() => {
    if (!docId || preloadedRef.current) return;
    preloadedRef.current = true;
    fetch(`/api/facturas/${docId}/maestros`)
      .then(r => r.json())
      .then(d => {
        const asg: ClasifAsig[] = d.asignaciones ?? [];
        if (asg.length) onChange(asg);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  if (!loaded || maestros.length === 0) return null;

  const valsOf = (mid: number) => value.filter(a => a.maestroId === mid).map(a => a.valorId);

  function setSingle(mid: number, valorId: number | null) {
    const rest = value.filter(a => a.maestroId !== mid);
    onChange(valorId == null ? rest : [...rest, { maestroId: mid, valorId }]);
  }
  function toggleMulti(mid: number, valorId: number) {
    const has = value.some(a => a.maestroId === mid && a.valorId === valorId);
    onChange(has
      ? value.filter(a => !(a.maestroId === mid && a.valorId === valorId))
      : [...value, { maestroId: mid, valorId }]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Tags className="h-4 w-4 text-gray-400" />
        <Label className="text-sm font-semibold text-gray-700">Clasificación</Label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {maestros.map((m) => {
          const sel = valsOf(m.id);
          return (
            <div key={m.id} className="space-y-1.5">
              <Label className="text-xs text-gray-500">{m.nombre}</Label>
              {m.multiple ? (
                m.valores.length === 0 ? (
                  <p className="text-xs text-gray-300">Sin valores definidos.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {m.valores.map((v) => {
                      const on = sel.includes(v.id);
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
                  value={sel.length ? String(sel[0]) : NONE}
                  onValueChange={(val) => setSingle(m.id, val === NONE ? null : parseInt(val))}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Ninguno —</SelectItem>
                    {m.valores.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.valor}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
