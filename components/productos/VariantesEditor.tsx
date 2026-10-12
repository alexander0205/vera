'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Layers, Plus, X } from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Eje { nombre: string; valores: string[]; }

export interface VariantesPayload {
  /** true cuando hay variantes válidas listas para enviar. */
  activo: boolean;
  variantAtributos: { nombre: string; valores: string[] }[];
  variants: {
    atributos: Record<string, string>;
    nombre: string;
    stockActual: number;
    precio?: number;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Producto cartesiano de los valores de cada eje → lista de combinaciones. */
function combinaciones(ejes: Eje[]): [string, string][][] {
  const activos = ejes.filter(e => e.nombre.trim() && e.valores.length > 0);
  if (activos.length === 0) return [];
  return activos.reduce<[string, string][][]>(
    (acc, eje) =>
      acc.flatMap(combo => eje.valores.map(v => [...combo, [eje.nombre.trim(), v] as [string, string]])),
    [[]],
  );
}

const comboKey = (combo: [string, string][]) => combo.map(([, v]) => v).join(' · ');

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Editor de variantes de producto (ejes → combinaciones con stock/precio).
 * Compartido por el modal de "Nueva factura" y el popup de "Productos y
 * servicios" para no duplicar la lógica. Emite el payload por `onChange`; el
 * padre lo incluye en el POST a /api/productos. `resetSignal` limpia el estado
 * (incrementa un contador tras guardar).
 */
export function VariantesEditor({ onChange, resetSignal = 0 }: {
  onChange: (p: VariantesPayload) => void;
  resetSignal?: number;
}) {
  const [variantesOn, setVariantesOn] = useState(false);
  const [ejes, setEjes]               = useState<Eje[]>([{ nombre: '', valores: [] }]);
  const [valorInput, setValorInput]   = useState<Record<number, string>>({});
  const [stockCombo, setStockCombo]   = useState<Record<string, string>>({});
  const [precioCombo, setPrecioCombo] = useState<Record<string, string>>({});

  const combos = useMemo(() => (variantesOn ? combinaciones(ejes) : []), [variantesOn, ejes]);

  // Reset externo (tras guardar en el padre).
  useEffect(() => {
    if (resetSignal === 0) return;
    setVariantesOn(false);
    setEjes([{ nombre: '', valores: [] }]);
    setValorInput({});
    setStockCombo({});
    setPrecioCombo({});
  }, [resetSignal]);

  // Emitir el payload al padre cuando cambie algo relevante.
  useEffect(() => {
    const activo = variantesOn && combos.length > 0;
    const ejesValidos = ejes.filter(e => e.nombre.trim() && e.valores.length > 0);
    onChange({
      activo,
      variantAtributos: activo ? ejesValidos.map(e => ({ nombre: e.nombre.trim(), valores: e.valores })) : [],
      variants: activo
        ? combos.map(combo => {
            const key = comboKey(combo);
            const stock = parseInt(stockCombo[key] ?? '', 10);
            const precio = parseFloat(precioCombo[key] ?? '');
            return {
              atributos: Object.fromEntries(combo),
              nombre: key,
              stockActual: isNaN(stock) ? 0 : Math.max(0, stock),
              ...(isNaN(precio) ? {} : { precio: Math.max(0, precio) }),
            };
          })
        : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantesOn, ejes, stockCombo, precioCombo, combos]);

  function setEjeNombre(idx: number, nombre: string) {
    setEjes(prev => prev.map((e, i) => (i === idx ? { ...e, nombre } : e)));
  }
  function addValor(idx: number) {
    const raw = (valorInput[idx] ?? '').trim();
    if (!raw) return;
    setEjes(prev => prev.map((e, i) => (i === idx && !e.valores.includes(raw) ? { ...e, valores: [...e.valores, raw] } : e)));
    setValorInput(prev => ({ ...prev, [idx]: '' }));
  }
  function removeValor(idx: number, valor: string) {
    setEjes(prev => prev.map((e, i) => (i === idx ? { ...e, valores: e.valores.filter(v => v !== valor) } : e)));
  }
  function addEje() {
    if (ejes.length >= 3) return;
    setEjes(prev => [...prev, { nombre: '', valores: [] }]);
  }
  function removeEje(idx: number) {
    setEjes(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input type="checkbox" className="h-4 w-4 accent-zero-600"
          checked={variantesOn} onChange={(e) => setVariantesOn(e.target.checked)} />
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
          <Layers className="h-4 w-4 text-zero-600" />
          Este producto tiene variantes (tallas, colores…)
        </span>
      </label>

      {variantesOn && (
        <div className="space-y-4 pt-1">
          <div className="space-y-3">
            {ejes.map((eje, idx) => (
              <div key={idx} className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    className="bg-white"
                    placeholder="Nombre del eje (ej. Talla)"
                    value={eje.nombre}
                    onChange={(e) => setEjeNombre(idx, e.target.value)}
                  />
                  {ejes.length > 1 && (
                    <button type="button" onClick={() => removeEje(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Quitar eje">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {eje.valores.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {eje.valores.map(v => (
                      <span key={v} className="inline-flex items-center gap-1 bg-zero-100 text-zero-800 text-xs font-medium px-2 py-1 rounded-full">
                        {v}
                        <button type="button" onClick={() => removeValor(idx, v)} className="hover:text-zero-950">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Input
                    className="bg-white"
                    placeholder="Agregar valor (ej. M) y Enter"
                    value={valorInput[idx] ?? ''}
                    onChange={(e) => setValorInput(prev => ({ ...prev, [idx]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addValor(idx); } }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => addValor(idx)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {ejes.length < 3 && (
              <button type="button" onClick={addEje}
                className="flex items-center gap-1.5 text-sm text-zero-700 hover:text-zero-900 font-medium">
                <Plus className="h-4 w-4" /> Agregar otro eje
              </button>
            )}
          </div>

          {combos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {combos.length} {combos.length === 1 ? 'variante' : 'variantes'}
              </p>
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                <div className="grid grid-cols-[1fr_5rem_6rem] gap-2 px-3 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase">
                  <span>Variante</span>
                  <span className="text-right">Stock</span>
                  <span className="text-right">Precio</span>
                </div>
                {combos.map(combo => {
                  const key = comboKey(combo);
                  return (
                    <div key={key} className="grid grid-cols-[1fr_5rem_6rem] gap-2 px-3 py-2 items-center">
                      <span className="text-sm text-gray-800">{key}</span>
                      <Input
                        type="number" min={0} step={1} placeholder="0"
                        className="h-8 text-right"
                        value={stockCombo[key] ?? ''}
                        onChange={(e) => setStockCombo(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                      <Input
                        type="number" min={0} step={0.01} placeholder="base"
                        className="h-8 text-right"
                        value={precioCombo[key] ?? ''}
                        onChange={(e) => setPrecioCombo(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400">Precio vacío = usa el precio base del producto.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
