'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Plus, Loader2, ArrowLeft, Search, X, Trash2,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Cliente {
  id: number;
  razonSocial: string;
  rnc: string | null;
  email: string | null;
}

interface Producto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precioDOP: number;
  tasaItbis: string;
  tipo: string;
  referencia: string | null;
}

interface ItemLinea {
  id: number;
  productoId?: number;
  nombreItem: string;
  referencia: string;
  descripcionItem: string;
  cantidadItem: number;
  precioUnitarioItem: number;
  descuentoPct: number;
  tasaItbis: 'exento' | '0.18' | '0.16' | '0';
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPOS_ECF = [
  { value: '31', label: 'Factura de crédito fiscal (31)' },
  { value: '32', label: 'Factura de consumo (32)' },
  { value: '41', label: 'Compras (41)' },
  { value: '43', label: 'Gastos menores (43)' },
  { value: '44', label: 'Regímenes especiales (44)' },
  { value: '45', label: 'Gubernamental (45)' },
];

const TIPOS_PAGO = [
  { value: '1', label: 'De contado' },
  { value: '2', label: '8 días' },
  { value: '3', label: '15 días' },
  { value: '4', label: '30 días' },
  { value: '5', label: '60 días' },
];

const FRECUENCIAS = [
  { value: 'diario',     label: 'Diario' },
  { value: 'semanal',    label: 'Semanal' },
  { value: 'quincenal',  label: 'Quincenal' },
  { value: 'mensual',    label: 'Mensual' },
  { value: 'bimestral',  label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral',  label: 'Semestral' },
  { value: 'anual',      label: 'Anual' },
];

const TASA_ITBIS = [
  { value: '0.18', label: 'ITBIS 18%' },
  { value: '0.16', label: 'ITBIS 16%' },
  { value: '0',    label: 'ITBIS 0%' },
  { value: 'exento', label: 'Exento' },
];

// ─── Utilidades ───────────────────────────────────────────────────────────────

let nextId = 1;
function itemVacio(): ItemLinea {
  return {
    id: nextId++,
    nombreItem: '', referencia: '', descripcionItem: '',
    cantidadItem: 1, precioUnitarioItem: 0, descuentoPct: 0,
    tasaItbis: '0.18',
  };
}

function calcularTotales(items: ItemLinea[]) {
  let subtotal = 0; let itbis = 0;
  for (const item of items) {
    const base = item.cantidadItem * item.precioUnitarioItem;
    const desc = base * (item.descuentoPct / 100);
    const neto = Math.max(0, base - desc);
    const tasa = item.tasaItbis === 'exento' ? 0 : parseFloat(item.tasaItbis);
    subtotal += neto;
    itbis    += neto * tasa;
  }
  return { subtotal, itbis, total: subtotal + itbis };
}

function formatDOP(val: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
}

/** Calcula la próxima fecha de emisión a partir de la fecha de inicio y la frecuencia */
function calcularProximaEmision(fechaInicio: string, frecuencia: string): string {
  if (!fechaInicio) return '';
  const [y, m, d] = fechaInicio.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  switch (frecuencia) {
    case 'diario':     dt.setDate(dt.getDate() + 1); break;
    case 'semanal':    dt.setDate(dt.getDate() + 7); break;
    case 'quincenal':  dt.setDate(dt.getDate() + 15); break;
    case 'mensual':    dt.setMonth(dt.getMonth() + 1); break;
    case 'bimestral':  dt.setMonth(dt.getMonth() + 2); break;
    case 'trimestral': dt.setMonth(dt.getMonth() + 3); break;
    case 'semestral':  dt.setMonth(dt.getMonth() + 6); break;
    case 'anual':      dt.setFullYear(dt.getFullYear() + 1); break;
  }
  return dt.toISOString().slice(0, 10);
}

// ─── Autocomplete genérico ────────────────────────────────────────────────────

function Autocomplete<T extends { id: number }>({
  placeholder, onSearch, renderOption, onSelect, value, onClear,
}: {
  placeholder: string;
  onSearch: (q: string) => Promise<T[]>;
  renderOption: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  value: string;
  onClear: () => void;
}) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const timer                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef            = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleInput(v: string) {
    setQuery(v);
    if (!v.trim()) { setResults([]); setOpen(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await onSearch(v);
        setResults(r);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function select(item: T) {
    onSelect(item);
    setQuery('');
    setOpen(false);
    setResults([]);
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 bg-teal-50 border border-teal-200 rounded-md text-sm font-medium text-teal-800">
        <span className="flex-1 truncate">{value}</span>
        <button type="button" onClick={onClear} className="text-teal-400 hover:text-teal-700">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          className="pl-8 h-9 text-sm"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />}
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-auto">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">No se encontraron resultados</div>
          ) : (
            results.map((item) => (
              <button key={item.id} type="button"
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
                onClick={() => select(item)}>
                {renderOption(item)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function NuevaFacturaRecurrenteForm() {
  const router = useRouter();

  // Cabecera
  const [tipoEcf, setTipoEcf]     = useState('31');
  const [tipoPago, setTipoPago]   = useState('1');
  const [frecuencia, setFrecuencia] = useState('mensual');
  const [nombre, setNombre]       = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin]   = useState('');
  const [notas, setNotas]         = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Cliente
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  // Items
  const [items, setItems] = useState<ItemLinea[]>([itemVacio()]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // ─── Búsqueda clientes ──────────────────────────────────────────────────────
  async function buscarClientes(q: string): Promise<Cliente[]> {
    const res  = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.clientes ?? [];
  }

  // ─── Búsqueda productos ─────────────────────────────────────────────────────
  async function buscarProductos(q: string): Promise<Producto[]> {
    const res  = await fetch(`/api/productos?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.productos ?? [];
  }

  function seleccionarProducto(idx: number, p: Producto) {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      return {
        ...item,
        productoId:         p.id,
        nombreItem:         p.nombre,
        referencia:         p.referencia ?? '',
        descripcionItem:    p.descripcion ?? '',
        precioUnitarioItem: p.precioDOP,
        tasaItbis:          (p.tasaItbis as ItemLinea['tasaItbis']) ?? '0.18',
      };
    }));
  }

  // ─── Items CRUD ─────────────────────────────────────────────────────────────
  function addItem() { setItems(p => [...p, itemVacio()]); }
  function removeItem(id: number) { setItems(p => p.filter(i => i.id !== id)); }
  function updateItem(id: number, field: keyof ItemLinea, value: string | number) {
    setItems(p => p.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  // ─── Totales ────────────────────────────────────────────────────────────────
  const totales = calcularTotales(items);

  // ─── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nombre.trim())      { setError('El nombre identificador es obligatorio'); return; }
    if (!fechaInicio)        { setError('La fecha de inicio es obligatoria'); return; }
    if (items.every(i => !i.nombreItem.trim())) { setError('Agrega al menos un ítem con nombre'); return; }

    const proximaEmision = fechaInicio; // First emission = start date

    setLoading(true);
    try {
      const res = await fetch('/api/facturas-recurrentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:         nombre.trim(),
          tipoEcf,
          tipoPago:       parseInt(tipoPago),
          frecuencia,
          fechaInicio,
          fechaFin:       fechaFin || null,
          proximaEmision,
          clientId:       clienteSeleccionado?.id ?? null,
          notas:          [observaciones, notas].filter(Boolean).join('\n\n') || null,
          totalEstimado:  totales.total,
          items:          items.filter(i => i.nombreItem.trim()).map(item => ({
            nombreItem:         item.nombreItem,
            referencia:         item.referencia || undefined,
            descripcionItem:    item.descripcionItem || undefined,
            cantidadItem:       item.cantidadItem,
            precioUnitarioItem: item.precioUnitarioItem,
            descuentoPct:       item.descuentoPct,
            tasaItbis:          item.tasaItbis,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return; }
      router.push('/dashboard/facturas-recurrentes');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#eef0f7] min-h-full">
      <div className="p-6">

        {/* Back nav */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" asChild className="text-gray-600 hover:text-gray-900">
            <Link href="/dashboard/facturas-recurrentes">
              <ArrowLeft className="h-4 w-4 mr-1" />Volver
            </Link>
          </Button>
          <h1 className="text-lg font-semibold text-gray-700">Nueva factura recurrente</h1>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <span className="text-red-500 mt-0.5 shrink-0 text-lg leading-none">!</span>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

            {/* ── SECCIÓN PRINCIPAL ───────────────────────────────────────── */}
            <div className="px-8 pt-8 pb-6 grid grid-cols-2 gap-8 border-b border-gray-100">

              {/* Columna izquierda */}
              <div className="space-y-4">

                {/* Numeración / Tipo ECF */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400 uppercase tracking-wide">Numeración</Label>
                  <Select value={tipoEcf} onValueChange={setTipoEcf}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_ECF.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Contacto */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400 uppercase tracking-wide">Contacto</Label>
                  <Autocomplete<Cliente>
                    placeholder="Buscar cliente…"
                    value={clienteSeleccionado?.razonSocial ?? ''}
                    onSearch={buscarClientes}
                    onSelect={setClienteSeleccionado}
                    onClear={() => setClienteSeleccionado(null)}
                    renderOption={(c) => (
                      <div>
                        <p className="font-medium">{c.razonSocial}</p>
                        <p className="text-xs text-gray-400">{[c.rnc, c.email].filter(Boolean).join(' · ')}</p>
                      </div>
                    )}
                  />
                </div>

                {/* Observaciones */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400 uppercase tracking-wide">Observaciones</Label>
                  <Textarea
                    placeholder="Observaciones internas (no aparecen en la factura)"
                    value={observaciones}
                    onChange={e => setObservaciones(e.target.value)}
                    className="resize-none text-sm h-20"
                  />
                </div>

                {/* Notas de la factura */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400 uppercase tracking-wide">Notas de la factura</Label>
                  <Textarea
                    placeholder="Texto que aparecerá en cada factura generada"
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    className="resize-none text-sm h-20"
                  />
                </div>
              </div>

              {/* Columna derecha */}
              <div className="space-y-4">

                {/* Fecha de inicio */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400 uppercase tracking-wide">
                    Fecha de inicio <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={fechaInicio}
                    onChange={e => setFechaInicio(e.target.value)}
                    min={today}
                    className="h-9"
                    required
                  />
                </div>

                {/* Vigencia hasta */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400 uppercase tracking-wide">
                    Vigencia hasta{' '}
                    <span className="text-red-400 text-[11px] font-normal normal-case">
                      {fechaFin ? '' : '(Indefinida)'}
                    </span>
                  </Label>
                  <div className="relative">
                    <Input
                      type="date"
                      value={fechaFin}
                      onChange={e => setFechaFin(e.target.value)}
                      min={fechaInicio || today}
                      className={`h-9 pr-8 ${fechaFin ? 'border-red-300 text-red-700' : ''}`}
                    />
                    {fechaFin && (
                      <button
                        type="button"
                        onClick={() => setFechaFin('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {!fechaFin && (
                    <p className="text-xs text-red-400">Sin fecha de fin — se ejecutará indefinidamente</p>
                  )}
                </div>

                {/* Plazo de pago */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400 uppercase tracking-wide">Plazo de pago</Label>
                  <Select value={tipoPago} onValueChange={setTipoPago}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_PAGO.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Frecuencia */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400 uppercase tracking-wide">Frecuencia</Label>
                  <Select value={frecuencia} onValueChange={setFrecuencia}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FRECUENCIAS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fechaInicio && (
                    <p className="text-xs text-gray-400">
                      Próxima emisión:{' '}
                      <span className="font-medium text-gray-600">
                        {calcularProximaEmision(fechaInicio, frecuencia)}
                      </span>
                    </p>
                  )}
                </div>

                {/* Nombre identificador */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-400 uppercase tracking-wide">
                    Nombre identificador <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="Ej: Servicio mensual - Empresa ABC"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    className="h-9"
                    required
                  />
                  <p className="text-xs text-gray-400">Nombre interno para identificar esta recurrencia</p>
                </div>
              </div>
            </div>

            {/* ── TABLA DE ÍTEMS ───────────────────────────────────────────── */}
            <div className="border-b border-gray-100">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 w-[22%]">Producto</th>
                      <th className="text-left text-xs font-medium text-gray-500 px-2 py-3 w-[9%]">Referencia</th>
                      <th className="text-right text-xs font-medium text-gray-500 px-2 py-3 w-[10%]">Precio</th>
                      <th className="text-center text-xs font-medium text-gray-500 px-2 py-3 w-[7%]">Desc %</th>
                      <th className="text-left text-xs font-medium text-gray-500 px-2 py-3 w-[10%]">Impuesto</th>
                      <th className="text-left text-xs font-medium text-gray-500 px-2 py-3 w-[18%]">Descripción</th>
                      <th className="text-center text-xs font-medium text-gray-500 px-2 py-3 w-[8%]">Cantidad</th>
                      <th className="text-right text-xs font-medium text-gray-500 px-2 py-3 w-[10%]">Total</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const base  = item.cantidadItem * item.precioUnitarioItem;
                      const desc  = base * (item.descuentoPct / 100);
                      const neto  = Math.max(0, base - desc);
                      const tasa  = item.tasaItbis === 'exento' ? 0 : parseFloat(item.tasaItbis);
                      const total = neto + neto * tasa;

                      return (
                        <tr key={item.id} className="border-b border-gray-50 align-top group">

                          {/* Producto */}
                          <td className="px-4 py-2">
                            <Autocomplete<Producto>
                              placeholder="Buscar producto…"
                              value={item.nombreItem}
                              onSearch={buscarProductos}
                              onSelect={(p) => seleccionarProducto(idx, p)}
                              onClear={() => updateItem(item.id, 'nombreItem', '')}
                              renderOption={(p) => (
                                <div>
                                  <p className="font-medium">{p.nombre}</p>
                                  <p className="text-xs text-gray-400">{formatDOP(p.precioDOP)}</p>
                                </div>
                              )}
                            />
                          </td>

                          {/* Referencia */}
                          <td className="px-2 py-2">
                            <Input
                              className="h-9 text-sm"
                              placeholder="SKU"
                              value={item.referencia}
                              onChange={e => updateItem(item.id, 'referencia', e.target.value)}
                            />
                          </td>

                          {/* Precio */}
                          <td className="px-2 py-2">
                            <Input
                              className="h-9 text-sm text-right"
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.precioUnitarioItem || ''}
                              onChange={e => updateItem(item.id, 'precioUnitarioItem', parseFloat(e.target.value) || 0)}
                            />
                          </td>

                          {/* Descuento % */}
                          <td className="px-2 py-2">
                            <Input
                              className="h-9 text-sm text-center"
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              value={item.descuentoPct || ''}
                              onChange={e => updateItem(item.id, 'descuentoPct', parseFloat(e.target.value) || 0)}
                            />
                          </td>

                          {/* Impuesto */}
                          <td className="px-2 py-2">
                            <Select
                              value={item.tasaItbis}
                              onValueChange={v => updateItem(item.id, 'tasaItbis', v)}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TASA_ITBIS.map(t => (
                                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>

                          {/* Descripción */}
                          <td className="px-2 py-2">
                            <Input
                              className="h-9 text-sm"
                              placeholder="Descripción opcional"
                              value={item.descripcionItem}
                              onChange={e => updateItem(item.id, 'descripcionItem', e.target.value)}
                            />
                          </td>

                          {/* Cantidad */}
                          <td className="px-2 py-2">
                            <Input
                              className="h-9 text-sm text-center"
                              type="number"
                              min={1}
                              step={1}
                              value={item.cantidadItem}
                              onChange={e => updateItem(item.id, 'cantidadItem', parseFloat(e.target.value) || 1)}
                            />
                          </td>

                          {/* Total */}
                          <td className="px-2 py-2 text-right">
                            <span className="text-sm font-medium text-gray-700 leading-9 block">
                              {formatDOP(total)}
                            </span>
                          </td>

                          {/* Eliminar */}
                          <td className="px-1 py-2">
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              disabled={items.length === 1}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all disabled:pointer-events-none"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Agregar línea */}
              <div className="px-4 py-3 border-t border-gray-50">
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-800 font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Agregar línea
                </button>
              </div>
            </div>

            {/* ── TOTALES ──────────────────────────────────────────────────── */}
            <div className="px-8 py-6 flex justify-end">
              <div className="w-72 space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatDOP(totales.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>ITBIS</span>
                  <span>{formatDOP(totales.itbis)}</span>
                </div>
                <div className="flex justify-between font-bold text-base text-gray-900 border-t border-gray-200 pt-2 mt-2">
                  <span>Total estimado</span>
                  <span>{formatDOP(totales.total)}</span>
                </div>
              </div>
            </div>

            {/* ── FOOTER BOTONES ────────────────────────────────────────────── */}
            <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <Button type="button" variant="outline" asChild disabled={loading}>
                <Link href="/dashboard/facturas-recurrentes">Cancelar</Link>
              </Button>
              <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white" disabled={loading}>
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</>
                  : 'Guardar'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
