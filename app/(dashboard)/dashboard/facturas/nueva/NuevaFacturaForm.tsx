'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, CheckCircle, User, Calendar, Package, FileText,
  StickyNote, ScrollText, MessageSquare, CreditCard,
} from 'lucide-react';
import { TIPO_ECF_REGLAS } from '@/lib/ecf/types';

import { NavBar, TopBar } from './sections/TopBar';
import { CompactHeader } from './sections/CompactHeader';
import { SectionCard } from './sections/SectionCard';
import { AccordionSection } from './sections/AccordionSection';
import { ClienteSection } from './sections/ClienteSection';
import { DetallesSection } from './sections/DetallesSection';
import { ItemsTable } from './sections/ItemsTable';
import { ColumnasToggle } from './sections/ColumnasToggle';
import { RetencionesSection } from './sections/RetencionesSection';
import { ResumenSidebar } from './sections/ResumenSidebar';
import { Terminos, Notas } from './sections/TerminosNotas';
import { PieFactura } from './sections/PieFactura';
import { Comentarios } from './sections/Comentarios';
import { BottomActionBar } from './sections/BottomActionBar';

import { ModalNuevoCliente } from './modals/ModalNuevoCliente';
import { ModalNuevoProducto } from './modals/ModalNuevoProducto';
import { ModalNuevoAlmacen } from './modals/ModalNuevoAlmacen';
import { ModalNuevaLista } from './modals/ModalNuevaLista';
import { ModalNuevoVendedor } from './modals/ModalNuevoVendedor';
import { ModalPreviewPDF } from './modals/ModalPreviewPDF';
import { ModalEditarNCF } from './modals/ModalEditarNCF';
import { ModalNuevoPlazo } from './modals/ModalNuevoPlazo';
import { ModalEnviarCorreo } from './modals/ModalEnviarCorreo';

import { useSecuencia } from './hooks/useSecuencia';
import { useDropdownsCatalog } from './hooks/useDropdownsCatalog';
import { useItemsState } from './hooks/useFacturaState';

import { calcularTotales } from './utils/calculos';
import { buildPayload as buildPayloadFn } from './utils/buildPayload';
import { PLAZOS_BASE } from './utils/types';
import { validate as validateEcf } from '@/lib/factura/validator';
import type {
  BorradorInicial, Cliente, EmpresaPerfil, ItemLinea, Plazo, Producto,
  ResultadoEmision, Retencion,
} from './utils/types';

// Re-export for callers that import from this module.
export type { BorradorInicial, EmpresaPerfil };

export default function NuevaFacturaForm({
  initialPerfil,
  initialData,
}: {
  initialPerfil: EmpresaPerfil | null;
  initialData?:  BorradorInicial | null;
}) {
  const router  = useRouter();
  const empresa = initialPerfil;

  // ── Items iniciales desde borrador ─────────────────────────────────────────
  const itemsIniciales: ItemLinea[] = useMemo(() => {
    if (!initialData?.lineasJson) return [];
    try {
      const parsed = JSON.parse(initialData.lineasJson) as Array<Partial<ItemLinea>>;
      return parsed.map((it, i) => ({
        id:                     i + 1,
        productoId:             it.productoId,
        nombreItem:             it.nombreItem ?? '',
        referencia:             it.referencia ?? '',
        descripcionItem:        it.descripcionItem ?? '',
        cantidadItem:           it.cantidadItem ?? 1,
        precioUnitarioItem:     it.precioUnitarioItem ?? 0,
        descuentoPct:           it.descuentoPct ?? 0,
        tasaItbis:              (it.tasaItbis ?? 'exento') as ItemLinea['tasaItbis'],
        indicadorBienoServicio: (it.indicadorBienoServicio ?? '2') as '1' | '2',
        unidadMedida:           it.unidadMedida,
      }));
    } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tipoEcf, setTipoEcf]         = useState(initialData?.tipoEcf ?? '31');
  const [categoriaId, setCategoriaId] = useState('factura-venta');
  const regla = TIPO_ECF_REGLAS[tipoEcf];

  // ── Cliente / comprador ────────────────────────────────────────────────────
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [rncManual, setRncManual]             = useState(initialData?.rncComprador ?? '');
  const [rncManualNombre, setRncManualNombre] = useState(initialData?.razonSocialComprador ?? '');
  const [emailManual, setEmailManual]         = useState(initialData?.emailComprador ?? '');
  const [telefonoManual, setTelefonoManual]   = useState(initialData?.telefonoComprador ?? '');
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);

  // ── Plazos de pago ─────────────────────────────────────────────────────────
  const tipoPagoToPlazaId = (tp: number | null): string => {
    if (!tp || tp === 1) return 'contado';
    if (tp === 3) return 'gratuito';
    if (tp === 4) return 'uso';
    return 'credito-30';
  };
  const [plazoId, setPlazoId]               = useState(() => tipoPagoToPlazaId(initialData?.tipoPago ?? null));
  const [customPlazos, setCustomPlazos]     = useState<Plazo[]>([]);
  const [showNuevoPlazo, setShowNuevoPlazo] = useState(false);
  const [npNombre, setNpNombre]             = useState('');
  const [npDias, setNpDias]                 = useState('');
  const [npError, setNpError]               = useState<string | null>(null);

  const [fechaEmision, setFechaEmision]       = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaLimitePago, setFechaLimitePago] = useState(initialData?.fechaLimitePago ?? '');
  const [ncfModificado, setNcfModificado]     = useState(initialData?.ncfModificado ?? '');
  const [codigoModificacion, setCodigoModificacion] = useState<string>('');
  const [fechaNcfModificado, setFechaNcfModificado] = useState<string>('');
  const [tipoIngresos, setTipoIngresos]       = useState<string>('1');

  // ── Items (useReducer) ─────────────────────────────────────────────────────
  const [items, dispatchItems] = useItemsState(itemsIniciales);
  const [showNuevoProductoIdx, setShowNuevoProductoIdx] = useState<number | null>(null);

  // ── Retenciones ────────────────────────────────────────────────────────────
  const [retenciones, setRetenciones] = useState<Retencion[]>(() => {
    if (!initialData?.retenciones) return [];
    try { return JSON.parse(initialData.retenciones); } catch { return []; }
  });

  // ── Items columns visibility (Referencia/Descripción) — persistido ────────
  const [showItemRef, setShowItemRef] = useState(false);
  const [showItemDesc, setShowItemDesc] = useState(false);
  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      const cols = prefs.itemsCols ?? {};
      // Auto-show si borrador tiene contenido
      const hasRef = (initialData?.lineasJson ? JSON.parse(initialData.lineasJson) : items).some(
        (i: { referencia?: string }) => (i.referencia ?? '').trim().length > 0,
      );
      const hasDesc = (initialData?.lineasJson ? JSON.parse(initialData.lineasJson) : items).some(
        (i: { descripcionItem?: string }) => (i.descripcionItem ?? '').trim().length > 0,
      );
      setShowItemRef(Boolean(cols.referencia) || hasRef);
      setShowItemDesc(Boolean(cols.descripcion) || hasDesc);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── NCF gear modal ─────────────────────────────────────────────────────────
  const [showEditarNcf, setShowEditarNcf]     = useState(false);
  const [ncfPieFactura, setNcfPieFactura]     = useState('');
  const [ncfSiguienteNum, setNcfSiguienteNum] = useState('');
  const [ncfFechaVenc, setNcfFechaVenc]       = useState('');
  const [ncfSaving, setNcfSaving]             = useState(false);
  const [ncfError,  setNcfError]              = useState<string | null>(null);

  const [notas, setNotas]                  = useState(initialData?.notas ?? '');
  const [terminosCondiciones, setTerminos] = useState(initialData?.terminosCondiciones ?? '');
  const [pieFactura, setPieFactura]        = useState(initialData?.pieFactura ?? '');

  // ── Pago recibido ──────────────────────────────────────────────────────────
  const [pagoRecibido, setPagoRecibido] = useState(false);
  const [pagoFecha, setPagoFecha]       = useState(() => new Date().toISOString().slice(0, 10));
  const [pagoCuenta, setPagoCuenta]     = useState('');
  const [pagoMetodo, setPagoMetodo]     = useState('efectivo');
  const [pagoValor, setPagoValor]       = useState('');

  const [comentario, setComentario] = useState(initialData?.comentario ?? '');

  // ── Enviar por correo modal ────────────────────────────────────────────────
  const [showEnviarCorreo, setShowEnviarCorreo]   = useState(false);
  const [emailEnviar, setEmailEnviar]             = useState('');
  const [emailSending, setEmailSending]           = useState(false);
  const [correoDocumentoId, setCorreoDocumentoId] = useState<number | null>(null);
  const [correoEncf, setCorreoEncf]               = useState<string>('');

  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [resultado, setResultado]       = useState<ResultadoEmision | null>(null);
  const [draftKey] = useState(() => `emitedo:draft:${initialData?.id ?? 'new'}`);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [vistaPrevia, setVistaPrevia]   = useState(false);
  const [previewDocId, setPreviewDocId] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // ── TOP SECTION: Almacén / Lista / Vendedor ───────────────────────────────
  const [showAlmacen, setShowAlmacen]               = useState(false);
  const [showListaPrecios, setShowListaPrecios]     = useState(false);
  const [showVendedor, setShowVendedor]             = useState(false);

  const [almacenId, setAlmacenId]                   = useState<number | null>(null);
  const [almacenNombre, setAlmacenNombre]           = useState('');
  const [listaPreciosId, setListaPreciosId]         = useState<number | null>(null);
  const [listaPreciosNombre, setListaPreciosNombre] = useState('');
  const [vendedorId, setVendedorId]                 = useState<number | null>(null);
  const [vendedorNombre, setVendedorNombre]         = useState('');

  const {
    almacenes, setAlmacenes,
    listasPrecios, setListasPrecios,
    vendedores, setVendedores,
  } = useDropdownsCatalog();

  const [showNuevoAlmacen, setShowNuevoAlmacen]   = useState(false);
  const [showNuevaLista, setShowNuevaLista]       = useState(false);
  const [showNuevoVendedor, setShowNuevoVendedor] = useState(false);

  // ── Próximo NCF ───────────────────────────────────────────────────────────
  const onPieDeFactura = useCallback((p: string) => setPieFactura(p), []);
  const { secuencia, invalidar: invalidarSecuencia } = useSecuencia(tipoEcf, onPieDeFactura);

  // ── Load plazos personalizados + visibility prefs from localStorage ───────
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

  // ── Autosave: restore draft on mount (only when no initialData) ───────────
  useEffect(() => {
    if (initialData) { setDraftHydrated(true); return; }
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.tipoEcf)             setTipoEcf(data.tipoEcf);
        if (data.rncManual)           setRncManual(data.rncManual);
        if (data.rncManualNombre)     setRncManualNombre(data.rncManualNombre);
        if (data.emailManual)         setEmailManual(data.emailManual);
        if (data.telefonoManual)      setTelefonoManual(data.telefonoManual);
        if (data.notas)               setNotas(data.notas);
        if (data.terminosCondiciones) setTerminos(data.terminosCondiciones);
        if (data.comentario)          setComentario(data.comentario);
        if (data.tipoIngresos)        setTipoIngresos(data.tipoIngresos);
        // Retenciones NO se restauran desde autosave (alto impacto en total — usuario debe re-elegir)
      }
    } catch {}
    setDraftHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Autosave: persist draft (debounced) ───────────────────────────────────
  useEffect(() => {
    if (!draftHydrated) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          tipoEcf, rncManual, rncManualNombre, emailManual, telefonoManual,
          notas, terminosCondiciones, comentario, tipoIngresos, retenciones,
          savedAt: Date.now(),
        }));
      } catch {}
    }, 1000);
    return () => clearTimeout(t);
  }, [
    draftHydrated, draftKey, tipoEcf, rncManual, rncManualNombre, emailManual,
    telefonoManual, notas, terminosCondiciones, comentario, tipoIngresos, retenciones,
  ]);

  function toggleOpcion(key: string, value: boolean) {
    try {
      const prefs = JSON.parse(localStorage.getItem('emitedo:facturaOpciones') ?? '{}');
      prefs[key] = value;
      localStorage.setItem('emitedo:facturaOpciones', JSON.stringify(prefs));
    } catch {}
  }

  // ── Apply lista de precios a items ────────────────────────────────────────
  useEffect(() => {
    if (!listaPreciosId) return;
    const lista = listasPrecios.find(l => l.id === listaPreciosId);
    if (!lista || lista.tipo !== 'porcentaje' || lista.porcentaje <= 0) return;
    dispatchItems({ type: 'APPLY_LISTA_PORC', porcentaje: lista.porcentaje });
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
    const tasa = (p.tasaItbis as ItemLinea['tasaItbis']) ?? '0.18';
    dispatchItems({
      type: 'APPLY_PRODUCTO',
      idx,
      patch: {
        productoId: p.id,
        nombreItem: p.nombre,
        referencia: p.referencia ?? '',
        descripcionItem: p.descripcion ?? '',
        precioUnitarioItem: p.precioDOP,
        tasaItbis: regla?.permiteItbis ? tasa : 'exento',
        indicadorBienoServicio: p.tipo === 'bien' ? '1' : '2',
        unidadMedida: (p as Producto & { unidad?: string }).unidad ?? '',
      },
    });
  }

  // ─── Cambio de tipo ───────────────────────────────────────────────────────
  function handleChangeTipo(t: string) {
    setTipoEcf(t);
    limpiarCliente();
    setNcfModificado('');
    setError(null);
    const r = TIPO_ECF_REGLAS[t];
    if (!r?.permiteItbis) dispatchItems({ type: 'FORCE_EXENTO' });
    const todosPlazos = [...PLAZOS_BASE, ...customPlazos];
    const plazoAct    = todosPlazos.find(p => p.id === plazoId) ?? PLAZOS_BASE[0];
    if (r?.tiposPagoPermitidos && !r.tiposPagoPermitidos.includes(plazoAct.dgiiTipo)) {
      const primer = PLAZOS_BASE.find(p => r.tiposPagoPermitidos!.includes(p.dgiiTipo));
      setPlazoId(primer?.id ?? 'contado');
      setFechaLimitePago('');
    }
  }

  // ─── Items ────────────────────────────────────────────────────────────────
  const addItem    = () => dispatchItems({ type: 'ADD' });
  const removeItem = (id: number) => dispatchItems({ type: 'REMOVE', id });
  const updateItem = (id: number, field: keyof ItemLinea, value: string | number) =>
    dispatchItems({ type: 'UPDATE', id, field, value });

  // ─── Reset ────────────────────────────────────────────────────────────────
  function resetForm() {
    limpiarCliente();
    setPlazoId('contado'); setFechaEmision(new Date().toISOString().slice(0, 10)); setFechaLimitePago(''); setNcfModificado('');
    setCodigoModificacion(''); setFechaNcfModificado(''); setTipoIngresos('1');
    dispatchItems({ type: 'RESET' });
    setRetenciones([]);
    setNotas(''); setTerminos(''); setPieFactura('');
    setPagoRecibido(false); setPagoFecha(new Date().toISOString().slice(0, 10));
    setPagoCuenta(''); setPagoMetodo('efectivo'); setPagoValor('');
    setComentario('');
    setAlmacenId(null); setAlmacenNombre('');
    setListaPreciosId(null); setListaPreciosNombre('');
    setVendedorId(null); setVendedorNombre('');
    setError(null);
    invalidarSecuencia(tipoEcf);
  }

  // ─── Build payload (delegate to util) ─────────────────────────────────────
  function buildPayload(modo: 'emitir' | 'borrador') {
    return buildPayloadFn({
      modo, tipoEcf, fechaEmision, clienteSeleccionado, rncManual, rncManualNombre, emailManual,
      customPlazos, plazoId, fechaLimitePago, ncfModificado, items,
      codigoModificacion, fechaNcfModificado, tipoIngresos,
      retenciones, notas, terminosCondiciones, pieFactura, comentario,
      pagoRecibido, pagoMetodo, pagoCuenta, pagoValor, pagoFecha,
      almacenId, listaPreciosId, vendedorId,
    });
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
    if (!nombre)                               { setNpError('El nombre es obligatorio'); return; }
    if (isNaN(dias) || dias < 1 || dias > 365) { setNpError('Los días deben ser entre 1 y 365'); return; }

    const id = `custom_${Date.now()}`;
    const nuevo: Plazo = { id, label: nombre, dgiiTipo: 2, dias, custom: true };
    const updated = [...customPlazos, nuevo];
    setCustomPlazos(updated);
    try { localStorage.setItem('emitedo:plazos', JSON.stringify(updated)); } catch {}

    setPlazoId(id);
    const d = new Date(fechaEmision);
    d.setDate(d.getDate() + dias);
    setFechaLimitePago(d.toISOString().slice(0, 10));
    setShowNuevoPlazo(false);
  }

  // ── Memoized totales ───────────────────────────────────────────────────────
  const totales = useMemo(() => calcularTotales(items), [items]);
  const totalRetenciones = useMemo(() => retenciones.reduce((s, r) => s + r.monto, 0), [retenciones]);
  const totalNeto = totales.total - totalRetenciones;

  const plazosDisponibles = useMemo(
    () => [...PLAZOS_BASE, ...customPlazos].filter(
      p => !regla?.tiposPagoPermitidos || regla.tiposPagoPermitidos.includes(p.dgiiTipo),
    ),
    [customPlazos, regla],
  );
  const plazoActual = plazosDisponibles.find(p => p.id === plazoId) ?? plazosDisponibles[0];

  function validar(): string | null {
    const rncFinal   = clienteSeleccionado?.rnc ?? rncManual;
    const razonFinal = clienteSeleccionado?.razonSocial ?? rncManualNombre;
    if (regla?.requiereRncComprador && !rncFinal.trim())
      return `El ${regla.rncLabel} es obligatorio para este tipo de comprobante`;
    if (regla?.requiereRazonSocial && !razonFinal.trim())
      return `La razón social del ${regla.compradorLabel} es obligatoria`;
    if (regla?.requiereNcfModificado && !ncfModificado.trim())
      return 'Debes indicar el e-NCF original que se modifica';
    if (regla?.requiereNcfModificado && !codigoModificacion)
      return 'Debes seleccionar el código de modificación (Anula, Corrige texto, Corrige monto, etc.)';
    if (regla?.requiereNcfModificado && !fechaNcfModificado)
      return 'Debes indicar la fecha del e-NCF original que se modifica';
    if (tipoEcf === '32' && totales.total >= 250000 && !rncFinal.trim())
      return 'Factura de Consumo ≥ DOP 250,000 requiere RNC o cédula del comprador';
    if (plazoActual?.dgiiTipo === 2 && !fechaLimitePago)
      return 'Para tipo de pago Crédito, debes definir fecha límite de pago.';
    if (items.every((i) => !i.nombreItem.trim()))
      return 'Agrega al menos un ítem con nombre';
    if (items.filter(i => i.nombreItem.trim()).every(i => i.precioUnitarioItem <= 0))
      return 'Los ítems deben tener un precio mayor a 0';
    return null;
  }

  /** Guarda como borrador y abre el PDF real en el modal de preview */
  async function handleVistaPrevia() {
    const err = items.every(i => !i.nombreItem.trim()) ? 'Agrega al menos un ítem' : null;
    if (err) { setError(err); return; }

    setLoadingPreview(true);
    setError(null);
    try {
      const res  = await fetch('/api/ecf/emitir', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload('borrador')),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error guardando borrador'); return; }
      setPreviewDocId(data.documentoId);
      setVistaPrevia(true);
    } catch {
      setError('Error de conexión al guardar el borrador');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function emitir(modo: 'emitir' | 'borrador', opts?: { andThen?: 'nueva' | 'imprimir' | 'correo' }) {
    const err = modo === 'borrador' ? (items.every(i => !i.nombreItem.trim()) ? 'Agrega al menos un ítem' : null) : validar();
    if (err) { setError(err); return; }

    if (modo === 'emitir') {
      try {
        const payload = buildPayload('emitir');
        // Augmentar payload con campos derivados que el mapper computará server-side
        // pero que el validator client-side necesita ver para no marcar REQUIRED missing.
        const tasaToIndicador = (t: string | number): 1 | 2 | 3 | 4 => {
          const s = String(t);
          if (s === '0.18') return 1;
          if (s === '0.16') return 2;
          if (s === '0')    return 3;
          return 4; // exento o fallback
        };
        const tiposExentos = ['43', '44']; // forzar indicador=4
        const itemsAugmented = (payload.items ?? []).map(i => ({
          ...i,
          indicadorFacturacion: tiposExentos.includes(tipoEcf) ? 4 : tasaToIndicador(i.tasaItbis ?? 'exento'),
          montoItem: (i.cantidadItem ?? 0) * (i.precioUnitarioItem ?? 0) - (i.descuentoMonto ?? 0),
        }));
        // indicadorMontoGravado REQUIRED si algún ítem está gravado (indicador 1, 2 o 3)
        // 0 = precios NO incluyen ITBIS (default — nuestro form calcula ITBIS encima)
        // 1 = precios SÍ incluyen ITBIS
        const hayItemsGravados = itemsAugmented.some(i => [1, 2, 3].includes(i.indicadorFacturacion));
        const validationPayload = {
          ...payload,
          montoTotal: totales.total,
          items: itemsAugmented,
          ...(hayItemsGravados ? { indicadorMontoGravado: 0 } : {}),
          // Renombrar campos para tipo 41 (Compras) — usa rncProveedor en lugar de rncComprador
          ...(tipoEcf === '41' ? {
            rncProveedor:         payload.rncComprador,
            razonSocialProveedor: payload.razonSocialComprador,
          } : {}),
        };
        const result = validateEcf(tipoEcf, validationPayload, {
          context: {
            tipoPago: plazoActual?.dgiiTipo,
            ncfModificado: ncfModificado || undefined,
            montoTotal: totales.total,
            rncComprador: payload.rncComprador,
          },
        });
        if (!result.ok && result.errors.length > 0) {
          setError(result.errors.slice(0, 3).map(e => `${e.nombre}: ${e.message}`).join('; '));
          return;
        }
      } catch (e) {
        console.warn('[validator] fallo silencioso:', e);
      }
    }

    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/ecf/emitir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload(modo)) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return; }
      if (modo === 'emitir') {
        try { localStorage.removeItem(draftKey); } catch {}
      }
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await emitir('emitir');
  }

  // ─── Cmd/Ctrl + Enter → emitir ────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!loading && !resultado) {
          void emitir('emitir');
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, resultado]);

  // ─── Guardar NCF modal ────────────────────────────────────────────────────
  async function handleGuardarNcf() {
    if (!secuencia?.id) return;
    setNcfSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (ncfSiguienteNum) body.siguiente        = parseInt(ncfSiguienteNum);
      if (ncfFechaVenc)    body.fechaVencimiento = ncfFechaVenc;
      body.pieDeFactura = ncfPieFactura.trim() || null;

      const res = await fetch(`/api/secuencias/${secuencia.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setNcfError(data.error ?? 'Error al guardar'); return; }
      setShowEditarNcf(false);
      invalidarSecuencia(tipoEcf);
    } catch {
      setNcfError('Error de conexión');
    } finally {
      setNcfSaving(false);
    }
  }

  // ─── Pantalla de éxito ────────────────────────────────────────────────────
  if (resultado) {
    return (
      <div className="bg-[#eef0f7] min-h-full p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-md p-5 sm:p-8 text-center">
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
              <Button variant="outline" onClick={() => { setResultado(null); dispatchItems({ type: 'RESET' }); limpiarCliente(); }}>Emitir otro</Button>
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
      <a href="#main-content" className="skip-link">Saltar al contenido</a>
      <div className="p-3 sm:p-4 md:p-5">
        <NavBar
          showAlmacen={showAlmacen}             setShowAlmacen={setShowAlmacen}
          showListaPrecios={showListaPrecios}   setShowListaPrecios={setShowListaPrecios}
          showVendedor={showVendedor}           setShowVendedor={setShowVendedor}
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
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            const t = e.target as HTMLElement;
            const isInput = t.tagName === 'INPUT' || t.tagName === 'SELECT';
            const isSubmitBtn = t.tagName === 'BUTTON' && (t as HTMLButtonElement).type === 'submit';
            if (e.key === 'Enter' && isInput && !isSubmitBtn) {
              e.preventDefault();
            }
          }}
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

          {/* ── SPLIT LAYOUT: form left, sticky sidebar right ─────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 lg:gap-5">
            {/* LEFT column */}
            <div className="space-y-4 min-w-0">
              <CompactHeader
                empresa={empresa}
                categoriaId={categoriaId} setCategoriaId={setCategoriaId}
                tipoEcf={tipoEcf} onChangeTipo={handleChangeTipo}
                secuencia={secuencia}
                fechaEmision={fechaEmision}
                onEditarNcf={() => {
                  setNcfSiguienteNum('');
                  setNcfFechaVenc(secuencia?.fechaVencimiento ? secuencia.fechaVencimiento.slice(0, 10) : '');
                  setNcfPieFactura(secuencia?.pieDeFactura ?? '');
                  setNcfError(null);
                  setShowEditarNcf(true);
                }}
              />

              <SectionCard number={1} title="Datos del cliente" icon={User}>
                <ClienteSection
                  clienteSeleccionado={clienteSeleccionado}
                  buscarClientes={buscarClientes}
                  onSelectCliente={seleccionarCliente}
                  onClearCliente={limpiarCliente}
                  onOpenNuevoCliente={() => setShowNuevoCliente(true)}
                  regla={regla}
                  rncManual={rncManual} rncManualNombre={rncManualNombre}
                  setRncManual={setRncManual} setRncManualNombre={setRncManualNombre}
                  emailManual={emailManual} setEmailManual={setEmailManual}
                  telefonoManual={telefonoManual} setTelefonoManual={setTelefonoManual}
                  tipoEcf={tipoEcf} totalDocumento={totales.total}
                />
              </SectionCard>

              <SectionCard number={2} title="Detalles de la factura" icon={Calendar}>
                <DetallesSection
                  regla={regla} tipoEcf={tipoEcf}
                  fechaEmision={fechaEmision} setFechaEmision={setFechaEmision}
                  plazoId={plazoId} onPlazoChange={handlePlazoChange}
                  plazosDisponibles={plazosDisponibles} plazoActual={plazoActual}
                  fechaLimitePago={fechaLimitePago} setFechaLimitePago={setFechaLimitePago}
                  ncfModificado={ncfModificado} setNcfModificado={setNcfModificado}
                  codigoModificacion={codigoModificacion} setCodigoModificacion={setCodigoModificacion}
                  fechaNcfModificado={fechaNcfModificado} setFechaNcfModificado={setFechaNcfModificado}
                  tipoIngresos={tipoIngresos} setTipoIngresos={setTipoIngresos}
                  today={today}
                />
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
                  regla={regla}
                  buscarProductos={buscarProductos}
                  onSelectProducto={seleccionarProducto}
                  onAddItem={addItem}
                  onRemoveItem={removeItem}
                  onUpdateItem={updateItem}
                  onOpenNuevoProducto={(idx) => setShowNuevoProductoIdx(idx)}
                  showReferencia={showItemRef}
                  showDescripcion={showItemDesc}
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
                number={6} title="Pie de factura" icon={FileText}
                defaultOpen={pieFactura.trim().length > 0}
              >
                <PieFactura pieFactura={pieFactura} setPieFactura={setPieFactura} />
              </AccordionSection>

              <AccordionSection
                number={7} title="Comentario" icon={MessageSquare}
                defaultOpen={comentario.trim().length > 0}
              >
                <Comentarios comentario={comentario} setComentario={setComentario} />
              </AccordionSection>

              {/* Sección 8 Pago movida al sidebar derecho (ResumenSidebar) */}
            </div>

            {/* RIGHT column — sticky sidebar: Resumen + Pago */}
            <ResumenSidebar
              empresa={empresa}
              totales={totales}
              retenciones={retenciones}
              totalNeto={totalNeto}
              items={items}
              pagoRecibido={pagoRecibido} setPagoRecibido={setPagoRecibido}
              pagoMetodo={pagoMetodo} setPagoMetodo={setPagoMetodo}
              pagoCuenta={pagoCuenta} setPagoCuenta={setPagoCuenta}
              pagoValor={pagoValor} setPagoValor={setPagoValor}
              pagoFecha={pagoFecha} setPagoFecha={setPagoFecha}
            />
          </div>

          {/* Action bar — sticky bottom, full width */}
          <BottomActionBar
            items={items}
            loading={loading}
            loadingPreview={loadingPreview}
            onVistaPrevia={handleVistaPrevia}
            onEmitir={emitir}
          />
        </form>

        {/* Modals */}
        <ModalPreviewPDF
          open={vistaPrevia}
          onOpenChange={setVistaPrevia}
          tipoEcf={tipoEcf}
          previewDocId={previewDocId}
          loading={loading}
          onEmitir={() => { setVistaPrevia(false); emitir('emitir'); }}
        />

        <ModalEditarNCF
          open={showEditarNcf}
          onClose={() => { setShowEditarNcf(false); setNcfError(null); }}
          tipoEcf={tipoEcf} secuencia={secuencia}
          ncfSiguienteNum={ncfSiguienteNum} setNcfSiguienteNum={setNcfSiguienteNum}
          ncfFechaVenc={ncfFechaVenc} setNcfFechaVenc={setNcfFechaVenc}
          ncfPieFactura={ncfPieFactura} setNcfPieFactura={setNcfPieFactura}
          ncfError={ncfError} ncfSaving={ncfSaving} onSave={handleGuardarNcf}
        />

        <ModalNuevoPlazo
          open={showNuevoPlazo}
          onClose={() => setShowNuevoPlazo(false)}
          npNombre={npNombre} setNpNombre={setNpNombre}
          npDias={npDias} setNpDias={setNpDias}
          npError={npError} onGuardar={handleGuardarNuevoPlazo}
        />

        <ModalEnviarCorreo
          open={showEnviarCorreo}
          onClose={() => setShowEnviarCorreo(false)}
          emailEnviar={emailEnviar} setEmailEnviar={setEmailEnviar}
          correoEncf={correoEncf} correoDocumentoId={correoDocumentoId}
          emailSending={emailSending} setEmailSending={setEmailSending}
        />

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
            setAlmacenId(a.id);
            setAlmacenNombre(a.nombre);
            setShowNuevoAlmacen(false);
          }}
        />

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
