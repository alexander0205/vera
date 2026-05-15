'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, ArrowLeft, X, User, Package, Calendar, ScrollText, StickyNote, FileText,
  CreditCard, Wallet, ChevronRight,
} from 'lucide-react';
import { TIPO_ECF_REGLAS } from '@/lib/ecf/types';
import { useProximamenteDialog } from '@/components/proximamente-dialog';

import { SectionCard } from '../../facturas/nueva/sections/SectionCard';
import { AccordionSection } from '../../facturas/nueva/sections/AccordionSection';
import { ClienteSection } from '../../facturas/nueva/sections/ClienteSection';
import { ItemsTable } from '../../facturas/nueva/sections/ItemsTable';
import { ColumnasToggle } from '../../facturas/nueva/sections/ColumnasToggle';
import { Terminos, Notas } from '../../facturas/nueva/sections/TerminosNotas';
import { PieFactura } from '../../facturas/nueva/sections/PieFactura';

import { useItemsState } from '../../facturas/nueva/hooks/useFacturaState';
import { calcularTotales } from '../../facturas/nueva/utils/calculos';
import type { Cliente, ItemLinea, Producto } from '../../facturas/nueva/utils/types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPOS_ECF = [
  { value: '31', label: 'Factura de crédito fiscal (31)' },
  { value: '32', label: 'Factura de consumo (32)' },
  { value: '41', label: 'Compras (41)' },
  { value: '43', label: 'Gastos menores (43)' },
  { value: '44', label: 'Regímenes especiales (44)' },
  { value: '45', label: 'Gubernamental (45)' },
];

// tipoPago recurrente: 1 = contado, 2 = crédito (con N días para pago)
const TIPOS_PAGO = [
  { value: '1', label: 'De contado' },
  { value: '2', label: 'Crédito' },
];

const FRECUENCIAS = [
  { value: 'semanal',    label: 'Semanal' },
  { value: 'quincenal',  label: 'Quincenal' },
  { value: 'mensual',    label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual',      label: 'Anual' },
];

function formatDOP(val: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
}

/** Calcula la próxima fecha de emisión a partir de la fecha de inicio y la frecuencia */
function calcularProximaEmision(fechaInicio: string, frecuencia: string): string {
  if (!fechaInicio) return '';
  const [y, m, d] = fechaInicio.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  switch (frecuencia) {
    case 'semanal':    dt.setDate(dt.getDate() + 7); break;
    case 'quincenal':  dt.setDate(dt.getDate() + 15); break;
    case 'mensual':    dt.setMonth(dt.getMonth() + 1); break;
    case 'trimestral': dt.setMonth(dt.getMonth() + 3); break;
    case 'anual':      dt.setFullYear(dt.getFullYear() + 1); break;
  }
  return dt.toISOString().slice(0, 10);
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function NuevaFacturaRecurrenteForm() {
  const router = useRouter();

  // ── Cabecera ───────────────────────────────────────────────────────────────
  const [tipoEcf, setTipoEcf]           = useState('31');
  const [tipoPago, setTipoPago]         = useState('1');
  const [diasParaPago, setDiasParaPago] = useState('5'); // solo aplica si tipoPago=2 (crédito)
  const [frecuencia, setFrecuencia]     = useState('mensual');
  const [nombre, setNombre]             = useState('');
  const [fechaInicio, setFechaInicio]   = useState('');
  const [fechaFin, setFechaFin]         = useState('');

  const regla = TIPO_ECF_REGLAS[tipoEcf];

  // ── Cliente / comprador ────────────────────────────────────────────────────
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [rncManual, setRncManual]             = useState('');
  const [rncManualNombre, setRncManualNombre] = useState('');
  const [emailManual, setEmailManual]         = useState('');
  const [telefonoManual, setTelefonoManual]   = useState('');

  // ── Items (useReducer compartido) ──────────────────────────────────────────
  const [items, dispatchItems] = useItemsState();

  // ── Columnas Referencia/Descripción ────────────────────────────────────────
  const [showItemRef, setShowItemRef]   = useState(false);
  const [showItemDesc, setShowItemDesc] = useState(false);
  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      const cols = prefs.itemsCols ?? {};
      setShowItemRef(Boolean(cols.referencia));
      setShowItemDesc(Boolean(cols.descripcion));
    } catch {}
  }, []);
  function persistCols(ref: boolean, desc: boolean) {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      prefs.itemsCols = { referencia: ref, descripcion: desc };
      localStorage.setItem('emitedo:facturaOpciones', JSON.stringify(prefs));
    } catch {}
  }
  function handleToggleRef(v: boolean) { setShowItemRef(v); persistCols(v, showItemDesc); }
  function handleToggleDesc(v: boolean) { setShowItemDesc(v); persistCols(showItemRef, v); }

  // ── Términos / Notas / Pie ─────────────────────────────────────────────────
  const [terminosCondiciones, setTerminos] = useState('');
  const [notas, setNotas]                  = useState('');
  const [pieFactura, setPieFactura]        = useState('');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // ── Cobro automático (feature no implementada — dialog Próximamente) ────────
  const { openProximamente, dialog: proximamenteDialog } = useProximamenteDialog();

  const today = new Date().toISOString().slice(0, 10);

  // ─── Búsqueda clientes ──────────────────────────────────────────────────────
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

  // ─── Búsqueda productos ─────────────────────────────────────────────────────
  async function buscarProductos(q: string): Promise<Producto[]> {
    const res  = await fetch(`/api/productos?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.productos ?? [];
  }

  function seleccionarProducto(idx: number, p: Producto) {
    const tasa = (p.tasaItbis as ItemLinea['tasaItbis']) ?? '0.18';
    dispatchItems({
      type: 'APPLY_PRODUCTO',
      idx,
      patch: {
        productoId:             p.id,
        nombreItem:             p.nombre,
        referencia:             p.referencia ?? '',
        descripcionItem:        p.descripcion ?? '',
        precioUnitarioItem:     p.precioDOP,
        tasaItbis:              regla?.permiteItbis ? tasa : 'exento',
        indicadorBienoServicio: p.tipo === 'bien' ? '1' : '2',
        unidadMedida:           (p as Producto & { unidad?: string }).unidad ?? '',
      },
    });
  }

  // ─── Items CRUD ─────────────────────────────────────────────────────────────
  const addItem    = () => dispatchItems({ type: 'ADD' });
  const removeItem = (id: number) => dispatchItems({ type: 'REMOVE', id });
  const updateItem = (id: number, field: keyof ItemLinea, value: string | number) =>
    dispatchItems({ type: 'UPDATE', id, field, value });

  // ─── Cambio de tipo ─────────────────────────────────────────────────────────
  function handleChangeTipo(t: string) {
    setTipoEcf(t);
    limpiarCliente();
    setError(null);
    const r = TIPO_ECF_REGLAS[t];
    if (!r?.permiteItbis) dispatchItems({ type: 'FORCE_EXENTO' });
  }

  // ─── Totales ────────────────────────────────────────────────────────────────
  const totales = useMemo(() => calcularTotales(items), [items]);

  const proximaEmisionPreview = useMemo(
    () => calcularProximaEmision(fechaInicio, frecuencia),
    [fechaInicio, frecuencia],
  );

  // ─── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nombre.trim())      { setError('El nombre identificador es obligatorio'); return; }
    if (!fechaInicio)        { setError('La fecha de inicio es obligatoria'); return; }
    if (items.every(i => !i.nombreItem.trim())) { setError('Agrega al menos un ítem con nombre'); return; }

    const proximaEmision = fechaInicio; // Primera emisión = fecha de inicio
    const notasFinal = [terminosCondiciones, notas, pieFactura].filter(s => s.trim()).join('\n\n') || null;

    setLoading(true);
    try {
      const res = await fetch('/api/facturas-recurrentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:         nombre.trim(),
          tipoEcf,
          tipoPago:       parseInt(tipoPago),
          diasParaPago:   parseInt(tipoPago) === 2 ? parseInt(diasParaPago || '0') : null,
          frecuencia,
          fechaInicio,
          fechaFin:       fechaFin || null,
          proximaEmision,
          clientId:       clienteSeleccionado?.id ?? null,
          notas:          notasFinal,
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
      <div className="p-3 sm:p-4 md:p-6">

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

        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            const t = e.target as HTMLElement;
            const isInput = t.tagName === 'INPUT' || t.tagName === 'SELECT';
            const isSubmitBtn = t.tagName === 'BUTTON' && (t as HTMLButtonElement).type === 'submit';
            if (e.key === 'Enter' && isInput && !isSubmitBtn) e.preventDefault();
          }}
          className="space-y-4 max-w-4xl"
        >
          {/* ── HEADER: Numeración (decisión raíz — afecta cliente, ítems) ──── */}
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <Label className="text-xs text-gray-600 uppercase tracking-wide shrink-0 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Numeración
            </Label>
            <Select value={tipoEcf} onValueChange={handleChangeTipo}>
              <SelectTrigger className="h-10 sm:max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_ECF.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-gray-400 sm:ml-auto">
              Define el tipo de comprobante. Cambiarlo reinicia los datos del cliente.
            </p>
          </div>

          {/* ── SECCIÓN 1: Cliente ──────────────────────────────────────────── */}
          <SectionCard number={1} title="Datos del cliente" icon={User}>
            <ClienteSection
              clienteSeleccionado={clienteSeleccionado}
              buscarClientes={buscarClientes}
              onSelectCliente={seleccionarCliente}
              onClearCliente={limpiarCliente}
              onOpenNuevoCliente={() => router.push('/dashboard/clientes/nuevo')}
              regla={regla}
              rncManual={rncManual} rncManualNombre={rncManualNombre}
              setRncManual={setRncManual} setRncManualNombre={setRncManualNombre}
              emailManual={emailManual} setEmailManual={setEmailManual}
              telefonoManual={telefonoManual} setTelefonoManual={setTelefonoManual}
              tipoEcf={tipoEcf} totalDocumento={totales.total}
            />
          </SectionCard>

          {/* ── SECCIÓN 2: Recurrencia (campos propios) ─────────────────────── */}
          <SectionCard number={2} title="Configuración de la recurrencia" icon={Calendar}>
            <div className="space-y-5">

              {/* Nombre del plan — primero, es el título de la plantilla */}
              <div>
                <Label className="text-xs text-gray-600 uppercase tracking-wide">
                  Nombre del plan <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="Ej: Mensualidad colegio - Juan Pérez"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  className="mt-1 h-10"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Nombre interno de este plan</p>
              </div>

              {/* ── Grupo: CUÁNDO ── */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Cuándo se emite</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Frecuencia */}
                  <div>
                    <Label className="text-xs text-gray-600 uppercase tracking-wide">Frecuencia</Label>
                    <Select value={frecuencia} onValueChange={setFrecuencia}>
                      <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FRECUENCIAS.map(f => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Fecha de inicio */}
                  <div>
                    <Label className="text-xs text-gray-600 uppercase tracking-wide">
                      Fecha de inicio <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={fechaInicio}
                      onChange={e => setFechaInicio(e.target.value)}
                      min={today}
                      className="mt-1 h-10"
                      required
                    />
                    {fechaInicio && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        {(() => {
                          const [y, m, d] = fechaInicio.split('-').map(Number);
                          const dt = new Date(y, m - 1, d);
                          const dia = dt.getDate();
                          const diaSemana = dt.toLocaleDateString('es-DO', { weekday: 'long' });
                          switch (frecuencia) {
                            case 'semanal':    return `Se emitirá cada ${diaSemana}`;
                            case 'quincenal':  return `Cada 15 días desde esta fecha`;
                            case 'mensual':    return `Se emitirá el día ${dia} de cada mes`;
                            case 'trimestral': return `Cada 3 meses en esta fecha`;
                            case 'anual':      return `Cada año en esta fecha`;
                            default: return '';
                          }
                        })()}
                      </p>
                    )}
                  </div>

                  {/* Vigencia hasta */}
                  <div>
                    <Label className="text-xs text-gray-600 uppercase tracking-wide">
                      Vigencia hasta{' '}
                      <span className="text-gray-400 text-[11px] font-normal normal-case">
                        {fechaFin ? '' : '(opcional)'}
                      </span>
                    </Label>
                    <div className="relative mt-1">
                      <Input
                        type="date"
                        value={fechaFin}
                        onChange={e => setFechaFin(e.target.value)}
                        min={fechaInicio || today}
                        className="h-10 pr-8"
                      />
                      {fechaFin && (
                        <button
                          type="button"
                          onClick={() => setFechaFin('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          title="Quitar fecha de fin"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {!fechaFin && (
                      <p className="text-[10px] text-gray-400 mt-1">Sin fecha = se repite indefinidamente.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Grupo: CÓMO SE PAGA ── */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Cómo se paga</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Plazo de pago */}
                  <div>
                    <Label className="text-xs text-gray-600 uppercase tracking-wide">Condición de pago</Label>
                    <Select value={tipoPago} onValueChange={setTipoPago}>
                      <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS_PAGO.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Días para pagar — siempre presente, disabled si contado (sin reflow) */}
                  <div>
                    <Label className={`text-xs uppercase tracking-wide ${tipoPago === '2' ? 'text-gray-600' : 'text-gray-300'}`}>
                      Días para pagar
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={diasParaPago}
                      onChange={e => setDiasParaPago(e.target.value)}
                      disabled={tipoPago !== '2'}
                      className="mt-1 h-10 disabled:bg-gray-50 disabled:text-gray-300"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      {tipoPago === '2'
                        ? 'Días desde la emisión hasta el vencimiento.'
                        : 'Solo aplica con condición de pago a crédito.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Próxima emisión */}
              {fechaInicio && (
                <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 text-sm text-teal-800">
                  Próxima emisión:{' '}
                  <span className="font-semibold">{proximaEmisionPreview}</span>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── SECCIÓN 3: Productos y servicios ────────────────────────────── */}
          <SectionCard
            number={3}
            title="Productos y servicios"
            icon={Package}
            actions={
              <ColumnasToggle
                showReferencia={showItemRef}
                showDescripcion={showItemDesc}
                onToggleReferencia={handleToggleRef}
                onToggleDescripcion={handleToggleDesc}
              />
            }
          >
            <ItemsTable
              items={items}
              regla={regla}
              buscarProductos={buscarProductos}
              onSelectProducto={seleccionarProducto}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onUpdateItem={updateItem}
              onOpenNuevoProducto={() => router.push('/dashboard/productos/nuevo')}
              showReferencia={showItemRef}
              showDescripcion={showItemDesc}
            />

            {/* Totales */}
            <div className="pt-4 mt-3 border-t border-gray-100 flex justify-end">
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
          </SectionCard>

          {/* ── SECCIÓN 4: Términos y condiciones ───────────────────────────── */}
          <AccordionSection
            number={4} title="Términos y condiciones" icon={ScrollText}
            defaultOpen={terminosCondiciones.trim().length > 0}
          >
            <Terminos terminosCondiciones={terminosCondiciones} setTerminos={setTerminos} />
          </AccordionSection>

          {/* ── SECCIÓN 5: Notas ────────────────────────────────────────────── */}
          <AccordionSection
            number={5} title="Notas" icon={StickyNote}
            defaultOpen={notas.trim().length > 0}
          >
            <Notas notas={notas} setNotas={setNotas} />
          </AccordionSection>

          {/* ── SECCIÓN 6: Pie de factura ───────────────────────────────────── */}
          <AccordionSection
            number={6} title="Pie de factura" icon={FileText}
            defaultOpen={pieFactura.trim().length > 0}
          >
            <PieFactura pieFactura={pieFactura} setPieFactura={setPieFactura} />
          </AccordionSection>

          {/* ── SECCIÓN 7: Resumen y cobro ──────────────────────────────────── */}
          <SectionCard number={7} title="Resumen y cobro" icon={Wallet}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Resumen */}
              <div className="space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Resumen por emisión</p>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal</span>
                    <span>{formatDOP(totales.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>ITBIS</span>
                    <span>{formatDOP(totales.itbis)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base text-gray-900 border-t border-gray-200 pt-1.5 mt-1.5">
                    <span>Total por emisión</span>
                    <span>{formatDOP(totales.total)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 pt-1">
                    <span>Frecuencia</span>
                    <span className="capitalize">{frecuencia}</span>
                  </div>
                </div>
              </div>

              {/* Cobro automático con tarjeta — feature no implementada */}
              <div className="space-y-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Forma de cobro</p>
                <button
                  type="button"
                  onClick={() => openProximamente('Cobro automático con tarjeta')}
                  className="w-full flex items-center gap-3 border border-dashed border-gray-300 hover:border-teal-400 hover:bg-teal-50/40 rounded-lg p-3 text-left transition-colors group"
                >
                  <div className="h-9 w-9 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
                    <CreditCard className="h-4.5 w-4.5 text-teal-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">Cobro automático con tarjeta</p>
                    <p className="text-xs text-gray-500">
                      Descuenta el monto de una tarjeta cada período. Sin registrar pagos a mano.
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-500 shrink-0" />
                </button>
                <p className="text-[11px] text-gray-400">
                  Por ahora la recurrente genera un borrador y el cobro se registra manualmente
                  en Cuentas por cobrar.
                </p>
              </div>
            </div>
          </SectionCard>

          {/* ── FOOTER BOTONES ──────────────────────────────────────────────── */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" asChild disabled={loading}>
              <Link href="/dashboard/facturas-recurrentes">Cancelar</Link>
            </Button>
            <Button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white" disabled={loading}>
              {loading
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Guardando…</>
                : 'Guardar'}
            </Button>
          </div>
        </form>
      </div>

      {proximamenteDialog}
    </div>
  );
}
