'use client';

import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import { RETENCIONES_PREDEFINIDAS } from '../utils/types';
import type { Retencion } from '../utils/types';

interface Props {
  retenciones: Retencion[];
  setRetenciones: React.Dispatch<React.SetStateAction<Retencion[]>>;
  totalesItbis: number;
  totalesSubtotal: number;
}

export function RetencionesSection({
  retenciones, setRetenciones, totalesItbis, totalesSubtotal,
}: Props) {
  function addRetencion() {
    const predef = RETENCIONES_PREDEFINIDAS[0];
    const base2  = predef.tipo === 'itbis' ? totalesItbis : totalesSubtotal;
    setRetenciones(prev => [...prev, {
      id: predef.id, nombre: predef.nombre, porcentaje: predef.porcentaje,
      tipo: predef.tipo, monto: parseFloat((base2 * predef.porcentaje / 100).toFixed(2)), manual: false,
    }]);
  }

  if (retenciones.length === 0) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            const predef = RETENCIONES_PREDEFINIDAS[0];
            const base2  = predef.tipo === 'itbis' ? totalesItbis : totalesSubtotal;
            setRetenciones([{
              id: predef.id, nombre: predef.nombre, porcentaje: predef.porcentaje,
              tipo: predef.tipo, monto: parseFloat((base2 * predef.porcentaje / 100).toFixed(2)), manual: false,
            }]);
          }}
          className="text-sm text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1 py-2 -my-2">
          + Agregar Retención
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-50/40 rounded-lg p-3 mt-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Retenciones</p>
      <div className="space-y-3 md:space-y-2">
        {retenciones.map((ret, idx) => (
          <div key={idx} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
            <span className="text-xs md:text-sm text-gray-600 md:w-24 md:shrink-0 uppercase tracking-wide md:tracking-normal md:normal-case">Retención</span>
            <div className="flex items-center gap-2 md:contents">
              <Select
                value={`${ret.id}__${idx}`}
                onValueChange={(val) => {
                  const predef = RETENCIONES_PREDEFINIDAS.find(r => r.id === val.split('__')[0]);
                  if (!predef) return;
                  const base2 = predef.tipo === 'itbis' ? totalesItbis : totalesSubtotal;
                  setRetenciones(prev => prev.map((r, i) => i === idx ? {
                    ...r,
                    id: predef.id,
                    nombre: predef.nombre,
                    porcentaje: predef.porcentaje,
                    tipo: predef.tipo,
                    monto: parseFloat((base2 * predef.porcentaje / 100).toFixed(2)),
                    manual: false,
                  } : r));
                }}
              >
                <SelectTrigger className="h-10 md:h-9 text-sm flex-1 md:max-w-xs">
                  <SelectValue placeholder="Seleccionar retención..." />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs font-semibold text-gray-600 uppercase">ITBIS</div>
                  {RETENCIONES_PREDEFINIDAS.filter(r => r.tipo === 'itbis').map(r => (
                    <SelectItem key={r.id} value={`${r.id}__${idx}`}>
                      {r.nombre} — {r.porcentaje}% <span className="text-xs text-gray-600 ml-1">({r.descripcion})</span>
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1 text-xs font-semibold text-gray-600 uppercase border-t mt-1">ISR</div>
                  {RETENCIONES_PREDEFINIDAS.filter(r => r.tipo === 'isr').map(r => (
                    <SelectItem key={r.id} value={`${r.id}__${idx}`}>
                      {r.nombre} — {r.porcentaje}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-32 md:w-36 shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-600">RD$</span>
                <Input
                  type="number" inputMode="decimal" min={0} step={0.01}
                  className="h-10 md:h-9 text-sm pl-9 text-right"
                  placeholder="0.00"
                  value={ret.monto || ''}
                  onChange={(e) => setRetenciones(prev => prev.map((r, i) => i === idx ? { ...r, monto: parseFloat(e.target.value) || 0, manual: true } : r))}
                />
              </div>
              <button
                type="button"
                onClick={() => setRetenciones(prev => prev.filter((_, i) => i !== idx))}
                aria-label="Eliminar retención"
                className="text-gray-400 hover:text-red-500 p-2 -m-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRetencion}
        className="mt-2 text-sm text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1 py-2 -my-1">
        + Agregar Retención
      </button>
    </div>
  );
}
