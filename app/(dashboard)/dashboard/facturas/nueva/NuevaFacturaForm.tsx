'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus, Loader2, CheckCircle, AlertTriangle, ArrowLeft, Search, X,
  UserPlus, PackagePlus, Settings, Check, ChevronDown, ChevronUp,
  MessageCircle, DollarSign, Printer, Mail, Save, FileText, Download,
} from 'lucide-react';
import { TIPOS_ECF, TIPO_ECF_REGLAS } from '@/lib/ecf/types';
import { CATEGORIAS_ECF, getCategoriaDeEcf } from '@/lib/ecf/categorias';
import { RncSearch } from '@/components/RncSearch';

// ─── Tipos locales ────────────────────────────────────────────────────────────

interface Cliente { id: number; razonSocial: string; rnc: string | null; email: string | null; telefono: string | null; }
interface Producto { id: number; nombre: string; descripcion: string | null; precioDOP: number; tasaItbis: string; tipo: string; referencia: string | null; }

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
  indicadorBienoServicio: '1' | '2';
  unidadMedida?: string;
}

interface ResultadoEmision {
  ok:              boolean;
  modo:            'emitir' | 'borrador';
  encf?:           string;
  trackId?:        string;
  estado:          string;
  codigoSeguridad?: string;
  montoTotal?:     number;
  documentoId:     number;
}

interface Retencion {
  id:          string;
  nombre:      string;
  porcentaje:  number;
  tipo:        'itbis' | 'isr' | 'otro';
  monto:       number;
  manual:      boolean;
}

interface SecuenciaInfo {
  id?:           number;
  encf:          string | null;
  disponibles:   number;
  agotada:       boolean;
  vencida?:      boolean;
  sinSecuencia?: boolean;
  sinNcf?:       boolean;
  fechaVencimiento?: string;
  pieDeFactura?: string | null;
  hasta?:        number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

interface Plazo {
  id:       string;
  label:    string;
  dgiiTipo: number;       // 1=contado, 2=crédito, 3=gratuito, 4=uso
  dias:     number | null; // null = sin auto-cálculo
  esManual?: boolean;
  custom?:   boolean;
}

const PLAZOS_BASE: Plazo[] = [
  { id: 'contado',  label: 'De contado',        dgiiTipo: 1, dias: null            },
  { id: '8d',       label: '8 días',             dgiiTipo: 2, dias: 8              },
  { id: '15d',      label: '15 días',            dgiiTipo: 2, dias: 15             },
  { id: '30d',      label: '30 días',            dgiiTipo: 2, dias: 30             },
  { id: '60d',      label: '60 días',            dgiiTipo: 2, dias: 60             },
  { id: 'manual',   label: 'Vencimiento manual', dgiiTipo: 2, dias: null, esManual: true },
  { id: 'gratuito', label: 'Gratuito',           dgiiTipo: 3, dias: null           },
  { id: 'uso',      label: 'Uso o Consumo',      dgiiTipo: 4, dias: null           },
];
const TASA_ITBIS = [
  { value: '0.18', label: 'ITBIS 18%' }, { value: '0.16', label: 'ITBIS 16%' },
  { value: '0', label: 'ITBIS 0%' },     { value: 'exento', label: 'Exento' },
];

const RETENCIONES_PREDEFINIDAS = [
  // ITBIS
  { id: 'itbis_30',  nombre: 'Retención ITBIS',       porcentaje: 30,  tipo: 'itbis' as const, descripcion: 'Retención 30% del ITBIS (Estado y entidades públicas)' },
  { id: 'itbis_75',  nombre: 'Retención ITBIS',       porcentaje: 75,  tipo: 'itbis' as const, descripcion: 'Retención 75% del ITBIS (Grandes Contribuyentes designados)' },
  { id: 'itbis_100', nombre: 'Retención ITBIS',       porcentaje: 100, tipo: 'itbis' as const, descripcion: 'Retención 100% del ITBIS' },
  // ISR
  { id: 'isr_alq',   nombre: 'Alquileres',             porcentaje: 10,  tipo: 'isr'   as const, descripcion: 'ISR sobre alquileres pagados a personas físicas (10%)' },
  { id: 'isr_hon',   nombre: 'Honorarios por servicios', porcentaje: 10, tipo: 'isr'  as const, descripcion: 'ISR honorarios profesionales y servicios (10%)' },
  { id: 'isr_otras', nombre: 'Otras rentas',           porcentaje: 10,  tipo: 'isr'   as const, descripcion: 'ISR otras rentas (10%)' },
  { id: 'isr_div',   nombre: 'Dividendos',             porcentaje: 10,  tipo: 'isr'   as const, descripcion: 'ISR retención dividendos (10%)' },
];

function tasaToFloat(t: string): number | undefined {
  if (t === 'exento') return undefined;
  const n = parseFloat(t);
  return isNaN(n) ? undefined : n;
}

function calcularMontoItem(item: ItemLinea): number {
  const base = item.cantidadItem * item.precioUnitarioItem;
  const desc = base * (item.descuentoPct / 100);
  const neto = Math.max(0, base - desc);
  const tasa = item.tasaItbis === 'exento' ? 0 : parseFloat(item.tasaItbis);
  return neto + neto * tasa;
}

function calcularTotales(items: ItemLinea[]) {
  let bruto = 0; let descuento = 0; let itbis = 0;
  for (const item of items) {
    const base = item.cantidadItem * item.precioUnitarioItem;
    const desc = base * (item.descuentoPct / 100);
    const neto = Math.max(0, base - desc);
    const tasa = item.tasaItbis === 'exento' ? 0 : parseFloat(item.tasaItbis);
    bruto    += base;
    descuento += desc;
    itbis    += neto * tasa;
  }
  const subtotal = bruto - descuento;
  return { bruto, subtotal, descuento, itbis, total: subtotal + itbis };
}

let nextId = 1;
function itemVacio(): ItemLinea {
  return {
    id: nextId++,
    nombreItem: '', referencia: '', descripcionItem: '',
    cantidadItem: 1, precioUnitarioItem: 0, descuentoPct: 0,
    tasaItbis: '0.18', indicadorBienoServicio: '2',
  };
}

// ─── Autocomplete genérico ────────────────────────────────────────────────────

function Autocomplete<T extends { id: number }>({
  placeholder, onSearch, renderOption, onSelect, value, onClear, onCreate, createLabel,
}: {
  placeholder: string;
  onSearch: (q: string) => Promise<T[]>;
  renderOption: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  value: string;
  onClear: () => void;
  onCreate?: () => void;
  createLabel?: string;
}) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<T[]>([]);
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
  const timer                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef              = useRef<HTMLDivElement>(null);
  const dropRef                 = useRef<HTMLDivElement>(null);

  // Calcula posición del dropdown en coordenadas del viewport (fixed)
  const calcRect = useCallback(() => {
    if (wrapperRef.current) setDropRect(wrapperRef.current.getBoundingClientRect());
  }, []);

  // Cierra al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t) || dropRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Actualiza posición al hacer scroll/resize
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', calcRect, true);
    window.addEventListener('resize', calcRect);
    return () => {
      window.removeEventListener('scroll', calcRect, true);
      window.removeEventListener('resize', calcRect);
    };
  }, [open, calcRect]);

  async function handleInput(v: string) {
    setQuery(v);
    if (!v.trim()) { setResults([]); setOpen(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await onSearch(v);
        setResults(r);
        calcRect();
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

  const dropdown = open && dropRect ? (
    <div
      ref={dropRef}
      style={{
        position: 'fixed',
        top:   dropRect.bottom + 4,
        left:  dropRect.left,
        width: dropRect.width,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-auto"
    >
      {results.length === 0 ? (
        <div className="px-4 py-3 text-sm text-gray-500">No se han encontrado resultados</div>
      ) : (
        results.map((item) => (
          <button key={item.id} type="button"
            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select(item)}>
            {renderOption(item)}
          </button>
        ))
      )}
      {onCreate && (
        <button type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setOpen(false); onCreate(); }}
          className="w-full text-left px-4 py-2.5 text-sm text-teal-700 font-medium hover:bg-teal-50 flex items-center gap-2 border-t border-gray-200">
          <Plus className="h-4 w-4" />{createLabel ?? 'Crear nuevo'}
        </button>
      )}
    </div>
  ) : null;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          className="pl-8 h-9 text-sm"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) { calcRect(); setOpen(true); } }}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />}
      </div>
      {typeof document !== 'undefined' && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}

// ─── Mini-modal crear cliente inline ─────────────────────────────────────────

const TIPOS_IDENTIFICACION = [
  { value: 'rnc', label: 'RNC' },
  { value: 'cedula', label: 'Cédula' },
  { value: 'pasaporte', label: 'Pasaporte' },
];

function ModalNuevoCliente({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (c: Cliente) => void;
}) {
  const [form, setForm]         = useState({ razonSocial: '', rnc: '', email: '', telefono: '', tipoId: 'rnc' });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [tipoContacto, setTipo] = useState<'cliente' | 'proveedor'>('cliente');

  async function handleSave() {
    if (!form.razonSocial.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      // Enviar null para campos vacíos en lugar de strings vacíos
      const payload = {
        razonSocial: form.razonSocial.trim(),
        rnc:      form.rnc.trim()      || null,
        email:    form.email.trim()    || null,
        telefono: form.telefono.trim() || null,
        tipoId:   form.tipoId,
      };
      const res  = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        // Mostrar errores de campo específicos si existen
        const fieldErrors = data?.detalles?.fieldErrors as Record<string, string[]> | undefined;
        if (fieldErrors) {
          const msgs = Object.entries(fieldErrors)
            .filter(([, errs]) => errs?.length)
            .map(([field, errs]) => {
              const label: Record<string, string> = {
                razonSocial: 'Nombre', rnc: 'RNC/Cédula',
                email: 'Correo electrónico', telefono: 'Teléfono', direccion: 'Dirección',
              };
              return `${label[field] ?? field}: ${errs[0]}`;
            });
          if (msgs.length) { setError(msgs.join(' · ')); return; }
        }
        throw new Error(data.error ?? 'Error al guardar');
      }
      onCreated(data.cliente);
      setForm({ razonSocial: '', rnc: '', email: '', telefono: '', tipoId: 'rnc' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-teal-600" />Nuevo contacto
          </DialogTitle>
        </DialogHeader>

        {/* Cliente / Proveedor toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
          {(['cliente', 'proveedor'] as const).map((t) => (
            <button key={t} type="button"
              onClick={() => setTipo(t)}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                tipoContacto === t
                  ? 'bg-teal-100 text-teal-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tipoContacto === t && <span className="h-4 w-4 rounded-full border-2 border-teal-600 flex items-center justify-center"><span className="h-2 w-2 bg-teal-600 rounded-full" /></span>}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="space-y-3 py-1">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

          <div className="space-y-1.5">
            <Label className="text-sm">Tipo de identificación</Label>
            <Select value={form.tipoId} onValueChange={(v) => setForm((f) => ({ ...f, tipoId: v }))}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {TIPOS_IDENTIFICACION.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">RNC / Cédula</Label>
            <RncSearch
              placeholder="Buscar RNC, Cédula o razón social…"
              value={form.rnc ? `${form.rnc}${form.razonSocial ? ` · ${form.razonSocial}` : ''}` : undefined}
              onSelect={(r) => setForm((f) => ({
                ...f,
                rnc: r.rnc,
                razonSocial: r.nombre,
                tipoId: r.tipo === 'cedula' ? 'cedula' : 'rnc',
              }))}
              onClear={() => setForm((f) => ({ ...f, rnc: '', razonSocial: '' }))}
              showSyncHint
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Nombre o Razón social <span className="text-red-500">*</span></Label>
            <Input placeholder="Empresa XYZ SRL" value={form.razonSocial} onChange={(e) => setForm((f) => ({ ...f, razonSocial: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Correo electrónico</Label>
              <Input type="email" placeholder="Ejemplo@email.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Teléfono</Label>
              <Input placeholder="___-___-____" value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex items-center gap-1">
            <X className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Ir a formulario avanzado
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear contacto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mini-modal crear producto inline ────────────────────────────────────────

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

function ModalNuevoProducto({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (p: Producto) => void;
}) {
  const [form, setForm]           = useState({ nombre: '', precio: '', tasaItbis: 'exento', tipo: 'servicio', descripcion: '', unidad: 'Unidad', cantidadInicial: '' });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [showAvanzado, setShowAvanzado] = useState(false);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        nombre:      form.nombre,
        precio:      parseFloat(form.precio) || 0,
        tasaItbis:   form.tasaItbis,
        tipo:        form.tipo === 'bien' ? 'bien' : 'servicio',
        descripcion: form.descripcion,
        unidad:      form.unidad,
      };
      const res  = await fetch('/api/productos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated(data.producto);
      setForm({ nombre: '', precio: '', tasaItbis: 'exento', tipo: 'servicio', descripcion: '', unidad: 'Unidad', cantidadInicial: '' });
      setShowAvanzado(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) { onClose(); setError(null); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-teal-600" />Nuevo producto/servicio
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

          {/* Tipo toggle pills */}
          <div>
            <div className="flex gap-2">
              {TIPOS_ITEM.map((t) => {
                const isSelected = form.tipo === t.value;
                if (t.disabled) {
                  return (
                    <div key={t.value} title="Próximamente"
                      className="relative flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium cursor-not-allowed opacity-40 bg-white border-gray-200 text-gray-400 select-none">
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
            <p className="text-xs text-gray-400 mt-2">
              Ten en cuenta que, una vez creado, no podrás cambiar el tipo del artículo.
            </p>
          </div>

          {/* Nombre */}
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input placeholder={form.tipo === 'bien' ? 'Ej. Camisa talla M' : 'Ej. Diseño de logo'}
              value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
          </div>

          {/* Precio + ITBIS */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Precio (DOP) <span className="text-red-500">*</span></Label>
              <Input type="number" min={0} step={0.01} placeholder="0.00"
                value={form.precio} onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))} />
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

          {/* Unidad de medida */}
          <div className="space-y-1.5">
            <Label>Unidad de medida</Label>
            <Select value={form.unidad} onValueChange={(v) => setForm((f) => ({ ...f, unidad: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Cantidad inicial — solo para Producto */}
          {form.tipo === 'bien' && (
            <div className="space-y-1.5">
              <Label>Cantidad inicial en inventario</Label>
              <Input type="number" min={0} step={1} placeholder="0"
                value={form.cantidadInicial} onChange={(e) => setForm((f) => ({ ...f, cantidadInicial: e.target.value }))} />
            </div>
          )}

          {/* Formulario avanzado (placeholder) */}
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

// ─── Mini-modal crear almacén inline ─────────────────────────────────────────

function ModalNuevoAlmacen({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (a: { id: number; nombre: string }) => void;
}) {
  const [form, setForm]     = useState({ nombre: '', direccion: '', observacion: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch('/api/almacenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: form.nombre.trim(), direccion: form.direccion.trim() || undefined, observacion: form.observacion.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onCreated(data.almacen);
      setForm({ nombre: '', direccion: '', observacion: '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) { onClose(); setError(null); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Nuevo almacén</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
          <div className="space-y-1.5">
            <Label className="text-sm">Nombre <span className="text-red-500">*</span></Label>
            <Input placeholder="Ej. Almacén Principal" value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Dirección</Label>
            <Input placeholder="Dirección del almacén" value={form.direccion} onChange={(e) => setForm(f => ({ ...f, direccion: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Observación</Label>
            <Input placeholder="Notas adicionales" value={form.observacion} onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); setError(null); }} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear almacén'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mini-modal crear lista de precios inline ─────────────────────────────────

function ModalNuevaLista({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (l: { id: number; nombre: string; tipo: string; porcentaje: number }) => void;
}) {
  const [form, setForm]     = useState({ nombre: '', tipo: 'valor', porcentaje: '', descripcion: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch('/api/listas-precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:      form.nombre.trim(),
          tipo:        form.tipo,
          porcentaje:  form.tipo === 'porcentaje' ? parseFloat(form.porcentaje) * 100 || 0 : 0,
          descripcion: form.descripcion.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onCreated(data.lista);
      setForm({ nombre: '', tipo: 'valor', porcentaje: '', descripcion: '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) { onClose(); setError(null); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Nueva lista de precios</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
          <div className="space-y-1.5">
            <Label className="text-sm">Nombre <span className="text-red-500">*</span></Label>
            <Input placeholder="Ej. Lista mayorista" value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm(f => ({ ...f, tipo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="valor">Valor fijo</SelectItem>
                <SelectItem value="porcentaje">Porcentaje de descuento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.tipo === 'porcentaje' && (
            <div className="space-y-1.5">
              <Label className="text-sm">Porcentaje (%)</Label>
              <Input type="number" min={0} max={100} step={0.01} placeholder="0.00"
                value={form.porcentaje} onChange={(e) => setForm(f => ({ ...f, porcentaje: e.target.value }))} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">Descripción</Label>
            <Input placeholder="Descripción opcional" value={form.descripcion} onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); setError(null); }} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear lista'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mini-modal crear vendedor inline ────────────────────────────────────────

function ModalNuevoVendedor({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (v: { id: number; nombre: string }) => void;
}) {
  const [form, setForm]     = useState({ nombre: '', identificacion: '', observacion: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch('/api/vendedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:         form.nombre.trim(),
          identificacion: form.identificacion.trim() || undefined,
          observacion:    form.observacion.trim()    || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar');
      onCreated(data.vendedor);
      setForm({ nombre: '', identificacion: '', observacion: '' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) { onClose(); setError(null); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Nuevo vendedor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
          <div className="space-y-1.5">
            <Label className="text-sm">Nombre <span className="text-red-500">*</span></Label>
            <Input placeholder="Nombre del vendedor" value={form.nombre} onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Identificación</Label>
            <Input placeholder="Cédula u otro identificador" value={form.identificacion} onChange={(e) => setForm(f => ({ ...f, identificacion: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Observación</Label>
            <Input placeholder="Notas adicionales" value={form.observacion} onChange={(e) => setForm(f => ({ ...f, observacion: e.target.value }))} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); setError(null); }} disabled={saving}>Cancelar</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Crear vendedor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Monto en letras (español dominicano) ────────────────────────────────────

function numeroALetras(n: number): string {
  const UNI = ['', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve',
    'Diez', 'Once', 'Doce', 'Trece', 'Catorce', 'Quince', 'Dieciséis', 'Diecisiete', 'Dieciocho', 'Diecinueve'];
  const DEC = ['', '', 'Veinte', 'Treinta', 'Cuarenta', 'Cincuenta', 'Sesenta', 'Setenta', 'Ochenta', 'Noventa'];
  const CEN = ['', 'Cien', 'Doscientos', 'Trescientos', 'Cuatrocientos', 'Quinientos',
    'Seiscientos', 'Setecientos', 'Ochocientos', 'Novecientos'];

  function cientos(x: number): string {
    if (x === 0) return '';
    if (x < 20) return UNI[x];
    if (x < 30) return x === 20 ? 'Veinte' : 'Veinti' + UNI[x % 10].toLowerCase();
    if (x < 100) return DEC[Math.floor(x / 10)] + (x % 10 ? ' y ' + UNI[x % 10].toLowerCase() : '');
    if (x === 100) return 'Cien';
    return CEN[Math.floor(x / 100)] + (x % 100 ? ' ' + cientos(x % 100) : '');
  }

  const entero   = Math.floor(n);
  const centavos = Math.round((n - entero) * 100);
  let texto = '';
  const mill = Math.floor(entero / 1_000_000);
  const mil  = Math.floor((entero % 1_000_000) / 1_000);
  const res  = entero % 1_000;
  if (mill) texto += (mill === 1 ? 'Un millón' : cientos(mill) + ' millones') + ' ';
  if (mil)  texto += (mil  === 1 ? 'Mil'       : cientos(mil)  + ' mil')      + ' ';
  if (res)  texto += cientos(res);
  if (!texto) texto = 'Cero';
  return texto.trim() + (centavos ? ` con ${centavos}/100` : '') + ' pesos dominicanos';
}

// ─── Tipo de perfil de empresa ────────────────────────────────────────────────

interface EmpresaPerfil {
  razonSocial:     string | null;
  nombreComercial: string | null;
  logo:            string | null;
  rnc:             string | null;
  firma:           string | null;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function NuevaFacturaForm({ initialPerfil }: { initialPerfil: EmpresaPerfil | null }) {
  const router = useRouter();
  const empresa = initialPerfil;

  const [tipoEcf, setTipoEcf]         = useState('31');
  const [categoriaId, setCategoriaId] = useState('factura-venta');
  const regla = TIPO_ECF_REGLAS[tipoEcf];

  // Tipos e-CF disponibles para la categoría activa
  const categoriaActual  = CATEGORIAS_ECF.find(c => c.id === categoriaId) ?? CATEGORIAS_ECF[0];
  const tiposCategoria   = categoriaActual.tipos;

  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [rncManual, setRncManual]             = useState('');
  const [rncManualNombre, setRncManualNombre] = useState('');
  const [emailManual, setEmailManual]         = useState('');
  const [telefonoManual, setTelefonoManual]   = useState('');
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);

  // Plazos de pago
  const [plazoId, setPlazoId]               = useState('contado');
  const [customPlazos, setCustomPlazos]     = useState<Plazo[]>([]);
  const [showNuevoPlazo, setShowNuevoPlazo] = useState(false);
  const [npNombre, setNpNombre]             = useState('');
  const [npDias, setNpDias]                 = useState('');
  const [npError, setNpError]               = useState<string | null>(null);

  const [fechaEmision, setFechaEmision]       = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaLimitePago, setFechaLimitePago] = useState('');
  const [ncfModificado, setNcfModificado]     = useState('');

  const [items, setItems] = useState<ItemLinea[]>([itemVacio()]);
  const [showNuevoProductoIdx, setShowNuevoProductoIdx] = useState<number | null>(null);

  const [retenciones, setRetenciones]   = useState<Retencion[]>([]);

  // NCF gear modal
  const [showEditarNcf, setShowEditarNcf] = useState(false);
  const [ncfPieFactura, setNcfPieFactura] = useState('');
  const [ncfSiguienteNum, setNcfSiguienteNum] = useState('');
  const [ncfFechaVenc, setNcfFechaVenc] = useState('');

  const [notas, setNotas]               = useState('');
  const [terminosCondiciones, setTerminos] = useState('');
  const [pieFactura, setPieFactura]     = useState('');

  // Pago recibido
  const [pagoRecibido, setPagoRecibido] = useState(false);
  const [pagoFecha, setPagoFecha]       = useState(() => new Date().toISOString().slice(0, 10));
  const [pagoCuenta, setPagoCuenta]     = useState('');
  const [pagoMetodo, setPagoMetodo]     = useState('efectivo');
  const [pagoValor, setPagoValor]       = useState('');

  // Comentario interno
  const [comentario, setComentario]     = useState('');

  // Split guardar dropdown
  const [showGuardarMenu, setShowGuardarMenu] = useState(false);
  const guardarMenuRef = useRef<HTMLDivElement>(null);

  // NCF modal extras
  const [ncfSaving, setNcfSaving] = useState(false);
  const [ncfError,  setNcfError]  = useState<string | null>(null);

  // Enviar por correo modal
  const [showEnviarCorreo, setShowEnviarCorreo]       = useState(false);
  const [emailEnviar, setEmailEnviar]                 = useState('');
  const [emailSending, setEmailSending]               = useState(false);
  const [correoDocumentoId, setCorreoDocumentoId]     = useState<number | null>(null);
  const [correoEncf, setCorreoEncf]                   = useState<string>('');

  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEmision | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState(false);

  // ── TOP SECTION: Almacén / Lista de precios / Vendedor ──────────────────────
  const [showAlmacen, setShowAlmacen]               = useState(false);
  const [showListaPrecios, setShowListaPrecios]     = useState(false);
  const [showVendedor, setShowVendedor]             = useState(false);
  const [showPersonalizar, setShowPersonalizar]     = useState(false);
  const personalizarRef                             = useRef<HTMLDivElement>(null);

  const [almacenId, setAlmacenId]                   = useState<number | null>(null);
  const [almacenNombre, setAlmacenNombre]           = useState('');
  const [listaPreciosId, setListaPreciosId]         = useState<number | null>(null);
  const [listaPreciosNombre, setListaPreciosNombre] = useState('');
  const [vendedorId, setVendedorId]                 = useState<number | null>(null);
  const [vendedorNombre, setVendedorNombre]         = useState('');

  const [almacenes, setAlmacenes]                   = useState<{ id: number; nombre: string }[]>([]);
  const [listasPrecios, setListasPrecios]           = useState<{ id: number; nombre: string; tipo: string; porcentaje: number }[]>([]);
  const [vendedores, setVendedores]                 = useState<{ id: number; nombre: string }[]>([]);

  const [showNuevoAlmacen, setShowNuevoAlmacen]     = useState(false);
  const [showNuevaLista, setShowNuevaLista]         = useState(false);
  const [showNuevoVendedor, setShowNuevoVendedor]   = useState(false);

  // Próximo NCF
  const [secuencia, setSecuencia] = useState<SecuenciaInfo | null>(null);

  useEffect(() => {
    if (tipoEcf === 'sin-ncf') {
      setSecuencia({ encf: null, disponibles: 0, agotada: false, sinNcf: true });
      return;
    }
    setSecuencia(null);
    fetch(`/api/secuencias/proximo?tipo=${tipoEcf}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        setSecuencia(d);
        // Pre-poblar pie de factura desde la secuencia si no fue editado manualmente
        if (d.pieDeFactura) setPieFactura(d.pieDeFactura);
      })
      .catch(() => setSecuencia({ encf: null, disponibles: 0, agotada: false, sinSecuencia: true }));
  }, [tipoEcf]);

  // ── Load top-section data ─────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/almacenes').then(r => r.json()).then(d => setAlmacenes(d.almacenes ?? [])).catch(() => {});
    fetch('/api/listas-precios').then(r => r.json()).then(d => setListasPrecios(d.listasPrecios ?? [])).catch(() => {});
    fetch('/api/vendedores').then(r => r.json()).then(d => setVendedores(d.vendedores ?? [])).catch(() => {});
  }, []);

  // ── Load plazos personalizados + visibility prefs from localStorage ──────
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('emitedo:plazos') ?? '[]');
      if (Array.isArray(stored)) setCustomPlazos(stored);
    } catch {}
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      if (prefs.almacen)      setShowAlmacen(true);
      if (prefs.listaPrecios) setShowListaPrecios(true);
      if (prefs.vendedor)     setShowVendedor(true);
    } catch {}
  }, []);

  // ── Close "Personalizar" on outside click ─────────────────────────────────
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (personalizarRef.current && !personalizarRef.current.contains(e.target as Node)) {
        setShowPersonalizar(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  function toggleOpcion(key: string, value: boolean) {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      prefs[key] = value;
      localStorage.setItem('emitedo:facturaOpciones', JSON.stringify(prefs));
    } catch {}
  }

  // ── Apply lista de precios to items ───────────────────────────────────────
  useEffect(() => {
    if (!listaPreciosId) return;
    const lista = listasPrecios.find(l => l.id === listaPreciosId);
    if (!lista || lista.tipo !== 'porcentaje' || lista.porcentaje <= 0) return;
    setItems(prev => prev.map(item => {
      if (!item.productoId) return item;
      const factor    = lista.porcentaje / 10000;
      const nuevoPrecio = Math.round(item.precioUnitarioItem * (1 - factor) * 100) / 100;
      return { ...item, precioUnitarioItem: Math.max(0, nuevoPrecio) };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaPreciosId]);

  const today = new Date().toISOString().slice(0, 10);

  // ─── Búsqueda clientes ────────────────────────────────────────────────────

  async function buscarClientes(q: string): Promise<Cliente[]> {
    const res  = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.clientes ?? [];
  }

  function seleccionarCliente(c: Cliente) {
    setClienteSeleccionado(c);
    setRncManual(c.rnc ?? '');
    setRncManualNombre('');
    setEmailManual(c.email ?? '');
    setTelefonoManual(c.telefono ?? '');
  }

  function limpiarCliente() {
    setClienteSeleccionado(null);
    setRncManual('');
    setRncManualNombre('');
    setEmailManual('');
    setTelefonoManual('');
  }

  // ─── Búsqueda productos ───────────────────────────────────────────────────

  async function buscarProductos(q: string): Promise<Producto[]> {
    const res  = await fetch(`/api/productos?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.productos ?? [];
  }

  function seleccionarProducto(idx: number, p: Producto) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const tasa = (p.tasaItbis as ItemLinea['tasaItbis']) ?? '0.18';
      return {
        ...item,
        productoId: p.id,
        nombreItem: p.nombre,
        referencia: p.referencia ?? '',
        descripcionItem: p.descripcion ?? '',
        precioUnitarioItem: p.precioDOP,
        tasaItbis: regla?.permiteItbis ? tasa : 'exento',
        indicadorBienoServicio: p.tipo === 'bien' ? '1' : '2',
        unidadMedida: (p as any).unidad ?? '',
      };
    }));
  }

  // ─── Cambio de tipo ───────────────────────────────────────────────────────

  function handleChangeTipo(t: string) {
    setTipoEcf(t);
    limpiarCliente();
    setNcfModificado('');
    setError(null);
    const r = TIPO_ECF_REGLAS[t];
    if (!r?.permiteItbis) setItems((prev) => prev.map((i) => ({ ...i, tasaItbis: 'exento' })));
    const todosPlazos = [...PLAZOS_BASE, ...customPlazos];
    const plazoAct    = todosPlazos.find(p => p.id === plazoId) ?? PLAZOS_BASE[0];
    if (r?.tiposPagoPermitidos && !r.tiposPagoPermitidos.includes(plazoAct.dgiiTipo)) {
      const primer = PLAZOS_BASE.find(p => r.tiposPagoPermitidos!.includes(p.dgiiTipo));
      setPlazoId(primer?.id ?? 'contado');
      setFechaLimitePago('');
    }
  }

  // ─── Items ────────────────────────────────────────────────────────────────

  function addItem() { setItems((p) => [...p, itemVacio()]); }
  function removeItem(id: number) { setItems((p) => p.filter((i) => i.id !== id)); }
  function updateItem(id: number, field: keyof ItemLinea, value: string | number) {
    setItems((p) => p.map((i) => i.id === id ? { ...i, [field]: value } : i));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function resetForm() {
    setClienteSeleccionado(null);
    setRncManual(''); setRncManualNombre(''); setEmailManual(''); setTelefonoManual('');
    setPlazoId('contado'); setFechaEmision(new Date().toISOString().slice(0, 10)); setFechaLimitePago(''); setNcfModificado('');
    setItems([itemVacio()]);
    setRetenciones([]);
    setNotas(''); setTerminos(''); setPieFactura('');
    setPagoRecibido(false); setPagoFecha(new Date().toISOString().slice(0, 10));
    setPagoCuenta(''); setPagoMetodo('efectivo'); setPagoValor('');
    setComentario('');
    setAlmacenId(null); setAlmacenNombre('');
    setListaPreciosId(null); setListaPreciosNombre('');
    setVendedorId(null); setVendedorNombre('');
    setError(null);
    setSecuencia(null);
    // Reload sequence
    fetch(`/api/secuencias/proximo?tipo=${tipoEcf}`).then(r => r.json()).then(setSecuencia).catch(() => {});
  }

  function buildPayload(modo: 'emitir' | 'borrador') {
    const rncFinal   = clienteSeleccionado?.rnc ?? rncManual;
    const razonFinal = clienteSeleccionado?.razonSocial ?? rncManualNombre;
    const emailFinal = clienteSeleccionado?.email ?? emailManual;
    return {
      modo,
      tipoEcf,
      fechaEmision,
      rncComprador:         rncFinal    || undefined,
      razonSocialComprador: razonFinal  || undefined,
      emailComprador:       emailFinal  || undefined,
      tipoPago:             ([...PLAZOS_BASE, ...customPlazos].find(p => p.id === plazoId) ?? PLAZOS_BASE[0]).dgiiTipo,
      fechaLimitePago:      fechaLimitePago || undefined,
      ncfModificado:        ncfModificado || undefined,
      items: items
        .filter(i => i.nombreItem.trim() && i.cantidadItem > 0 && i.precioUnitarioItem > 0)
        .map((item) => {
          const base = item.precioUnitarioItem * item.cantidadItem;
          const descuentoMonto = base * (item.descuentoPct / 100);
          return {
            nombreItem:             item.nombreItem,
            descripcionItem:        item.descripcionItem || undefined,
            cantidadItem:           item.cantidadItem,
            precioUnitarioItem:     item.precioUnitarioItem,
            descuentoMonto:         item.descuentoPct > 0 ? descuentoMonto : undefined,
            tasaItbis:              tasaToFloat(item.tasaItbis),
            indicadorBienoServicio: parseInt(item.indicadorBienoServicio) as 1 | 2,
          };
        }),
      // Campos extra
      retenciones:         retenciones.length ? retenciones : undefined,
      notas:               notas.trim()               || undefined,
      terminosCondiciones: terminosCondiciones.trim()  || undefined,
      pieFactura:          pieFactura.trim()            || undefined,
      comentario:          comentario.trim()            || undefined,
      // Pago recibido
      pagoRecibido: pagoRecibido || undefined,
      pagoMetodo:   pagoRecibido ? pagoMetodo    : undefined,
      pagoCuenta:   pagoRecibido ? pagoCuenta    : undefined,
      pagoValor:    pagoRecibido && pagoValor ? parseFloat(pagoValor) : undefined,
      pagoFecha:    pagoRecibido ? pagoFecha     : undefined,
      // Top section
      almacenId:      almacenId      || undefined,
      listaPreciosId: listaPreciosId || undefined,
      vendedorId:     vendedorId     || undefined,
    };
  }

  // ─── Plazo de pago ────────────────────────────────────────────────────────

  function handlePlazoChange(id: string) {
    if (id === 'nuevo') {
      setNpNombre(''); setNpDias(''); setNpError(null);
      setShowNuevoPlazo(true);
      return;
    }
    setPlazoId(id);
    const plazo = [...PLAZOS_BASE, ...customPlazos].find(p => p.id === id);
    if (plazo?.dias != null) {
      const d = new Date(fechaEmision);
      d.setDate(d.getDate() + plazo.dias);
      setFechaLimitePago(d.toISOString().slice(0, 10));
    } else if (!plazo?.esManual) {
      setFechaLimitePago('');
    }
  }

  function handleGuardarNuevoPlazo() {
    const nombre = npNombre.trim();
    const dias   = parseInt(npDias);
    if (!nombre)                          { setNpError('El nombre es obligatorio'); return; }
    if (isNaN(dias) || dias < 1 || dias > 365) { setNpError('Los días deben ser entre 1 y 365'); return; }

    const id = `custom_${Date.now()}`;
    const nuevo: Plazo = { id, label: nombre, dgiiTipo: 2, dias, custom: true };
    const updated = [...customPlazos, nuevo];
    setCustomPlazos(updated);
    try { localStorage.setItem('emitedo:plazos', JSON.stringify(updated)); } catch {}

    // Seleccionar el nuevo plazo y calcular fecha
    setPlazoId(id);
    const d = new Date(fechaEmision);
    d.setDate(d.getDate() + dias);
    setFechaLimitePago(d.toISOString().slice(0, 10));
    setShowNuevoPlazo(false);
  }

  function validar(): string | null {
    const rncFinal   = clienteSeleccionado?.rnc ?? rncManual;
    const razonFinal = clienteSeleccionado?.razonSocial ?? rncManualNombre;
    if (regla?.requiereRncComprador && !rncFinal.trim())
      return `El ${regla.rncLabel} es obligatorio para este tipo de comprobante`;
    if (regla?.requiereRazonSocial && !razonFinal.trim())
      return `La razón social del ${regla.compradorLabel} es obligatoria`;
    if (regla?.requiereNcfModificado && !ncfModificado.trim())
      return 'Debes indicar el e-NCF original que se modifica';
    const totales = calcularTotales(items);
    if (tipoEcf === '32' && totales.total >= 250000 && !rncFinal.trim())
      return 'Factura de Consumo ≥ DOP 250,000 requiere RNC o cédula del comprador';
    if (items.every((i) => !i.nombreItem.trim()))
      return 'Agrega al menos un ítem con nombre';
    if (items.filter(i => i.nombreItem.trim()).every(i => i.precioUnitarioItem <= 0))
      return 'Los ítems deben tener un precio mayor a 0';
    return null;
  }

  async function emitir(modo: 'emitir' | 'borrador', opts?: { andThen?: 'nueva' | 'imprimir' | 'correo' }) {
    const err = modo === 'borrador' ? (items.every(i => !i.nombreItem.trim()) ? 'Agrega al menos un ítem' : null) : validar();
    if (err) { setError(err); return; }
    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/ecf/emitir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload(modo)) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return; }
      if (opts?.andThen === 'nueva') {
        resetForm();
        return;
      }
      if (opts?.andThen === 'imprimir' && data.documentoId) {
        setResultado(data);
        window.open(`/api/pdf/factura/${data.documentoId}`, '_blank');
        return;
      }
      if (opts?.andThen === 'correo') {
        setResultado(data);
        setCorreoDocumentoId(data.documentoId);
        setCorreoEncf(data.encf ?? '');
        setEmailEnviar(emailManual || clienteSeleccionado?.email || '');
        setShowEnviarCorreo(true);
        return;
      }
      setResultado(data);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Submit (botón principal Guardar) ─────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await emitir('emitir');
  }

  // ─── Guardar NCF modal ────────────────────────────────────────────────────

  async function handleGuardarNcf() {
    if (!secuencia?.id) return;
    setNcfSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (ncfSiguienteNum) body.siguiente      = parseInt(ncfSiguienteNum);
      if (ncfFechaVenc)    body.fechaVencimiento = ncfFechaVenc;
      // Siempre incluir pieDeFactura (permite borrar si el usuario lo vació)
      body.pieDeFactura = ncfPieFactura.trim() || null;

      const res = await fetch(`/api/secuencias/${secuencia.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setNcfError(data.error ?? 'Error al guardar'); return; }
      setShowEditarNcf(false);
      // Recargar secuencia (actualiza también pieDeFactura y pieFactura del form)
      fetch(`/api/secuencias/proximo?tipo=${tipoEcf}`)
        .then(r => r.json())
        .then(d => {
          setSecuencia(d);
          if (d.pieDeFactura) setPieFactura(d.pieDeFactura);
        })
        .catch(() => {});
    } catch {
      setNcfError('Error de conexión');
    } finally {
      setNcfSaving(false);
    }
  }

  const totales = calcularTotales(items);
  const totalRetenciones = retenciones.reduce((s, r) => s + r.monto, 0);
  const totalNeto = totales.total - totalRetenciones;
  const plazosDisponibles = [...PLAZOS_BASE, ...customPlazos].filter(
    p => !regla?.tiposPagoPermitidos || regla.tiposPagoPermitidos.includes(p.dgiiTipo)
  );
  const plazoActual = plazosDisponibles.find(p => p.id === plazoId) ?? plazosDisponibles[0];

  // ─── Pantalla de éxito ────────────────────────────────────────────────────

  if (resultado) {
    return (
      <div className="bg-[#eef0f7] min-h-full p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-md p-8 text-center">
            <CheckCircle className="h-16 w-16 text-teal-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Comprobante emitido!</h2>
            <p className="text-gray-500 mb-6">Tu e-CF fue enviado a la DGII exitosamente.</p>
            <div className="bg-gray-50 rounded-xl p-6 text-left space-y-3 border border-gray-100 mb-6">
              <div className="flex justify-between"><span className="text-sm text-gray-500">e-NCF</span><span className="font-mono font-bold">{resultado.encf}</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">Track ID</span><span className="font-mono text-sm">{resultado.trackId}</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">Código de seguridad</span><span className="font-mono font-bold text-teal-700 text-lg">{resultado.codigoSeguridad}</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">Monto total</span><span className="font-bold">DOP {(resultado.montoTotal ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between items-center"><span className="text-sm text-gray-500">Estado</span><Badge variant="outline">{resultado.estado}</Badge></div>
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" asChild><a href={`/api/pdf/factura/${resultado.documentoId}`} target="_blank" rel="noreferrer">Descargar PDF</a></Button>
              <Button variant="outline" asChild><Link href={`/dashboard/facturas/${resultado.documentoId}`}>Ver detalle</Link></Button>
              <Button variant="outline" onClick={() => { setResultado(null); setItems([itemVacio()]); limpiarCliente(); }}>Emitir otro</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => router.push('/dashboard/facturas')}>Ver todos</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Formulario ───────────────────────────────────────────────────────────

  return (
    <div className="bg-[#eef0f7] min-h-full">
      <div className="p-6">

        {/* Back nav */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" asChild className="text-gray-600 hover:text-gray-900">
            <Link href="/dashboard/facturas">
              <ArrowLeft className="h-4 w-4 mr-1" />Volver
            </Link>
          </Button>
          <h1 className="text-lg font-semibold text-gray-700">Nueva factura</h1>

          {/* Personalizar opciones */}
          <div className="relative ml-auto" ref={personalizarRef}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex items-center gap-2 text-sm"
              onClick={() => setShowPersonalizar(v => !v)}
            >
              <Settings className="h-4 w-4" />
              Personalizar opciones
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
            {showPersonalizar && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4 w-52">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Opciones disponibles</p>
                {[
                  { key: 'almacen',     label: 'Almacén',         state: showAlmacen,      setter: setShowAlmacen },
                  { key: 'listaPrecios', label: 'Lista de Precio', state: showListaPrecios, setter: setShowListaPrecios },
                  { key: 'vendedor',    label: 'Vendedor',         state: showVendedor,     setter: setShowVendedor },
                ].map(({ key, label, state, setter }) => (
                  <label key={key} className="flex items-center justify-between py-2 cursor-pointer hover:bg-gray-50 rounded px-2 -mx-2">
                    <span className="text-sm text-gray-700">{label}</span>
                    <input
                      type="checkbox"
                      checked={state}
                      onChange={e => {
                        setter(e.target.checked);
                        toggleOpcion(key, e.target.checked);
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* ── TOP OPTIONS: Almacén / Lista de precios / Vendedor ─────── */}
          {(showAlmacen || showListaPrecios || showVendedor) && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 mb-4">
              <div className="flex items-center gap-8">
                {showAlmacen && (
                  <div className="space-y-1 min-w-[160px]">
                    <Label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Almacén</Label>
                    <Select
                      value={almacenId?.toString() ?? ''}
                      onValueChange={(v) => {
                        if (v === '__nuevo') { setShowNuevoAlmacen(true); return; }
                        const alm = almacenes.find(a => a.id.toString() === v);
                        setAlmacenId(alm?.id ?? null);
                        setAlmacenNombre(alm?.nombre ?? '');
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {almacenes.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.nombre}</SelectItem>)}
                        <SelectItem value="__nuevo" className="text-teal-700 font-medium">+ Nuevo almacén</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {showListaPrecios && (
                  <div className="space-y-1 min-w-[160px]">
                    <Label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Lista de precios</Label>
                    <Select
                      value={listaPreciosId?.toString() ?? '__none'}
                      onValueChange={(v) => {
                        if (v === '__nuevo') { setShowNuevaLista(true); return; }
                        if (v === '__none') { setListaPreciosId(null); setListaPreciosNombre(''); return; }
                        const lista = listasPrecios.find(l => l.id.toString() === v);
                        setListaPreciosId(lista?.id ?? null);
                        setListaPreciosNombre(lista?.nombre ?? '');
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="General" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">General</SelectItem>
                        {listasPrecios.map(l => (
                          <SelectItem key={l.id} value={l.id.toString()}>
                            {l.nombre}{l.tipo === 'porcentaje' && l.porcentaje > 0 ? ` (${(l.porcentaje / 100).toFixed(2)}%)` : ''}
                          </SelectItem>
                        ))}
                        <SelectItem value="__nuevo" className="text-teal-700 font-medium">+ Nueva lista</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {showVendedor && (
                  <div className="space-y-1 min-w-[160px]">
                    <Label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Vendedor</Label>
                    <Select
                      value={vendedorId?.toString() ?? ''}
                      onValueChange={(v) => {
                        if (v === '__nuevo') { setShowNuevoVendedor(true); return; }
                        const ven = vendedores.find(v2 => v2.id.toString() === v);
                        setVendedorId(ven?.id ?? null);
                        setVendedorNombre(ven?.nombre ?? '');
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Buscar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {vendedores.map(v => <SelectItem key={v.id} value={v.id.toString()}>{v.nombre}</SelectItem>)}
                        <SelectItem value="__nuevo" className="text-teal-700 font-medium">+ Nuevo vendedor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── WHITE DOCUMENT CARD ─────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

            {/* ── HEADER: Logo + Company + Tipo + NCF ────────────────────── */}
            <div className="px-8 pt-8 pb-6 flex items-start justify-between gap-6">
              {/* Logo + company name */}
              <div className="flex items-center gap-4">
                {empresa?.logo ? (
                  <img
                    src={empresa.logo}
                    alt="Logo"
                    className="h-[45px] max-w-[140px] object-contain shrink-0"
                  />
                ) : (
                  <a
                    href="/dashboard/configuracion"
                    className="w-[140px] h-[45px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-teal-400 transition-colors shrink-0"
                    title="Subir logo en Configuración"
                  >
                    <span className="text-[10px] text-gray-400 text-center leading-tight px-1">
                      Colocar mi logo<br />178 x 51 pixeles
                    </span>
                  </a>
                )}
                <div>
                  <p className="text-xl font-semibold text-gray-800">
                    {empresa?.nombreComercial ?? empresa?.razonSocial ?? 'Tu empresa'}
                  </p>
                  {empresa?.rnc && (
                    <p className="text-xs text-gray-400 mt-0.5">RNC: {empresa.rnc}</p>
                  )}
                </div>
              </div>

              {/* Tipo eCF dropdown + NCF */}
              <div className="text-right shrink-0">
                {/* Nivel 1: Tipo de documento (categoría) */}
                <Select
                  value={categoriaId}
                  onValueChange={(catId) => {
                    const cat = CATEGORIAS_ECF.find(c => c.id === catId) ?? CATEGORIAS_ECF[0];
                    setCategoriaId(catId);
                    handleChangeTipo(cat.tipos[0].codigo);
                  }}
                >
                  <SelectTrigger className="w-auto ml-auto border-0 bg-transparent text-gray-400 hover:text-gray-600 text-xs h-6 pr-1 shadow-none focus:ring-0 justify-end gap-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {CATEGORIAS_ECF.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Nivel 2: Tipo e-NCF (filtrado por categoría) */}
                <Select value={tipoEcf} onValueChange={handleChangeTipo}>
                  <SelectTrigger className="w-auto ml-auto border-0 bg-transparent text-teal-700 font-medium text-sm h-7 pr-1 shadow-none focus:ring-0 justify-end gap-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {tiposCategoria.map(t => (
                      <SelectItem key={t.codigo} value={t.codigo}>{t.etiqueta}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 justify-end mt-1">
                  {!secuencia?.sinNcf && (
                    <span className="text-2xl font-bold text-gray-800 tracking-tight">NCF</span>
                  )}
                  {secuencia === null ? (
                    <span className="font-mono text-xl text-gray-300 animate-pulse">Cargando…</span>
                  ) : secuencia.sinNcf ? (
                    <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded px-2 py-0.5 font-medium">Numeración automática · Sin comprobante fiscal</span>
                  ) : secuencia.encf ? (
                    <span className="font-mono text-xl text-gray-800 font-bold">{secuencia.encf}</span>
                  ) : secuencia.sinSecuencia ? (
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Sin secuencias — configura en Secuencias NCF</span>
                  ) : secuencia.agotada ? (
                    <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">Secuencias agotadas</span>
                  ) : secuencia.vencida ? (
                    <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">Secuencias vencidas</span>
                  ) : (
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Sin secuencias disponibles</span>
                  )}
                  {!secuencia?.sinNcf && (
                    <button type="button" onClick={() => {
                      setNcfSiguienteNum('');
                      setNcfFechaVenc(secuencia?.fechaVencimiento ? secuencia.fechaVencimiento.slice(0, 10) : '');
                      setNcfPieFactura(secuencia?.pieDeFactura ?? '');
                      setNcfError(null);
                      setShowEditarNcf(true);
                    }} className="text-gray-400 hover:text-gray-600 ml-0.5">
                      <Settings className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {secuencia?.disponibles !== undefined && secuencia.disponibles < 50 && secuencia.disponibles > 0 && (
                  <p className="text-xs text-amber-500 mt-0.5 text-right">{secuencia.disponibles} NCF restantes</p>
                )}
              </div>
            </div>

            {/* ── CLIENT + DATES ─────────────────────────────────────────── */}
            <div className="px-8 pb-6 grid grid-cols-2 gap-8 border-b border-gray-100">

              {/* LEFT: client */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Autocomplete<Cliente>
                      placeholder="Buscar..."
                      value={clienteSeleccionado?.razonSocial ?? ''}
                      onSearch={buscarClientes}
                      onSelect={seleccionarCliente}
                      onClear={limpiarCliente}
                      onCreate={() => setShowNuevoCliente(true)}
                      createLabel="Nuevo contacto"
                      renderOption={(c) => (
                        <div>
                          <p className="font-medium">{c.razonSocial}</p>
                          <p className="text-xs text-gray-400">{[c.rnc, c.email].filter(Boolean).join(' · ')}</p>
                        </div>
                      )}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNuevoCliente(true)}
                    className="text-teal-600 hover:text-teal-800 text-sm font-medium whitespace-nowrap flex items-center gap-1 transition-colors">
                    <Plus className="h-3.5 w-3.5" />Nuevo contacto
                  </button>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <Label className="text-xs text-gray-400 uppercase tracking-wide">
                      {regla?.rncLabel ?? 'RNC o Cédula'}
                      {regla?.requiereRncComprador && <span className="text-red-500 ml-0.5">*</span>}
                    </Label>
                    <RncSearch
                      className="mt-1"
                      placeholder="Buscar RNC, Cédula o razón social…"
                      value={
                        clienteSeleccionado?.rnc
                          ? `${clienteSeleccionado.rnc} · ${clienteSeleccionado.razonSocial}`
                          : rncManual
                            ? `${rncManual}${rncManualNombre ? ` · ${rncManualNombre}` : ''}`
                            : undefined
                      }
                      onSelect={(r) => { setRncManual(r.rnc); setRncManualNombre(r.nombre); }}
                      onClear={() => {
                        if (clienteSeleccionado) limpiarCliente();
                        else { setRncManual(''); setRncManualNombre(''); }
                      }}
                      showSyncHint={!clienteSeleccionado}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400 uppercase tracking-wide">Teléfono</Label>
                    <Input
                      className="mt-1 h-9"
                      placeholder="___-___-____"
                      value={telefonoManual}
                      onChange={(e) => setTelefonoManual(e.target.value)}
                    />
                  </div>
                </div>

                {!clienteSeleccionado && (
                  <div>
                    <Label className="text-xs text-gray-400 uppercase tracking-wide">Email (para envío)</Label>
                    <Input className="mt-1 h-9" type="email" placeholder="facturacion@empresa.com" value={emailManual} onChange={(e) => setEmailManual(e.target.value)} />
                  </div>
                )}

                {tipoEcf === '32' && totales.total >= 200000 && (
                  <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{totales.total >= 250000 ? 'DOP 250,000+: datos del comprador OBLIGATORIOS.' : 'Al superar DOP 250,000 los datos del comprador serán obligatorios.'}</span>
                  </div>
                )}

                {regla?.requiereNcfModificado && (
                  <div>
                    <Label className="text-xs text-gray-400 uppercase tracking-wide">e-NCF que se modifica <span className="text-red-500">*</span></Label>
                    <Input className="mt-1 h-9" placeholder="E310000000001" value={ncfModificado} onChange={(e) => setNcfModificado(e.target.value.toUpperCase())} maxLength={13} />
                  </div>
                )}
              </div>

              {/* RIGHT: dates */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-400 uppercase tracking-wide">Fecha <span className="text-red-500">*</span></Label>
                  <Input
                    className="mt-1 h-9"
                    type="date"
                    value={fechaEmision}
                    onChange={(e) => setFechaEmision(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-400 uppercase tracking-wide">Plazo de pago</Label>
                  <Select value={plazoId} onValueChange={handlePlazoChange}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {plazosDisponibles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                      <SelectItem value="nuevo" className="text-teal-600 font-medium border-t border-gray-100 mt-1">
                        + Nuevo plazo
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(plazoActual?.esManual || (plazoActual?.dias != null)) && (
                  <div>
                    <Label className="text-xs text-gray-400 uppercase tracking-wide">
                      Vencimiento {plazoActual?.esManual && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      type="date"
                      value={fechaLimitePago}
                      onChange={(e) => setFechaLimitePago(e.target.value)}
                      min={today}
                      className="mt-1 h-9"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ── LINE ITEMS TABLE ─────────────────────────────────────────── */}
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
                        {/* Producto */}
                        <td className="px-4 py-2">
                          <Autocomplete<Producto>
                            placeholder="Buscar producto o servicio..."
                            value={item.nombreItem}
                            onSearch={buscarProductos}
                            onSelect={(p) => seleccionarProducto(idx, p)}
                            onClear={() => updateItem(item.id, 'nombreItem', '')}
                            onCreate={() => setShowNuevoProductoIdx(idx)}
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
                        {/* Referencia */}
                        <td className="px-2 py-2">
                          <Input
                            className="h-9 text-sm"
                            placeholder="Ref."
                            value={item.referencia}
                            onChange={(e) => updateItem(item.id, 'referencia', e.target.value)}
                          />
                        </td>
                        {/* Precio */}
                        <td className="px-2 py-2">
                          <Input
                            type="number" min={0} step={0.01}
                            value={item.precioUnitarioItem || ''}
                            placeholder="0.00"
                            onChange={(e) => updateItem(item.id, 'precioUnitarioItem', parseFloat(e.target.value) || 0)}
                            className="h-9 text-sm text-right"
                          />
                        </td>
                        {/* Desc % */}
                        <td className="px-2 py-2">
                          <div className="relative">
                            <Input
                              type="number" min={0} max={100} step={0.1}
                              value={item.descuentoPct || ''}
                              placeholder="0"
                              onChange={(e) => updateItem(item.id, 'descuentoPct', parseFloat(e.target.value) || 0)}
                              className="h-9 text-sm text-center pr-5"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                          </div>
                        </td>
                        {/* Impuesto */}
                        <td className="px-2 py-2">
                          <Select
                            value={item.tasaItbis}
                            onValueChange={(v) => updateItem(item.id, 'tasaItbis', v)}
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
                        {/* Descripción */}
                        <td className="px-2 py-2">
                          <textarea
                            className="w-full h-[68px] text-sm border border-gray-200 rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
                            placeholder="Descripción..."
                            value={item.descripcionItem}
                            onChange={(e) => updateItem(item.id, 'descripcionItem', e.target.value)}
                          />
                        </td>
                        {/* Cantidad */}
                        <td className="px-2 py-2">
                          <Input
                            type="number" min={0.01} step="any"
                            value={item.cantidadItem}
                            onChange={(e) => updateItem(item.id, 'cantidadItem', parseFloat(e.target.value) || 1)}
                            className="h-9 text-sm text-center"
                          />
                        </td>
                        {/* Total */}
                        <td className="px-2 py-2 text-right">
                          <div className="h-9 flex items-center justify-end text-sm font-medium text-gray-700">
                            RD$ {calcularMontoItem(item).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                          </div>
                        </td>
                        {/* Delete */}
                        <td className="px-2 py-2">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
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

              {/* Add line + extra buttons */}
              <div className="px-4 py-3 flex items-center justify-between border-t border-gray-50">
                <button
                  type="button"
                  onClick={addItem}
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

            {/* ── RETENCIONES SECTION ────────────────────────────────────── */}
            {(retenciones.length > 0) && (
              <div className="px-8 py-4 border-b border-gray-100 bg-gray-50/40">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Retenciones</p>
                <div className="space-y-2">
                  {retenciones.map((ret, idx) => {
                    const base = ret.tipo === 'itbis' ? totales.itbis : totales.subtotal;
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 w-24 shrink-0">Retención</span>
                        <Select
                          value={`${ret.id}__${idx}`}
                          onValueChange={(val) => {
                            const predef = RETENCIONES_PREDEFINIDAS.find(r => r.id === val.split('__')[0]);
                            if (!predef) return;
                            const base2 = predef.tipo === 'itbis' ? totales.itbis : totales.subtotal;
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
                          <SelectTrigger className="h-9 text-sm flex-1 max-w-xs">
                            <SelectValue placeholder="Seleccionar retención..." />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase">ITBIS</div>
                            {RETENCIONES_PREDEFINIDAS.filter(r => r.tipo === 'itbis').map(r => (
                              <SelectItem key={r.id} value={`${r.id}__${idx}`}>
                                {r.nombre} — {r.porcentaje}% <span className="text-xs text-gray-400 ml-1">({r.descripcion})</span>
                              </SelectItem>
                            ))}
                            <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase border-t mt-1">ISR</div>
                            {RETENCIONES_PREDEFINIDAS.filter(r => r.tipo === 'isr').map(r => (
                              <SelectItem key={r.id} value={`${r.id}__${idx}`}>
                                {r.nombre} — {r.porcentaje}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="relative w-36 shrink-0">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">RD$</span>
                          <Input
                            type="number" min={0} step={0.01}
                            className="h-9 text-sm pl-9 text-right"
                            placeholder="0.00"
                            value={ret.monto || ''}
                            onChange={(e) => setRetenciones(prev => prev.map((r, i) => i === idx ? { ...r, monto: parseFloat(e.target.value) || 0, manual: true } : r))}
                          />
                        </div>
                        <button type="button" onClick={() => setRetenciones(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 p-1">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const predef = RETENCIONES_PREDEFINIDAS[0];
                    const base2 = predef.tipo === 'itbis' ? totales.itbis : totales.subtotal;
                    setRetenciones(prev => [...prev, {
                      id: predef.id, nombre: predef.nombre, porcentaje: predef.porcentaje,
                      tipo: predef.tipo, monto: parseFloat((base2 * predef.porcentaje / 100).toFixed(2)), manual: false,
                    }]);
                  }}
                  className="mt-2 text-sm text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1">
                  + Agregar Retención
                </button>
              </div>
            )}

            {/* ── ADD RETENCIÓN LINK (when none yet) ──────────────────────── */}
            {retenciones.length === 0 && (
              <div className="px-8 py-3 border-b border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const predef = RETENCIONES_PREDEFINIDAS[0];
                    const base2 = predef.tipo === 'itbis' ? totales.itbis : totales.subtotal;
                    setRetenciones([{
                      id: predef.id, nombre: predef.nombre, porcentaje: predef.porcentaje,
                      tipo: predef.tipo, monto: parseFloat((base2 * predef.porcentaje / 100).toFixed(2)), manual: false,
                    }]);
                  }}
                  className="text-sm text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1">
                  + Agregar Retención
                </button>
              </div>
            )}

            {/* ── FIRMA + TOTALS ─────────────────────────────────────────── */}
            <div className="px-8 py-6 flex items-start justify-between border-b border-gray-100">
              {/* Firma */}
              {empresa?.firma ? (
                <img
                  src={empresa.firma}
                  alt="Firma autorizada"
                  className="w-[178px] h-[51px] object-contain shrink-0"
                />
              ) : (
                <a
                  href="/dashboard/configuracion"
                  className="w-[178px] h-[51px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-teal-400 transition-colors shrink-0 group"
                  title="Agregar firma en Configuración"
                >
                  <span className="text-[10px] text-gray-400 group-hover:text-teal-500 text-center leading-tight px-2 transition-colors">
                    Agregar firma<br />en Configuración
                  </span>
                </a>
              )}

              {/* Totals */}
              <div className="w-72 space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>RD$ {totales.bruto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                </div>
                {totales.descuento > 0 && (
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Descuento</span>
                    <span>-RD$ {totales.descuento.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {totales.itbis > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>ITBIS</span>
                    <span>RD$ {totales.itbis.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                {/* Retenciones en totals */}
                {retenciones.map((ret, idx) => (
                  <div key={idx} className="flex justify-between text-sm text-red-500">
                    <span>{ret.nombre} ({ret.porcentaje}%)</span>
                    <span>-RD$ {ret.monto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}

                <div className="flex justify-between text-xl font-bold text-gray-900 border-t border-gray-200 pt-3 mt-1">
                  <span>Total</span>
                  <span>RD$ {totalNeto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* ── TÉRMINOS + NOTAS ─────────────────────────────────────────── */}
            <div className="px-8 py-6 grid grid-cols-2 gap-6 border-b border-gray-100">
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-1 block">Términos y condiciones</Label>
                <p className="text-xs text-gray-400 mb-2">Visible en la impresión del documento</p>
                <textarea
                  className="w-full min-h-[100px] text-sm border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
                  placeholder="Ej: Pago en cuenta corriente 000000001..."
                  value={terminosCondiciones}
                  onChange={(e) => setTerminos(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-1 block">Notas</Label>
                <p className="text-xs text-gray-400 mb-2">&nbsp;</p>
                <textarea
                  className="w-full min-h-[100px] text-sm border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
                  placeholder="Notas internas o para el cliente..."
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  maxLength={500}
                />
                {notas.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1 text-right">{notas.length}/500</p>
                )}
              </div>
            </div>

            {/* ── PIE DE FACTURA ───────────────────────────────────────────── */}
            <div className="px-8 py-6 border-b border-gray-100">
              <Label className="text-sm font-medium text-gray-700 mb-1 block">Pie de factura</Label>
              <textarea
                className="w-full min-h-[80px] text-sm border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
                placeholder="Visible en la impresión del documento"
                value={pieFactura}
                onChange={(e) => setPieFactura(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-2">
                Los campos marcados con <span className="text-teal-600 font-medium">*</span> son obligatorios
              </p>
            </div>
          </div>

          {/* ── PAGO RECIBIDO ────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Pago recibido</h3>
                <p className="text-xs text-gray-500 mt-0.5">Si te hicieron un pago asociado a esta venta puedes hacer aquí su registro.</p>
              </div>
              {!pagoRecibido ? (
                <button
                  type="button"
                  onClick={() => setPagoRecibido(true)}
                  className="flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors">
                  <DollarSign className="h-4 w-4" />
                  Agregar pago
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPagoRecibido(false)}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                  Quitar pago
                </button>
              )}
            </div>

            {pagoRecibido && (
              <div className="px-6 pb-6 border-t border-gray-100">
                {/* Cabecera tabla */}
                <div className="grid grid-cols-5 gap-3 mb-2 mt-4">
                  {['Numeración', 'Fecha', 'Cuenta bancaria', 'Método de pago', 'Valor'].map(h => (
                    <p key={h} className="text-xs font-medium text-gray-500">{h}</p>
                  ))}
                </div>
                {/* Fila de inputs */}
                <div className="grid grid-cols-5 gap-3 items-center">
                  {/* Numeración */}
                  <Select defaultValue="recibo">
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recibo">Recibo de caja</SelectItem>
                      <SelectItem value="orden">Orden de pago</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Fecha */}
                  <Input
                    type="date"
                    className="h-9 text-sm"
                    value={pagoFecha}
                    onChange={(e) => setPagoFecha(e.target.value)}
                  />
                  {/* Cuenta bancaria */}
                  <Input
                    className="h-9 text-sm"
                    placeholder="Seleccionar"
                    value={pagoCuenta}
                    onChange={(e) => setPagoCuenta(e.target.value)}
                  />
                  {/* Método de pago */}
                  <Select value={pagoMetodo} onValueChange={setPagoMetodo}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="transferencia">Transferencia bancaria</SelectItem>
                      <SelectItem value="tarjeta_credito">Tarjeta de crédito</SelectItem>
                      <SelectItem value="tarjeta_debito">Tarjeta de débito</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Valor */}
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">RD$</span>
                    <Input
                      type="number" min={0} step={0.01}
                      className="h-9 text-sm pl-10"
                      placeholder="0.00"
                      value={pagoValor}
                      onChange={(e) => setPagoValor(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── COMENTARIOS ──────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-semibold text-gray-800">Comentarios</h3>
              </div>
            </div>
            <div className="px-6 pb-5">
              <textarea
                className="w-full min-h-[80px] text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-400"
                placeholder="Escribe un comentario"
                maxLength={280}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-400">{comentario.length}/280</p>
                {comentario.trim() && (
                  <Button
                    type="button" size="sm"
                    className="bg-teal-600 hover:bg-teal-700 text-white h-8 text-xs"
                    onClick={() => {
                      // El comentario se guarda junto al documento al emitir.
                      // Si quisiéramos guardarlo de forma independiente, haría falta
                      // un endpoint separado. Por ahora se incluye en el payload de emisión.
                    }}>
                    Comentar
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* ── BOTTOM ACTION BAR ────────────────────────────────────────── */}
          <div className="flex items-center justify-between mt-6 pb-8">
            <Button type="button" variant="outline" asChild className="text-gray-600">
              <Link href="/dashboard/facturas">Cancelar</Link>
            </Button>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                className="text-gray-600"
                onClick={() => setVistaPrevia(true)}>
                Vista previa
              </Button>

              {/* Guardar y crear nueva */}
              <Button
                type="button"
                variant="outline"
                disabled={loading || items.every((i) => !i.nombreItem.trim())}
                className="text-gray-700 border-gray-300 hover:bg-gray-50"
                onClick={() => emitir('emitir', { andThen: 'nueva' })}>
                Guardar y crear nueva
              </Button>

              {/* Split Guardar */}
              <div ref={guardarMenuRef} className="relative flex">
                <Button
                  type="submit"
                  disabled={loading || items.every((i) => !i.nombreItem.trim())}
                  className="bg-teal-600 hover:bg-teal-700 text-white rounded-r-none min-w-[140px] border-r border-teal-700"
                >
                  {loading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Emitiendo…</>
                    : 'Guardar'}
                </Button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setShowGuardarMenu(v => !v)}
                  className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-l-none px-2.5 flex items-center border-l border-teal-700 transition-colors"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>

                {showGuardarMenu && (
                  <div className="absolute bottom-full right-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-52 z-50"
                    onMouseLeave={() => setShowGuardarMenu(false)}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => { setShowGuardarMenu(false); emitir('borrador'); }}>
                      <FileText className="h-4 w-4 text-gray-400" />
                      Guardar como borrador
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => { setShowGuardarMenu(false); emitir('emitir', { andThen: 'imprimir' }); }}>
                      <Printer className="h-4 w-4 text-gray-400" />
                      Guardar e imprimir
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => { setShowGuardarMenu(false); emitir('emitir', { andThen: 'correo' }); }}>
                      <Mail className="h-4 w-4 text-gray-400" />
                      Guardar y enviar por correo
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>

        {/* Modal Vista Previa */}
        <Dialog open={vistaPrevia} onOpenChange={setVistaPrevia}>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
            <DialogHeader className="px-6 pt-5 pb-3 border-b flex-row items-center justify-between">
              <DialogTitle className="text-base font-semibold">
                Vista previa — {TIPOS_ECF[tipoEcf as keyof typeof TIPOS_ECF] ?? 'Comprobante'}
              </DialogTitle>
            </DialogHeader>

            {/* Documento */}
            <div className="px-6 py-5 bg-gray-50">
              <div className="relative bg-white border border-gray-200 rounded-lg shadow-sm text-sm overflow-hidden">

                {/* ── BORRADOR watermark ── */}
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
                  style={{ zIndex: 10 }}
                >
                  <span
                    className="text-gray-200 font-black tracking-widest"
                    style={{ fontSize: 100, transform: 'rotate(-30deg)', lineHeight: 1, userSelect: 'none' }}
                  >
                    BORRADOR
                  </span>
                </div>

                {/* ── Encabezado ── */}
                <div className="flex items-start justify-between px-7 py-5 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    {empresa?.logo
                      ? <img src={empresa.logo} alt="Logo" className="h-10 max-w-[140px] object-contain" />
                      : <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center text-teal-700 font-bold text-xs">ECF</div>
                    }
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{empresa?.nombreComercial ?? empresa?.razonSocial ?? 'Mi Empresa'}</p>
                      {empresa?.rnc && <p className="text-xs text-gray-400">RNC: {empresa.rnc}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-medium text-teal-600 uppercase tracking-wide">{TIPOS_ECF[tipoEcf as keyof typeof TIPOS_ECF]}</p>
                    <p className="font-mono font-bold text-base text-gray-900">{secuencia?.encf ?? `E${tipoEcf}0000000001`}</p>
                    <p className="text-xs text-gray-400">Fecha: {fechaEmision}</p>
                    {fechaLimitePago && <p className="text-xs text-gray-400">Vence: {fechaLimitePago}</p>}
                  </div>
                </div>

                {/* ── Comprador + Pago ── */}
                <div className="px-7 py-4 border-b border-gray-100 grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{regla?.compradorLabel ?? 'Comprador'}</p>
                    <p className="font-medium text-gray-900">{(clienteSeleccionado?.razonSocial ?? rncManualNombre) || '—'}</p>
                    {(clienteSeleccionado?.rnc ?? rncManual) && (
                      <p className="text-xs text-gray-500">RNC: {clienteSeleccionado?.rnc ?? rncManual}</p>
                    )}
                    {telefonoManual && <p className="text-xs text-gray-500">Teléfono: {telefonoManual}</p>}
                    {(clienteSeleccionado?.email ?? emailManual) && (
                      <p className="text-xs text-gray-500">{clienteSeleccionado?.email ?? emailManual}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Valor restante por pagar</p>
                    <p className="font-bold text-gray-900 text-base">RD$ {totalNeto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-gray-500 mt-1">{plazoActual?.label}</p>
                  </div>
                </div>

                {/* ── Tabla de ítems ── */}
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-[10px] text-gray-500 uppercase tracking-wide">
                      <th className="text-right px-4 py-2 w-10">Cant.</th>
                      <th className="text-left px-3 py-2">Descripción</th>
                      <th className="text-center px-3 py-2 hidden sm:table-cell">Unidad</th>
                      <th className="text-right px-3 py-2">Precio</th>
                      <th className="text-right px-3 py-2 hidden sm:table-cell">Descuento</th>
                      <th className="text-right px-3 py-2">Impuesto</th>
                      <th className="text-right px-4 py-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.filter(i => i.nombreItem.trim()).map((item, idx) => {
                      const base  = item.cantidadItem * item.precioUnitarioItem;
                      const desc  = base * (item.descuentoPct / 100);
                      const neto  = base - desc;
                      const tasa  = item.tasaItbis === 'exento' ? 0 : parseFloat(item.tasaItbis);
                      const valor = neto + neto * tasa;
                      return (
                        <tr key={item.id} className={`border-t border-gray-100 ${idx % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                          <td className="text-right px-4 py-2.5 text-gray-600 tabular-nums">{item.cantidadItem}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-gray-900">{item.nombreItem}</p>
                            {item.descripcionItem && <p className="text-xs text-gray-400">{item.descripcionItem}</p>}
                          </td>
                          <td className="text-center px-3 py-2.5 text-gray-500 text-xs hidden sm:table-cell">
                            {item.unidadMedida || '—'}
                          </td>
                          <td className="text-right px-3 py-2.5 text-gray-600 tabular-nums">
                            RD${item.precioUnitarioItem.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="text-right px-3 py-2.5 text-gray-500 text-xs hidden sm:table-cell">
                            {item.descuentoPct > 0 ? `${item.descuentoPct}%` : '—'}
                          </td>
                          <td className="text-right px-3 py-2.5 text-gray-500 text-xs">
                            {item.tasaItbis === 'exento' ? 'E' : `${(tasa * 100).toFixed(0)}%`}
                          </td>
                          <td className="text-right px-4 py-2.5 font-medium text-gray-900 tabular-nums">
                            RD${valor.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* ── Footer tabla: total líneas + totales ── */}
                <div className="border-t border-gray-100 px-7 py-4 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">
                      Total de líneas: <span className="font-semibold text-gray-700">{items.filter(i => i.nombreItem.trim()).length}</span>
                    </p>
                    <p className="text-xs text-gray-400 italic mt-2">{numeroALetras(totalNeto)}</p>
                    {empresa?.firma && (
                      <img src={empresa.firma} alt="Firma" className="h-10 object-contain mt-3" />
                    )}
                  </div>
                  <div className="space-y-1 min-w-[200px]">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Subtotal</span>
                      <span className="tabular-nums">RD${totales.subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {totales.itbis > 0 && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>ITBIS</span>
                        <span className="tabular-nums">RD${totales.itbis.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {totalRetenciones > 0 && (
                      <div className="flex justify-between text-xs text-red-500">
                        <span>Retenciones</span>
                        <span className="tabular-nums">-RD${totalRetenciones.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2">
                      <span>Total</span>
                      <span className="tabular-nums">RD${totalNeto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* ── Notas / términos / pie ── */}
                {(terminosCondiciones || notas || pieFactura) && (
                  <div className="px-7 py-4 border-t border-gray-100 bg-gray-50/50 space-y-2">
                    {terminosCondiciones && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Términos y condiciones</p>
                        <p className="text-xs text-gray-600">{terminosCondiciones}</p>
                      </div>
                    )}
                    {notas && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Notas</p>
                        <p className="text-xs text-gray-600">{notas}</p>
                      </div>
                    )}
                    {pieFactura && (
                      <p className="text-[10px] text-gray-400 text-center pt-1">{pieFactura}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Botones al estilo Alegra ── */}
            <div className="px-6 py-4 border-t flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setVistaPrevia(false)} className="text-gray-500">
                ← Volver a editar
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()} className="flex items-center gap-1.5">
                  <Printer className="h-3.5 w-3.5" />Imprimir
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => emitir('borrador', { andThen: 'imprimir' })}
                >
                  <Download className="h-3.5 w-3.5" />Descargar
                </Button>
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5"
                  onClick={() => { setVistaPrevia(false); emitir('emitir'); }}
                >
                  <CheckCircle className="h-3.5 w-3.5" />Emitir
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Editar Numeración NCF */}
        <Dialog open={showEditarNcf} onOpenChange={(o) => { if (!o) setShowEditarNcf(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Editar numeración</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Nombre (read-only) */}
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-500">Nombre</Label>
                <Input value={TIPOS_ECF[tipoEcf as keyof typeof TIPOS_ECF] ?? ''} readOnly className="bg-gray-50 text-gray-600" />
              </div>
              {/* Numeración automática (read-only) */}
              <div className="flex items-center gap-3">
                <Label className="text-sm text-gray-500">Numeración automática</Label>
                <input type="checkbox" checked readOnly className="h-4 w-4 accent-teal-600 cursor-default" />
              </div>
              {/* Tipo NCF (read-only) */}
              <div className="space-y-1.5">
                <Label className="text-sm text-gray-500">Tipo de NCF</Label>
                <Input value={`B${tipoEcf}`} readOnly className="bg-gray-50 text-gray-600 font-mono" />
              </div>
              {/* Siguiente número (editable) */}
              <div className="space-y-1.5">
                <Label className="text-sm">Siguiente número</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder={secuencia?.encf?.slice(-8) ?? '1'}
                  value={ncfSiguienteNum}
                  onChange={(e) => setNcfSiguienteNum(e.target.value)}
                />
              </div>
              {/* Fecha de vencimiento (editable) */}
              <div className="space-y-1.5">
                <Label className="text-sm">Fecha de vencimiento</Label>
                <Input
                  type="date"
                  value={ncfFechaVenc}
                  onChange={(e) => setNcfFechaVenc(e.target.value)}
                />
              </div>
              {/* Pie de factura (editable) */}
              <div className="space-y-1.5">
                <Label className="text-sm">Pie de factura</Label>
                <textarea
                  className="w-full min-h-[80px] text-sm border border-gray-200 rounded-md p-2 resize-y focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent placeholder:text-gray-300"
                  placeholder="Texto que aparecerá al pie del comprobante..."
                  value={ncfPieFactura}
                  onChange={(e) => setNcfPieFactura(e.target.value)}
                />
              </div>
            </div>
            {ncfError && <p className="text-xs text-red-500 px-1">{ncfError}</p>}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setShowEditarNcf(false); setNcfError(null); }}>Cancelar</Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={ncfSaving}
                onClick={handleGuardarNcf}>
                {ncfSaving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</> : 'Guardar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Nuevo plazo de pago */}
        <Dialog open={showNuevoPlazo} onOpenChange={(o) => { if (!o) setShowNuevoPlazo(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-teal-600">Agregar nuevo término de pago</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {npError && (
                <p className="text-xs text-red-500">{npError}</p>
              )}
              <div className="space-y-1.5">
                <Label>Nombre <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Ej: 45 días"
                  value={npNombre}
                  onChange={(e) => setNpNombre(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGuardarNuevoPlazo()}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Días <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  placeholder="45"
                  value={npDias}
                  onChange={(e) => setNpDias(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGuardarNuevoPlazo()}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowNuevoPlazo(false)}>Cancelar</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleGuardarNuevoPlazo}>
                Aceptar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Enviar por correo */}
        <Dialog open={showEnviarCorreo} onOpenChange={(o) => { if (!o) setShowEnviarCorreo(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-teal-600" />Enviar comprobante
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-sm">Correo electrónico del destinatario</Label>
                <Input
                  type="email"
                  placeholder="cliente@empresa.com"
                  value={emailEnviar}
                  onChange={(e) => setEmailEnviar(e.target.value)}
                />
              </div>
              {correoEncf && (
                <p className="text-xs text-gray-500">
                  Se enviará el comprobante <span className="font-mono font-medium text-teal-700">{correoEncf}</span>
                </p>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowEnviarCorreo(false)}>Cancelar</Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={emailSending || !emailEnviar.includes('@')}
                onClick={async () => {
                  if (!correoDocumentoId) return;
                  setEmailSending(true);
                  try {
                    await fetch(`/api/facturas/${correoDocumentoId}/enviar-correo`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: emailEnviar }),
                    });
                    setShowEnviarCorreo(false);
                  } finally {
                    setEmailSending(false);
                  }
                }}>
                {emailSending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enviando…</> : 'Enviar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modales inline */}
        <ModalNuevoCliente
          open={showNuevoCliente}
          onClose={() => setShowNuevoCliente(false)}
          onCreated={(c) => { seleccionarCliente(c); setShowNuevoCliente(false); }}
        />

        {showNuevoProductoIdx !== null && (
          <ModalNuevoProducto
            open
            onClose={() => setShowNuevoProductoIdx(null)}
            onCreated={(p) => { seleccionarProducto(showNuevoProductoIdx, p); setShowNuevoProductoIdx(null); }}
          />
        )}

        {/* Modal Nuevo Almacén */}
        <ModalNuevoAlmacen
          open={showNuevoAlmacen}
          onClose={() => setShowNuevoAlmacen(false)}
          onCreated={(a) => {
            setAlmacenes(prev => [...prev, a]);
            setAlmacenId(a.id);
            setAlmacenNombre(a.nombre);
            setShowNuevoAlmacen(false);
          }}
        />

        {/* Modal Nueva Lista de Precios */}
        <ModalNuevaLista
          open={showNuevaLista}
          onClose={() => setShowNuevaLista(false)}
          onCreated={(l) => {
            setListasPrecios(prev => [...prev, l]);
            setListaPreciosId(l.id);
            setListaPreciosNombre(l.nombre);
            setShowNuevaLista(false);
          }}
        />

        {/* Modal Nuevo Vendedor */}
        <ModalNuevoVendedor
          open={showNuevoVendedor}
          onClose={() => setShowNuevoVendedor(false)}
          onCreated={(v) => {
            setVendedores(prev => [...prev, v]);
            setVendedorId(v.id);
            setVendedorNombre(v.nombre);
            setShowNuevoVendedor(false);
          }}
        />
      </div>
    </div>
  );
}
