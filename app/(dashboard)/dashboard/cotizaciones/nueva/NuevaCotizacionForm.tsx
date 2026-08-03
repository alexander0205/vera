'use client';

/**
 * Formulario de NUEVA COTIZACIÓN.
 *
 * Reutiliza los mismos componentes reutilizables de "Nueva factura de venta"
 * (ClienteSection, ItemsTable, RetencionesSection, ResumenSidebar, Términos,
 * Notas, Pie, Comentario) para que la pantalla sea idéntica a la de factura.
 *
 * Diferencias con factura (a propósito):
 *  - Sin comprobante fiscal (e-CF/e-NCF): no hay tipo de documento ni emisión a DGII.
 *  - Sin registro de pago: el card "Pago" del sidebar queda oculto (showPago=false).
 *  - Al guardar se crea una COTIZACIÓN (COT-XXXX), no una factura.
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, User, Calendar, Package, FileText,
  StickyNote, ScrollText, MessageSquare, Loader2,
} from 'lucide-react';

import { NavBar, TopBar } from '../../facturas/nueva/sections/TopBar';
import { SectionCard } from '../../facturas/nueva/sections/SectionCard';
import { AccordionSection } from '../../facturas/nueva/sections/AccordionSection';
import { ClienteSection } from '../../facturas/nueva/sections/ClienteSection';
import { ItemsTable } from '../../facturas/nueva/sections/ItemsTable';
import { ColumnasToggle } from '../../facturas/nueva/sections/ColumnasToggle';
import { RetencionesSection } from '../../facturas/nueva/sections/RetencionesSection';
import { ResumenSidebar } from '../../facturas/nueva/sections/ResumenSidebar';
import { Terminos, Notas } from '../../facturas/nueva/sections/TerminosNotas';
import { PieFactura } from '../../facturas/nueva/sections/PieFactura';
import { Comentarios } from '../../facturas/nueva/sections/Comentarios';

import { ModalNuevoCliente } from '../../facturas/nueva/modals/ModalNuevoCliente';
import { ModalNuevoProducto } from '../../facturas/nueva/modals/ModalNuevoProducto';
import { ModalNuevoAlmacen } from '../../facturas/nueva/modals/ModalNuevoAlmacen';
import { ModalNuevaLista } from '../../facturas/nueva/modals/ModalNuevaLista';
import { ModalNuevoVendedor } from '../../facturas/nueva/modals/ModalNuevoVendedor';

import { useItemsState } from '../../facturas/nueva/hooks/useFacturaState';
import { useDropdownsCatalog } from '../../facturas/nueva/hooks/useDropdownsCatalog';

import { calcularTotales } from '../../facturas/nueva/utils/calculos';
import type {
  Cliente, EmpresaPerfil, ItemLinea, Producto, Retencion,
} from '../../facturas/nueva/utils/types';

export type { EmpresaPerfil };

export default function NuevaCotizacionForm({
  initialPerfil,
}: {
  initialPerfil: EmpresaPerfil | null;
}) {
  const router  = useRouter();
  const empresa = initialPerfil;

  // ── Cliente / comprador ────────────────────────────────────────────────────
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [rncManual, setRncManual]             = useState('');
  const [rncManualNombre, setRncManualNombre] = useState('');
  const [emailManual, setEmailManual]         = useState('');
  const [telefonoManual, setTelefonoManual]   = useState('');
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);

  // ── Fechas ─────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [fechaVencimiento, setFechaVencimiento] = useState('');

  // ── Items (mismo reducer que factura) ──────────────────────────────────────
  const [items, dispatchItems] = useItemsState();
  const [showNuevoProductoIdx, setShowNuevoProductoIdx] = useState<number | null>(null);

  // ── Retenciones ────────────────────────────────────────────────────────────
  const [retenciones, setRetenciones] = useState<Retencion[]>([]);

  // ── Columnas opcionales de items (Referencia / Descripción) ────────────────
  const [showItemRef, setShowItemRef]   = useState(false);
  const [showItemDesc, setShowItemDesc] = useState(false);

  // ── Textos ─────────────────────────────────────────────────────────────────
  const [notas, setNotas]                  = useState('');
  const [terminosCondiciones, setTerminos] = useState('');
  const [pieFactura, setPieFactura]        = useState('');
  const [comentario, setComentario]        = useState('');

  // ── Top bar: Almacén / Lista de precios / Vendedor ─────────────────────────
  const [showAlmacen, setShowAlmacen]           = useState(false);
  const [showListaPrecios, setShowListaPrecios] = useState(false);
  const [showVendedor, setShowVendedor]         = useState(false);

  const [almacenId, setAlmacenId]                 = useState<number | null>(null);
  const [almacenNombre, setAlmacenNombre]         = useState('');
  const [listaPreciosId, setListaPreciosId]       = useState<number | null>(null);
  const [listaPreciosNombre, setListaPreciosNombre] = useState('');
  const [vendedorId, setVendedorId]               = useState<number | null>(null);
  const [vendedorNombre, setVendedorNombre]       = useState('');

  const {
    almacenes, setAlmacenes,
    listasPrecios, setListasPrecios,
    vendedores, setVendedores,
  } = useDropdownsCatalog();

  const [showNuevoAlmacen, setShowNuevoAlmacen]   = useState(false);
  const [showNuevaLista, setShowNuevaLista]       = useState(false);
  const [showNuevoVendedor, setShowNuevoVendedor] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  useEffect(() => { if (error) toast.error(error, { duration: 6000 }); }, [error]);

  // ── Persistencia de preferencias visuales (mismas claves que factura) ──────
  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      if (prefs.almacen)      setShowAlmacen(true);
      if (prefs.listaPrecios) setShowListaPrecios(true);
      if (prefs.vendedor)     setShowVendedor(true);
      const cols = prefs.itemsCols ?? {};
      setShowItemRef(Boolean(cols.referencia));
      setShowItemDesc(Boolean(cols.descripcion));
    } catch {}
  }, []);

  function toggleOpcion(key: string, value: boolean) {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      prefs[key] = value;
      localStorage.setItem('emitedo:facturaOpciones', JSON.stringify(prefs));
    } catch {}
  }
  function persistCols(ref: boolean, desc: boolean) {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      prefs.itemsCols = { referencia: ref, descripcion: desc };
      localStorage.setItem('emitedo:facturaOpciones', JSON.stringify(prefs));
    } catch {}
  }
  const handleToggleRef  = (v: boolean) => { setShowItemRef(v);  persistCols(v, showItemDesc); };
  const handleToggleDesc = (v: boolean) => { setShowItemDesc(v); persistCols(showItemRef, v); };

  // ── Aplicar lista de precios (% sobre precio) a los items ──────────────────
  useEffect(() => {
    if (!listaPreciosId) return;
    const lista = listasPrecios.find(l => l.id === listaPreciosId);
    if (!lista || lista.tipo !== 'porcentaje' || lista.porcentaje <= 0) return;
    dispatchItems({ type: 'APPLY_LISTA_PORC', porcentaje: lista.porcentaje });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaPreciosId]);

  // ── Búsqueda / selección de clientes ───────────────────────────────────────
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
    setRncManual(''); setRncManualNombre(''); setEmailManual(''); setTelefonoManual('');
  }

  // ── Búsqueda / selección de productos ──────────────────────────────────────
  async function buscarProductos(q: string): Promise<Producto[]> {
    const res  = await fetch(`/api/productos?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.productos ?? [];
  }
  function seleccionarProducto(idx: number, p: Producto) {
    // Sin regla fiscal (cotización) → se respeta la tasa del producto.
    dispatchItems({
      type: 'APPLY_PRODUCTO',
      idx,
      patch: {
        productoId: p.id,
        nombreItem: p.nombre,
        referencia: p.referencia ?? '',
        descripcionItem: p.descripcion ?? '',
        precioUnitarioItem: p.precioDOP,
        tasaItbis: (p.tasaItbis as ItemLinea['tasaItbis']) ?? '0.18',
        indicadorBienoServicio: p.tipo === 'bien' ? '1' : '2',
        unidadMedida: (p as Producto & { unidad?: string }).unidad ?? '',
      },
    });
  }
  async function crearProductoLibre(idx: number, texto: string) {
    const nombre = texto.trim();
    if (!nombre) return;
    try {
      const item = items[idx];
      const tasaItem = String(item?.tasaItbis ?? '0.18');
      const tasa: '0.18' | '0.16' | '0' | 'exento' =
        tasaItem === '0.16' ? '0.16' : tasaItem === '0' ? '0' : tasaItem === 'exento' ? 'exento' : '0.18';
      const res = await fetch('/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, precio: item?.precioUnitarioItem ?? 0, tasaItbis: tasa, tipo: 'servicio' }),
      });
      const data = await res.json();
      if (res.ok && data.producto) {
        seleccionarProducto(idx, data.producto);
      } else {
        dispatchItems({ type: 'UPDATE', id: items[idx].id, field: 'nombreItem', value: nombre });
        toast.error(data.error ?? 'No se pudo crear el producto. Usando texto libre.');
      }
    } catch (e) {
      dispatchItems({ type: 'UPDATE', id: items[idx].id, field: 'nombreItem', value: nombre });
      toast.error(e instanceof Error ? e.message : 'Error de red creando producto');
    }
  }

  const addItem    = () => dispatchItems({ type: 'ADD' });
  const removeItem = (id: number) => dispatchItems({ type: 'REMOVE', id });
  const updateItem = (id: number, field: keyof ItemLinea, value: string | number | null) =>
    dispatchItems({ type: 'UPDATE', id, field, value });

  // ── Totales ────────────────────────────────────────────────────────────────
  const totales = useMemo(() => calcularTotales(items), [items]);
  const totalRetenciones = useMemo(() => retenciones.reduce((s, r) => s + r.monto, 0), [retenciones]);
  const totalNeto = totales.total - totalRetenciones;

  // ── Guardar cotización ─────────────────────────────────────────────────────
  async function handleGuardar() {
    const razonFinal = clienteSeleccionado?.razonSocial ?? rncManualNombre;
    if (!razonFinal.trim() && items.every(it => !it.nombreItem.trim())) {
      setError('Ingresa al menos el nombre del cliente o una línea de ítem');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const itemsPayload = items
        .filter(it => it.nombreItem.trim())
        .map(it => ({
          nombreItem:             it.nombreItem,
          referencia:             it.referencia,
          descripcionItem:        it.descripcionItem,
          cantidadItem:           it.cantidadItem,
          precioUnitarioItem:     it.precioUnitarioItem,
          descuentoPct:           it.descuentoPct,
          tasaItbis:              it.tasaItbis,
          indicadorBienoServicio: it.indicadorBienoServicio,
          unidadMedida:           it.unidadMedida ?? '',
        }));

      const res = await fetch('/api/cotizaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId:             clienteSeleccionado?.id ?? null,
          razonSocialComprador: razonFinal.trim() || null,
          rncComprador:         (clienteSeleccionado?.rnc ?? rncManual).trim() || null,
          emailComprador:       emailManual.trim() || null,
          fechaVencimiento:     fechaVencimiento || null,
          montoSubtotal:        totales.subtotal,
          montoDescuento:       totales.descuento,
          totalItbis:           totales.itbis,
          montoTotal:           totalNeto,
          items:                itemsPayload,
          notas:                notas.trim() || null,
          terminosCondiciones:  terminosCondiciones.trim() || null,
          retenciones:          retenciones.length > 0 ? retenciones : null,
          comentario:           comentario.trim() || null,
          pieFactura:           pieFactura.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error guardando la cotización');
      toast.success('Cotización guardada');
      router.push('/dashboard/cotizaciones');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error guardando la cotización');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#eef0f7] min-h-full flex flex-col">
      <a href="#main-content" className="skip-link">Saltar al contenido</a>
      <div className="p-3 sm:p-4 md:p-5 flex-1 flex flex-col">
        <NavBar
          title="Nueva cotización"
          showAlmacen={showAlmacen}           setShowAlmacen={setShowAlmacen}
          showListaPrecios={showListaPrecios} setShowListaPrecios={setShowListaPrecios}
          showVendedor={showVendedor}         setShowVendedor={setShowVendedor}
          toggleOpcion={toggleOpcion}
        />

        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form
          id="main-content"
          onSubmit={(e) => { e.preventDefault(); void handleGuardar(); }}
          onKeyDown={(e) => {
            const t = e.target as HTMLElement;
            const isInput = t.tagName === 'INPUT' || t.tagName === 'SELECT';
            const isSubmitBtn = t.tagName === 'BUTTON' && (t as HTMLButtonElement).type === 'submit';
            if (e.key === 'Enter' && isInput && !isSubmitBtn) e.preventDefault();
          }}
          className="flex-1 flex flex-col"
        >
          <TopBar
            showAlmacen={showAlmacen} setShowAlmacen={setShowAlmacen}
            showListaPrecios={showListaPrecios} setShowListaPrecios={setShowListaPrecios}
            showVendedor={showVendedor} setShowVendedor={setShowVendedor}
            toggleOpcion={toggleOpcion}
            almacenes={almacenes} listasPrecios={listasPrecios} vendedores={vendedores}
            almacenId={almacenId} setAlmacenId={setAlmacenId} setAlmacenNombre={setAlmacenNombre}
            listaPreciosId={listaPreciosId} setListaPreciosId={setListaPreciosId} setListaPreciosNombre={setListaPreciosNombre}
            vendedorId={vendedorId} setVendedorId={setVendedorId} setVendedorNombre={setVendedorNombre}
            onOpenNuevoAlmacen={() => setShowNuevoAlmacen(true)}
            onOpenNuevaLista={() => setShowNuevaLista(true)}
            onOpenNuevoVendedor={() => setShowNuevoVendedor(true)}
          />

          {/* Cotización no tiene card de Pago → una sola columna (evita el rail
              derecho vacío que dejaría el Resumen corto). El Resumen va al final,
              alineado a la derecha como en una cotización impresa. */}
          <div className="space-y-4">
            <div className="space-y-4 min-w-0">
              <SectionCard number={1} title="Datos del cliente" icon={User}>
                <ClienteSection
                  clienteSeleccionado={clienteSeleccionado}
                  buscarClientes={buscarClientes}
                  onSelectCliente={seleccionarCliente}
                  onClearCliente={limpiarCliente}
                  onOpenNuevoCliente={() => setShowNuevoCliente(true)}
                  regla={undefined}
                  rncManual={rncManual} rncManualNombre={rncManualNombre}
                  setRncManual={setRncManual} setRncManualNombre={setRncManualNombre}
                  emailManual={emailManual} setEmailManual={setEmailManual}
                  telefonoManual={telefonoManual} setTelefonoManual={setTelefonoManual}
                  tipoEcf="sin-ncf" totalDocumento={totales.total}
                />
              </SectionCard>

              <SectionCard number={2} title="Detalles de la cotización" icon={Calendar}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={today}
                      disabled
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Válida hasta</label>
                    <input
                      type="date"
                      value={fechaVencimiento}
                      min={today}
                      onChange={(e) => setFechaVencimiento(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  </div>
                </div>
              </SectionCard>

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
                  regla={undefined}
                  buscarProductos={buscarProductos}
                  onSelectProducto={seleccionarProducto}
                  onCrearProductoLibre={crearProductoLibre}
                  onAddItem={addItem}
                  onRemoveItem={removeItem}
                  onUpdateItem={updateItem}
                  onSelectBeneficiario={() => {}}
                  onOpenNuevoProducto={(idx) => setShowNuevoProductoIdx(idx)}
                  showReferencia={showItemRef}
                  showDescripcion={showItemDesc}
                  dependientes={[]}
                />
                <RetencionesSection
                  retenciones={retenciones} setRetenciones={setRetenciones}
                  totalesItbis={totales.itbis} totalesSubtotal={totales.subtotal}
                />
              </SectionCard>

              <AccordionSection
                number={4} title="Términos y condiciones" icon={ScrollText}
                defaultOpen={terminosCondiciones.trim().length > 0}
              >
                <Terminos terminosCondiciones={terminosCondiciones} setTerminos={setTerminos} />
              </AccordionSection>

              <AccordionSection
                number={5} title="Notas" icon={StickyNote}
                defaultOpen={notas.trim().length > 0}
              >
                <Notas notas={notas} setNotas={setNotas} />
              </AccordionSection>

              <AccordionSection
                number={6} title="Pie del documento" icon={FileText}
                defaultOpen={pieFactura.trim().length > 0}
              >
                <PieFactura pieFactura={pieFactura} setPieFactura={setPieFactura} label="Pie del documento" />
              </AccordionSection>

              <AccordionSection
                number={7} title="Comentario" icon={MessageSquare}
                defaultOpen={comentario.trim().length > 0}
              >
                <Comentarios comentario={comentario} setComentario={setComentario} />
              </AccordionSection>
            </div>

            {/* Resumen (sin Pago) — al final, alineado a la derecha */}
            <div className="lg:max-w-md lg:ml-auto">
              <ResumenSidebar
                empresa={empresa}
                totales={totales}
                retenciones={retenciones}
                totalNeto={totalNeto}
                totalLabel="Total"
                items={items}
                showPago={false}
              />
            </div>
          </div>

          {/* Barra de acciones — sticky abajo. mt-auto empuja la barra al fondo
              cuando el contenido es corto (evita el hueco antes de Guardar). */}
          <div className="sticky bottom-0 z-30 -mx-3 sm:-mx-4 md:-mx-5 mt-auto flex justify-end gap-3 border-t border-gray-200 bg-white/95 px-3 sm:px-4 md:px-5 py-3 backdrop-blur">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => router.push('/dashboard/cotizaciones')}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {saving ? 'Guardando…' : 'Guardar cotización'}
            </Button>
          </div>
        </form>

        {/* Modals */}
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

        <ModalNuevoAlmacen
          open={showNuevoAlmacen}
          onClose={() => setShowNuevoAlmacen(false)}
          onCreated={(a) => {
            setAlmacenes(prev => [...prev, a]);
            setAlmacenId(a.id); setAlmacenNombre(a.nombre);
            setShowNuevoAlmacen(false);
          }}
        />

        <ModalNuevaLista
          open={showNuevaLista}
          onClose={() => setShowNuevaLista(false)}
          onCreated={(l) => {
            setListasPrecios(prev => [...prev, l]);
            setListaPreciosId(l.id); setListaPreciosNombre(l.nombre);
            setShowNuevaLista(false);
          }}
        />

        <ModalNuevoVendedor
          open={showNuevoVendedor}
          onClose={() => setShowNuevoVendedor(false)}
          onCreated={(v) => {
            setVendedores(prev => [...prev, v]);
            setVendedorId(v.id); setVendedorNombre(v.nombre);
            setShowNuevoVendedor(false);
          }}
        />
      </div>
    </div>
  );
}
