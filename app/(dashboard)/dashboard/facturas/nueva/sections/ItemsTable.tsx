'use client';

import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import type { TipoEcfRegla } from '@/lib/ecf/types';
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
}

export function ItemsTable({
  items, regla, buscarProductos, onSelectProducto,
  onAddItem, onRemoveItem, onUpdateItem, onOpenNuevoProducto,
}: Props) {
  return (
    <div className="border-b border-gray-100">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 w-[22%]">Producto</th>
              <th className="text-left text-xs font-medium text-gray-500 px-2 py-3 w-[9%]">Referencia</th>
              <th className="text-right text-xs font-medium text-gray-500 px-2 py-3 w-[9%]">Precio</th>
              <th className="text-center text-xs font-medium text-gray-500 px-2 py-3 w-[7%]">Desc %</th>
              <th className="text-left text-xs font-medium text-gray-500 px-2 py-3 w-[10%]">Impuesto</th>
              <th className="text-left text-xs font-medium text-gray-500 px-2 py-3 w-[18%]">Descripción</th>
              <th className="text-center text-xs font-medium text-gray-500 px-2 py-3 w-[8%]">Cantidad</th>
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
                        <p className="text-xs text-gray-400">
                          DOP {p.precioDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })} · {p.tasaItbis === 'exento' ? 'Exento' : `ITBIS ${parseFloat(p.tasaItbis) * 100}%`}
                        </p>
                      </div>
                    )}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    className="h-9 text-sm"
                    placeholder="Ref."
                    value={item.referencia}
                    onChange={(e) => onUpdateItem(item.id, 'referencia', e.target.value)}
                  />
                </td>
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
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
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
                <td className="px-2 py-2">
                  <textarea
                    className="w-full h-[68px] text-sm border border-gray-200 rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
                    placeholder="Descripción..."
                    value={item.descripcionItem}
                    onChange={(e) => onUpdateItem(item.id, 'descripcionItem', e.target.value)}
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number" min={0.01} step="any"
                    value={item.cantidadItem}
                    onChange={(e) => onUpdateItem(item.id, 'cantidadItem', parseFloat(e.target.value) || 1)}
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

      <div className="px-4 py-3 flex items-center justify-between border-t border-gray-50">
        <button
          type="button"
          onClick={onAddItem}
          className="text-teal-600 hover:text-teal-800 text-sm font-medium flex items-center gap-1 transition-colors">
          + Agregar línea
        </button>
        <div className="flex items-center gap-6">
          <button type="button" className="text-gray-400 text-sm font-medium flex items-center gap-1 cursor-not-allowed" title="Próximamente">
            + Agregar Conduce
          </button>
        </div>
      </div>
    </div>
  );
}
