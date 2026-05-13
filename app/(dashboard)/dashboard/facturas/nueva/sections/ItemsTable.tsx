'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Info, X } from 'lucide-react';
import { useProximamenteDialog } from '@/components/proximamente-dialog';
import type { TipoEcfRegla } from '@/lib/ecf/types';
import { Tooltip } from '@/components/ui/tooltip';
import { Autocomplete } from '../components/Autocomplete';
import { calcularMontoItem } from '../utils/calculos';
import { TASA_ITBIS } from '../utils/types';
import type { ItemLinea, Producto } from '../utils/types';

interface Props {
  items: ItemLinea[];
  regla: TipoEcfRegla | undefined;
  buscarProductos: (q: string) => Promise<Producto[]>;
  onSelectProducto: (idx: number, p: Producto) => void;
  onAddItem: () => void;
  onRemoveItem: (id: number) => void;
  onUpdateItem: (id: number, field: keyof ItemLinea, value: string | number) => void;
  onOpenNuevoProducto: (idx: number) => void;
  /** Estado lifted al padre — controla visibilidad de columnas Referencia/Descripción */
  showReferencia: boolean;
  showDescripcion: boolean;
}

function readColsPref(): { referencia: boolean; descripcion: boolean } {
  if (typeof window === 'undefined') return { referencia: false, descripcion: false };
  try {
    const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
    const cols = prefs.itemsCols ?? {};
    return {
      referencia:  Boolean(cols.referencia),
      descripcion: Boolean(cols.descripcion),
    };
  } catch { return { referencia: false, descripcion: false }; }
}

function writeColsPref(cols: { referencia: boolean; descripcion: boolean }) {
  try {
    const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
    prefs.itemsCols = cols;
    localStorage.setItem('emitedo:facturaOpciones', JSON.stringify(prefs));
  } catch {}
}

export function ItemsTable({
  items, regla, buscarProductos, onSelectProducto,
  onAddItem, onRemoveItem, onUpdateItem, onOpenNuevoProducto,
  showReferencia, showDescripcion,
}: Props) {
  const { openProximamente, dialog } = useProximamenteDialog();
  return (
    <div>
      {/* ───────── MOBILE: card list (< md) ───────── */}
      <div className="md:hidden divide-y divide-gray-100 -mx-4 md:-mx-5">
        {items.map((item, idx) => (
          <div key={item.id} className="p-4 space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Línea {idx + 1}
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.id)}
                  aria-label={`Eliminar línea ${idx + 1}`}
                  className="text-gray-400 hover:text-red-500 p-2 -m-2 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <div>
              <Label className="text-xs text-gray-600 uppercase tracking-wide mb-1 block">
                Producto / servicio
              </Label>
              <Autocomplete<Producto>
                placeholder="Buscar producto o servicio..."
                value={item.nombreItem}
                onSearch={buscarProductos}
                onSelect={(p) => onSelectProducto(idx, p)}
                onClear={() => onUpdateItem(item.id, 'nombreItem', '')}
                onCreate={() => onOpenNuevoProducto(idx)}
                createLabel="Nuevo producto"
                renderOption={(p) => (
                  <div>
                    <p className="font-medium">{p.nombre}</p>
                    <p className="text-xs text-gray-600">
                      DOP {p.precioDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })} · {p.tasaItbis === 'exento' ? 'Exento' : `ITBIS ${parseFloat(p.tasaItbis) * 100}%`}
                    </p>
                  </div>
                )}
              />
            </div>

            {showReferencia && (
              <div>
                <Label className="text-xs text-gray-600 uppercase tracking-wide mb-1 block">
                  Referencia
                </Label>
                <Input
                  className="h-11 text-sm"
                  placeholder="Ref."
                  value={item.referencia}
                  onChange={(e) => onUpdateItem(item.id, 'referencia', e.target.value)}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600 uppercase tracking-wide mb-1 block">
                  Precio
                </Label>
                <Input
                  type="number" inputMode="decimal" min={0} step={0.01}
                  value={item.precioUnitarioItem || ''}
                  placeholder="0.00"
                  onChange={(e) => onUpdateItem(item.id, 'precioUnitarioItem', parseFloat(e.target.value) || 0)}
                  className="h-11 text-sm text-right"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600 uppercase tracking-wide mb-1 block">
                  Cantidad
                </Label>
                <Input
                  type="number" inputMode="decimal" min={0.01} step="any"
                  value={item.cantidadItem}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    onUpdateItem(item.id, 'cantidadItem', Number.isFinite(n) && n >= 0 ? n : 0);
                  }}
                  className="h-11 text-sm text-center"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-600 uppercase tracking-wide mb-1 block">
                  Descuento %
                </Label>
                <div className="relative">
                  <Input
                    type="number" inputMode="decimal" min={0} max={100} step={0.1}
                    value={item.descuentoPct || ''}
                    placeholder="0"
                    onChange={(e) => onUpdateItem(item.id, 'descuentoPct', parseFloat(e.target.value) || 0)}
                    className="h-11 text-sm text-center pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-600">%</span>
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-600 uppercase tracking-wide mb-1 block">
                  Impuesto
                </Label>
                <Select
                  value={item.tasaItbis}
                  onValueChange={(v) => onUpdateItem(item.id, 'tasaItbis', v)}
                  disabled={!regla?.permiteItbis}
                >
                  <SelectTrigger className="h-11 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {regla?.permiteItbis
                      ? TASA_ITBIS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)
                      : <SelectItem value="exento">Exento</SelectItem>
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>

            {showDescripcion && (
              <div>
                <Label className="text-xs text-gray-600 uppercase tracking-wide mb-1 block">
                  Descripción
                </Label>
                <textarea
                  className="w-full min-h-[60px] text-sm border border-gray-200 rounded-md p-2 resize-none focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
                  placeholder="Descripción..."
                  value={item.descripcionItem}
                  onChange={(e) => onUpdateItem(item.id, 'descripcionItem', e.target.value)}
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Total</span>
              <span className="text-base font-semibold text-gray-900">
                RD$ {calcularMontoItem(item).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ───────── DESKTOP: table (≥ md) ───────── */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[800px] border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 w-[22%]">
                <span className="inline-flex items-center gap-1">
                  Producto
                  <Tooltip text="DGII #84 · nombreItem · máx 80 caracteres">
                    <Info className="h-3 w-3 text-gray-600" aria-hidden="true" />
                  </Tooltip>
                </span>
              </th>
              {showReferencia && <th className="text-left text-xs font-medium text-gray-500 px-2 py-3 w-[9%]">Referencia</th>}
              <th className="text-right text-xs font-medium text-gray-500 px-2 py-3 w-[9%]">
                <span className="inline-flex items-center gap-1">
                  Precio
                  <Tooltip text="DGII #94 · precioUnitarioItem">
                    <Info className="h-3 w-3 text-gray-600" aria-hidden="true" />
                  </Tooltip>
                </span>
              </th>
              <th className="text-center text-xs font-medium text-gray-500 px-2 py-3 w-[7%]">Desc %</th>
              <th className="text-left text-xs font-medium text-gray-500 px-2 py-3 w-[10%]">Impuesto</th>
              {showDescripcion && <th className="text-left text-xs font-medium text-gray-500 px-2 py-3 w-[18%]">Descripción</th>}
              <th className="text-center text-xs font-medium text-gray-500 px-2 py-3 w-[8%]">
                <span className="inline-flex items-center gap-1">
                  Cantidad
                  <Tooltip text="DGII #91 · cantidadItem">
                    <Info className="h-3 w-3 text-gray-600" aria-hidden="true" />
                  </Tooltip>
                </span>
              </th>
              <th className="text-right text-xs font-medium text-gray-500 px-2 py-3 w-[10%]">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className="border-b border-gray-50 align-top group">
                <td className="px-4 py-2">
                  <Autocomplete<Producto>
                    placeholder="Buscar producto o servicio..."
                    value={item.nombreItem}
                    onSearch={buscarProductos}
                    onSelect={(p) => onSelectProducto(idx, p)}
                    onClear={() => onUpdateItem(item.id, 'nombreItem', '')}
                    onCreate={() => onOpenNuevoProducto(idx)}
                    createLabel="Nuevo producto"
                    renderOption={(p) => (
                      <div>
                        <p className="font-medium">{p.nombre}</p>
                        <p className="text-xs text-gray-600">
                          DOP {p.precioDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })} · {p.tasaItbis === 'exento' ? 'Exento' : `ITBIS ${parseFloat(p.tasaItbis) * 100}%`}
                        </p>
                      </div>
                    )}
                  />
                </td>
                {showReferencia && (
                  <td className="px-2 py-2">
                    <Input
                      className="h-9 text-sm"
                      placeholder="Ref."
                      value={item.referencia}
                      onChange={(e) => onUpdateItem(item.id, 'referencia', e.target.value)}
                    />
                  </td>
                )}
                <td className="px-2 py-2">
                  <Input
                    type="number" min={0} step={0.01}
                    value={item.precioUnitarioItem || ''}
                    placeholder="0.00"
                    onChange={(e) => onUpdateItem(item.id, 'precioUnitarioItem', parseFloat(e.target.value) || 0)}
                    className="h-9 text-sm text-right"
                  />
                </td>
                <td className="px-2 py-2">
                  <div className="relative">
                    <Input
                      type="number" min={0} max={100} step={0.1}
                      value={item.descuentoPct || ''}
                      placeholder="0"
                      onChange={(e) => onUpdateItem(item.id, 'descuentoPct', parseFloat(e.target.value) || 0)}
                      className="h-9 text-sm text-center pr-5"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-600">%</span>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <Select
                    value={item.tasaItbis}
                    onValueChange={(v) => onUpdateItem(item.id, 'tasaItbis', v)}
                    disabled={!regla?.permiteItbis}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {regla?.permiteItbis
                        ? TASA_ITBIS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)
                        : <SelectItem value="exento">Exento</SelectItem>
                      }
                    </SelectContent>
                  </Select>
                </td>
                {showDescripcion && (
                  <td className="px-2 py-2">
                    <textarea
                      className="w-full h-[68px] text-sm border border-gray-200 rounded-md p-2 resize-none focus:outline-none focus-visible:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
                      placeholder="Descripción..."
                      value={item.descripcionItem}
                      onChange={(e) => onUpdateItem(item.id, 'descripcionItem', e.target.value)}
                    />
                  </td>
                )}
                <td className="px-2 py-2">
                  <Input
                    type="number" min={0.01} step="any"
                    value={item.cantidadItem}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value);
                      // permitir 0 explícito, NaN/blank → 0; submit valida > 0
                      onUpdateItem(item.id, 'cantidadItem', Number.isFinite(n) && n >= 0 ? n : 0);
                    }}
                    className="h-9 text-sm text-center"
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <div className="h-9 flex items-center justify-end text-sm font-medium text-gray-700">
                    RD$ {calcularMontoItem(item).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </div>
                </td>
                <td className="px-2 py-2">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`Eliminar línea ${idx + 1}`}
                      className="text-gray-300 hover:text-red-400 p-1 mt-1 transition-colors opacity-0 group-hover:opacity-100">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pt-3 mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-gray-50">
        <button
          type="button"
          onClick={onAddItem}
          className="text-teal-600 hover:text-teal-800 text-sm font-medium flex items-center gap-1 transition-colors py-2 -my-2">
          + Agregar línea
        </button>
        <button
          type="button"
          onClick={() => openProximamente('Agregar Conduce')}
          className="text-gray-500 hover:text-teal-700 text-sm font-medium flex items-center gap-1 transition-colors py-2 -my-2">
          + Agregar Conduce
        </button>
      </div>
      {dialog}
    </div>
  );
}
