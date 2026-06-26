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

interface DependienteOpt {
  id: number;
  nombre: string;
  apellido: string;
}

/** Ancho del dropdown de productos — más ancho que la celda para layout tipo tabla. */
const PRODUCTO_DROPDOWN_W = 460;

/** Fila del dropdown de productos: código (referencia) · nombre + descripción · precio/ITBIS. */
function renderProductoOption(p: Producto) {
  return (
    <div className="grid grid-cols-[5rem_1fr] items-start gap-x-3 gap-y-0.5">
      <span
        className="font-mono text-xs text-gray-500 truncate pt-0.5"
        title={p.referencia ?? undefined}
      >
        {p.referencia || '—'}
      </span>
      <p className="min-w-0 font-medium truncate">{p.nombre}</p>
      {p.descripcion && (
        <p
          className="col-span-2 min-w-0 truncate text-xs text-gray-500"
          title={p.descripcion}
        >
          {p.descripcion}
        </p>
      )}
    </div>
  );
}

interface Props {
  items: ItemLinea[];
  regla: TipoEcfRegla | undefined;
  buscarProductos: (q: string) => Promise<Producto[]>;
  onSelectProducto: (idx: number, p: Producto) => void;
  /** Texto libre sin match → crear producto en DB y seleccionarlo. */
  onCrearProductoLibre: (idx: number, texto: string) => void;
  onAddItem: () => void;
  onRemoveItem: (id: number) => void;
  onUpdateItem: (id: number, field: keyof ItemLinea, value: string | number | null) => void;
  onSelectBeneficiario: (itemId: number, depId: number | null, nombreCompleto: string) => void;
  onOpenNuevoProducto: (idx: number) => void;
  /** Estado lifted al padre — controla visibilidad de columnas Referencia/Descripción */
  showReferencia: boolean;
  showDescripcion: boolean;
  /** Lista de dependientes del cliente seleccionado. Vacía = no mostrar columna. */
  dependientes: DependienteOpt[];
}


export function ItemsTable({
  items, regla, buscarProductos, onSelectProducto, onCrearProductoLibre,
  onAddItem, onRemoveItem, onUpdateItem, onSelectBeneficiario, onOpenNuevoProducto,
  showReferencia, showDescripcion, dependientes,
}: Props) {
  const { openProximamente, dialog } = useProximamenteDialog();
  const hasDeps = dependientes.length > 0;
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

            {/* Beneficiario — mobile */}
            {hasDeps && (
              <div>
                <Label className="text-xs text-gray-600 uppercase tracking-wide mb-1 block">
                  Beneficiario <span className="text-red-500 ml-0.5">*</span>
                </Label>
                <select
                  className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={item.dependienteId ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      onSelectBeneficiario(item.id, null, '');
                    } else {
                      const id = parseInt(val, 10);
                      const dep = dependientes.find(d => d.id === id);
                      onSelectBeneficiario(item.id, id, dep ? `${dep.nombre} ${dep.apellido}` : '');
                    }
                  }}
                >
                  <option value="">— Beneficiario —</option>
                  {dependientes.map(d => (
                    <option key={d.id} value={d.id}>{d.nombre} {d.apellido}</option>
                  ))}
                </select>
              </div>
            )}

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
                dropdownMinWidth={PRODUCTO_DROPDOWN_W}
                renderOption={renderProductoOption}
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
                  disabled={regla !== undefined && !regla.permiteItbis}
                >
                  <SelectTrigger className="h-11 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(regla === undefined || regla.permiteItbis)
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
        {/* min-w dinámico — solo expandir cuando hay opcionales visibles */}
        <table className={`w-full border-collapse table-fixed ${
          hasDeps && showReferencia && showDescripcion ? 'min-w-[960px]' :
          hasDeps && (showReferencia || showDescripcion) ? 'min-w-[860px]' :
          hasDeps ? 'min-w-[740px]' :
          showReferencia && showDescripcion ? 'min-w-[820px]' :
          (showReferencia || showDescripcion) ? 'min-w-[720px]' :
          'min-w-[600px]'
        }`}>
          <colgroup>
            {/* Beneficiario */}
            {hasDeps && <col className="w-[16%]" />}
            {/* Producto */}
            <col className={
              hasDeps && showReferencia && showDescripcion ? 'w-[16%]' :
              hasDeps && (showReferencia || showDescripcion) ? 'w-[18%]' :
              hasDeps ? 'w-[22%]' :
              showReferencia && showDescripcion ? 'w-[22%]' :
              showReferencia ? 'w-[28%]' :
              showDescripcion ? 'w-[22%]' :
              'w-[32%]'
            } />
            {/* Referencia */}
            {showReferencia && <col className="w-[10%]" />}
            {/* Precio */}
            <col className={
              (showReferencia && showDescripcion) ? 'w-[10%]' :
              (showReferencia || showDescripcion) ? 'w-[12%]' :
              'w-[14%]'
            } />
            {/* Desc % */}
            <col className="w-[8%]" />
            {/* Impuesto */}
            <col className={
              (showReferencia && showDescripcion) ? 'w-[10%]' :
              (showReferencia || showDescripcion) ? 'w-[12%]' :
              'w-[14%]'
            } />
            {/* Descripción */}
            {showDescripcion && <col className="w-[16%]" />}
            {/* Cantidad */}
            <col className={
              (showReferencia && showDescripcion) ? 'w-[10%]' :
              (showReferencia || showDescripcion) ? 'w-[12%]' :
              'w-[14%]'
            } />
            {/* Total */}
            <col className={
              (showReferencia && showDescripcion) ? 'w-[12%]' :
              (showReferencia || showDescripcion) ? 'w-[14%]' :
              'w-[16%]'
            } />
            {/* Action */}
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              {hasDeps && (
                <th className="text-left text-xs font-medium text-gray-500 px-2 py-3">
                  Beneficiario <span className="text-red-500 ml-0.5">*</span>
                </th>
              )}
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                <span className="inline-flex items-center gap-1">
                  Producto
                  <Tooltip text="DGII #84 · nombreItem · máx 80 caracteres">
                    <Info className="h-3 w-3 text-gray-600" aria-hidden="true" />
                  </Tooltip>
                </span>
              </th>
              {showReferencia && <th className="text-left text-xs font-medium text-gray-500 px-2 py-3">Referencia</th>}
              <th className="text-right text-xs font-medium text-gray-500 px-2 py-3">
                <span className="inline-flex items-center gap-1">
                  Precio
                  <Tooltip text="DGII #94 · precioUnitarioItem">
                    <Info className="h-3 w-3 text-gray-600" aria-hidden="true" />
                  </Tooltip>
                </span>
              </th>
              <th className="text-center text-xs font-medium text-gray-500 px-2 py-3">Desc %</th>
              <th className="text-left text-xs font-medium text-gray-500 px-2 py-3">Impuesto</th>
              {showDescripcion && <th className="text-left text-xs font-medium text-gray-500 px-2 py-3">Descripción</th>}
              <th className="text-center text-xs font-medium text-gray-500 px-2 py-3">
                <span className="inline-flex items-center gap-1">
                  Cantidad
                  <Tooltip text="DGII #91 · cantidadItem">
                    <Info className="h-3 w-3 text-gray-600" aria-hidden="true" />
                  </Tooltip>
                </span>
              </th>
              <th className="text-right text-xs font-medium text-gray-500 px-2 py-3">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className="border-b border-gray-50 align-top group">
                {/* Beneficiario cell — desktop */}
                {hasDeps && (
                  <td className="px-2 py-2">
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      value={item.dependienteId ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          onSelectBeneficiario(item.id, null, '');
                        } else {
                          const id = parseInt(val, 10);
                          const dep = dependientes.find(d => d.id === id);
                          onSelectBeneficiario(item.id, id, dep ? `${dep.nombre} ${dep.apellido}` : '');
                        }
                      }}
                    >
                      <option value="">— Beneficiario —</option>
                      {dependientes.map(d => (
                        <option key={d.id} value={d.id}>{d.nombre} {d.apellido}</option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="px-4 py-2">
                  <Autocomplete<Producto>
                    placeholder="Buscar producto o servicio..."
                    value={item.nombreItem}
                    onSearch={buscarProductos}
                    onSelect={(p) => onSelectProducto(idx, p)}
                    onClear={() => onUpdateItem(item.id, 'nombreItem', '')}
                    onCreate={() => onOpenNuevoProducto(idx)}
                    createLabel="Nuevo producto"
                    dropdownMinWidth={PRODUCTO_DROPDOWN_W}
                    renderOption={renderProductoOption}
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
                    disabled={regla !== undefined && !regla.permiteItbis}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(regla === undefined || regla.permiteItbis)
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
