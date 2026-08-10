'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Check, ChevronDown, ChevronUp, Loader2, PackagePlus, Plus, X, Layers } from 'lucide-react';
import type { Producto } from '../utils/types';

const TASA_ITBIS_MODAL = [
  { value: 'exento', label: 'Ninguno (0%)' },
  { value: '0.18',   label: 'ITBIS - (18.00%)' },
  { value: '0.16',   label: 'ITBIS 16% - (16.00%)' },
  { value: '0',      label: 'ITBIS 0% - (0.00%)' },
];

const UNIDADES = ['Unidad', 'Servicio', 'Hora', 'Día', 'Mes', 'Kg', 'Lb', 'Metro', 'Litro', 'Caja', 'Docena'];

const TIPOS_ITEM: { value: string; label: string; disabled?: boolean }[] = [
  { value: 'servicio', label: 'Servicio' },
  { value: 'bien',     label: 'Producto' },
  { value: 'combo',    label: 'Combo', disabled: true },
];

// ─── Variantes ────────────────────────────────────────────────────────────────
// Eje = un atributo definido por el usuario (Talla, Color, Sabor…) con sus
// valores. Las combinaciones (producto cartesiano de los ejes) son las variantes.

interface Eje { nombre: string; valores: string[]; }

/** Producto cartesiano de los valores de cada eje → lista de combinaciones.
 *  Cada combinación es un arreglo de pares [ejeNombre, valor]. */
function combinaciones(ejes: Eje[]): [string, string][][] {
  const activos = ejes.filter(e => e.nombre.trim() && e.valores.length > 0);
  if (activos.length === 0) return [];
  return activos.reduce<[string, string][][]>(
    (acc, eje) =>
      acc.flatMap(combo => eje.valores.map(v => [...combo, [eje.nombre.trim(), v] as [string, string]])),
    [[]],
  );
}

/** Clave estable de una combinación, para indexar stock/precio. */
const comboKey = (combo: [string, string][]) => combo.map(([, v]) => v).join(' · ');

export function ModalNuevoProducto({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (p: Producto) => void;
}) {
  const [form, setForm]                 = useState({ nombre: '', precio: '', tasaItbis: 'exento', tipo: 'servicio', descripcion: '', unidad: 'Unidad', cantidadInicial: '' });
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [showAvanzado, setShowAvanzado] = useState(false);

  // Variantes
  const [variantesOn, setVariantesOn] = useState(false);
  const [ejes, setEjes]               = useState<Eje[]>([{ nombre: '', valores: [] }]);
  const [valorInput, setValorInput]   = useState<Record<number, string>>({});
  // Stock y precio (override) por combinación, indexado por comboKey.
  const [stockCombo, setStockCombo]   = useState<Record<string, string>>({});
  const [precioCombo, setPrecioCombo] = useState<Record<string, string>>({});

  const combos = useMemo(() => (variantesOn ? combinaciones(ejes) : []), [variantesOn, ejes]);
  const usaVariantes = form.tipo === 'bien' && variantesOn && combos.length > 0;

  function resetAll() {
    setForm({ nombre: '', precio: '', tasaItbis: 'exento', tipo: 'servicio', descripcion: '', unidad: 'Unidad', cantidadInicial: '' });
    setShowAvanzado(false);
    setVariantesOn(false);
    setEjes([{ nombre: '', valores: [] }]);
    setValorInput({});
    setStockCombo({});
    setPrecioCombo({});
  }

  // ── Manejo de ejes ──────────────────────────────────────────────────────────
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
    if (ejes.length >= 3) return; // MVP: hasta 3 ejes
    setEjes(prev => [...prev, { nombre: '', valores: [] }]);
  }
  function removeEje(idx: number) {
    setEjes(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }

    if (usaVariantes) {
      const ejesValidos = ejes.filter(e => e.nombre.trim() && e.valores.length > 0);
      if (ejesValidos.length === 0) { setError('Define al menos un eje de variante con sus valores'); return; }
    }

    setSaving(true); setError(null);
    try {
      const cantidadInicial = parseInt(form.cantidadInicial, 10);
      const tieneStockInicial =
        form.tipo === 'bien' && !usaVariantes && form.cantidadInicial.trim() !== '' && !isNaN(cantidadInicial);

      const payload: Record<string, unknown> = {
        nombre:       form.nombre,
        precio:       parseFloat(form.precio) || 0,
        tasaItbis:    form.tasaItbis,
        tipo:         form.tipo === 'bien' ? 'bien' : 'servicio',
        descripcion:  form.descripcion,
        unidadMedida: form.unidad,
        ...(tieneStockInicial && {
          controlaInventario: true,
          stockActual:        Math.max(0, cantidadInicial),
        }),
      };

      if (usaVariantes) {
        const ejesValidos = ejes.filter(e => e.nombre.trim() && e.valores.length > 0);
        payload.variantAtributos = ejesValidos.map(e => ({ nombre: e.nombre.trim(), valores: e.valores }));
        payload.variants = combos.map(combo => {
          const key = comboKey(combo);
          const stock = parseInt(stockCombo[key] ?? '', 10);
          const precioOverride = parseFloat(precioCombo[key] ?? '');
          return {
            atributos: Object.fromEntries(combo),
            nombre:    key,
            stockActual: isNaN(stock) ? 0 : Math.max(0, stock),
            ...(isNaN(precioOverride) ? {} : { precio: Math.max(0, precioOverride) }),
          };
        });
      }

      const res  = await fetch('/api/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated(data.producto);
      resetAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) { onClose(); setError(null); } }}>
      <DialogContent className={`${usaVariantes ? 'max-w-2xl' : 'max-w-lg'} w-[calc(100%-1rem)] sm:w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-teal-600" />Nuevo producto/servicio
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

          <div>
            <div className="flex gap-2">
              {TIPOS_ITEM.map((t) => {
                const isSelected = form.tipo === t.value;
                if (t.disabled) {
                  return (
                    <div key={t.value} title="Próximamente"
                      className="relative flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium cursor-not-allowed opacity-40 bg-white border-gray-200 text-gray-600 select-none">
                      {t.label}
                    </div>
                  );
                }
                return (
                  <button key={t.value} type="button"
                    onClick={() => setForm((f) => ({ ...f, tipo: t.value }))}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-teal-100 border-teal-300 text-teal-800'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Ten en cuenta que, una vez creado, no podrás cambiar el tipo del artículo.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input placeholder={form.tipo === 'bien' ? 'Ej. Camisa polo' : 'Ej. Diseño de logo'}
              value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Precio (DOP) <span className="text-red-500">*</span></Label>
              <Input type="number" min={0} step={0.01} placeholder="0.00"
                value={form.precio} onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))} />
              {usaVariantes && <p className="text-[11px] text-gray-400">Precio base; cada variante puede sobreescribirlo.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Impuesto (ITBIS)</Label>
              <Select value={form.tasaItbis} onValueChange={(v) => setForm((f) => ({ ...f, tasaItbis: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASA_ITBIS_MODAL.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Unidad de medida</Label>
            <Select value={form.unidad} onValueChange={(v) => setForm((f) => ({ ...f, unidad: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Cantidad inicial — solo si es bien SIN variantes (con variantes el stock va por variante) */}
          {form.tipo === 'bien' && !variantesOn && (
            <div className="space-y-1.5">
              <Label>Cantidad inicial en inventario</Label>
              <Input type="number" min={0} step={1} placeholder="0"
                value={form.cantidadInicial} onChange={(e) => setForm((f) => ({ ...f, cantidadInicial: e.target.value }))} />
            </div>
          )}

          {/* Variantes — solo para bienes */}
          {form.tipo === 'bien' && (
            <div className="rounded-lg border border-gray-200 p-4 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" className="h-4 w-4 accent-teal-600"
                  checked={variantesOn} onChange={(e) => setVariantesOn(e.target.checked)} />
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  <Layers className="h-4 w-4 text-teal-600" />
                  Este producto tiene variantes (tallas, colores…)
                </span>
              </label>

              {variantesOn && (
                <div className="space-y-4 pt-1">
                  {/* Ejes */}
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

                        {/* Chips de valores */}
                        {eje.valores.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {eje.valores.map(v => (
                              <span key={v} className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 text-xs font-medium px-2 py-1 rounded-full">
                                {v}
                                <button type="button" onClick={() => removeValor(idx, v)} className="hover:text-teal-950">
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
                        className="flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900 font-medium">
                        <Plus className="h-4 w-4" /> Agregar otro eje
                      </button>
                    )}
                  </div>

                  {/* Combinaciones generadas */}
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
          )}

          <div>
            <button type="button"
              onClick={() => setShowAvanzado((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900 font-medium">
              {showAvanzado ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Mostrar formulario avanzado
            </button>
            {showAvanzado && (
              <div className="mt-3 space-y-3 border border-dashed border-gray-200 rounded-lg p-4">
                <div className="space-y-1.5">
                  <Label>Descripción</Label>
                  <Input placeholder="Descripción opcional que aparecerá en la factura"
                    value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setError(null); }} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear ítem'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
