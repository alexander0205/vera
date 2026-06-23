'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
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
import { ClasificacionFactura, type ClasifAsig } from './sections/ClasificacionFactura';
import { ColumnasToggle } from './sections/ColumnasToggle';
import { RetencionesSection } from './sections/RetencionesSection';
import { ResumenSidebar } from './sections/ResumenSidebar';
import type { PagoLinea } from '@/components/pagos/PagoMetodos';
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
import { ModalEnviarCorreo } from './modals/ModalEnviarCorreo';

import { useSecuencia } from './hooks/useSecuencia';
import { useDropdownsCatalog } from './hooks/useDropdownsCatalog';
import { useItemsState } from './hooks/useFacturaState';

import { calcularTotales } from './utils/calculos';
import { buildPayload as buildPayloadFn } from './utils/buildPayload';
import { validate as validateEcf } from '@/lib/factura/validator';
import type {
  BorradorInicial, Cliente, EmpresaPerfil, ItemLinea, Producto,
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
        dependienteId:          it.dependienteId ?? null,
        dependienteNombre:      it.dependienteNombre ?? '',
      }));
    } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // '00' = marcador HISTORICA (sin e-CF real) → en el form equivale a 'sin-ncf'.
  const [tipoEcf, setTipoEcf]         = useState(
    initialData?.tipoEcf && initialData.tipoEcf !== '00' ? initialData.tipoEcf : 'sin-ncf',
  );
  const [categoriaId, setCategoriaId] = useState('factura-venta');
  const regla = TIPO_ECF_REGLAS[tipoEcf];

  // ── Clasificación por maestros (Plan A) ─────────────────────────────────────
  const [clasificacion, setClasificacion] = useState<ClasifAsig[]>([]);

  // ── Cliente / comprador ────────────────────────────────────────────────────
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [rncManual, setRncManual]             = useState(initialData?.rncComprador ?? '');
  const [rncManualNombre, setRncManualNombre] = useState(initialData?.razonSocialComprador ?? '');
  const [emailManual, setEmailManual]         = useState(initialData?.emailComprador ?? '');
  const [telefonoManual, setTelefonoManual]   = useState(initialData?.telefonoComprador ?? '');
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);

  // ── Dependientes (por línea) ───────────────────────────────────────────────
  const [dependientesCliente, setDependientesCliente] = useState<
    { id: number; nombre: string; apellido: string }[]
  >([]);
  // Si hay borrador con clientId, cargar dependientes al montar
  useEffect(() => {
    if (!initialData?.clientId) return;
    fetch(`/api/clientes/${initialData.clientId}/dependientes`)
      .then(r => r.json())
      .then(data => {
        const lista = Array.isArray(data.dependientes) ? data.dependientes : [];
        setDependientesCliente(lista);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Condición de pago ──────────────────────────────────────────────────────
  // DGII: 1=contado, 2=crédito, 3=gratuito, 4=uso/consumo.
  const [fechaEmision, setFechaEmision] = useState(() => new Date().toISOString().slice(0, 10));
  // Factura NUEVA → arranca con el default del team (si hay plazo > 0 → crédito).
  // Editar borrador → respeta el tipoPago guardado.
  const [condicionPago, setCondicionPago] = useState(() => {
    if (initialData?.tipoPago != null) return String(initialData.tipoPago);
    const dias = empresa?.plazoPagoDefaultDias;
    return dias != null && dias > 0 ? '2' : '1';
  });
  // Días para pago (solo aplica si condición = crédito). Al editar un borrador a
  // crédito con vencimiento guardado, derivamos los días desde la diferencia de fechas.
  const [diasParaPago, setDiasParaPago] = useState(() => {
    if (initialData?.tipoPago === 2 && initialData.fechaLimitePago) {
      const emis = new Date(`${new Date().toISOString().slice(0, 10)}T00:00`);
      const venc = new Date(`${initialData.fechaLimitePago.slice(0, 10)}T00:00`);
      // En edición la fecha de emisión arranca en hoy; usamos hoy como base coherente
      // con el cálculo del effect. Si el borrador trae fechaEmision propia, el effect
      // recalculará el vencimiento; aquí solo inferimos los días iniciales.
      const diff = Math.round((venc.getTime() - emis.getTime()) / 86400000);
      return String(diff >= 1 ? diff : (empresa?.plazoPagoDefaultDias ?? 5));
    }
    return String(empresa?.plazoPagoDefaultDias ?? 5);
  });
  const [fechaLimitePago, setFechaLimitePago] = useState(() => {
    if (initialData) return initialData.fechaLimitePago ?? '';
    const dias = empresa?.plazoPagoDefaultDias;
    if (dias != null && dias > 0) {
      const d = new Date();
      d.setDate(d.getDate() + dias);
      return d.toISOString().slice(0, 10);
    }
    return '';
  });

  // Deriva el vencimiento: crédito → fechaEmision + N días; cualquier otra
  // condición → sin vencimiento.
  useEffect(() => {
    if (condicionPago === '2') {
      const n = parseInt(diasParaPago || '0', 10);
      if (fechaEmision && n > 0) {
        const d = new Date(`${fechaEmision}T00:00`);
        d.setDate(d.getDate() + n);
        setFechaLimitePago(d.toISOString().slice(0, 10));
      } else {
        setFechaLimitePago('');
      }
    } else {
      setFechaLimitePago('');
    }
  }, [condicionPago, diasParaPago, fechaEmision]);
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
  // Al editar un borrador con split, restauramos las líneas desde initialData.
  const [pagoRecibido, setPagoRecibido] = useState(initialData?.pagoRecibido ?? false);
  const [pagoFecha, setPagoFecha]       = useState(
    initialData?.pagoFecha ?? new Date().toISOString().slice(0, 10),
  );
  // Líneas de pago (1 línea = pago normal; el repeater permite agregar más).
  const [pagoLineas, setPagoLineas] = useState<PagoLinea[]>(
    initialData?.pagoLineas && initialData.pagoLineas.length > 0
      ? initialData.pagoLineas
      : [{ metodo: 'efectivo', valor: '', cuenta: '' }],
  );

  const [comentario, setComentario] = useState(initialData?.comentario ?? '');

  // ── Enviar por correo modal ────────────────────────────────────────────────
  const [showEnviarCorreo, setShowEnviarCorreo]   = useState(false);
  const [emailEnviar, setEmailEnviar]             = useState('');
  const [emailSending, setEmailSending]           = useState(false);
  const [correoDocumentoId, setCorreoDocumentoId] = useState<number | null>(null);
  const [correoEncf, setCorreoEncf]               = useState<string>('');

  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  // Mirror error → toast (más visible, no requiere scroll para verlo)
  useEffect(() => { if (error) toast.error(error, { duration: 6500 }); }, [error]);
  const [resultado, setResultado]       = useState<ResultadoEmision | null>(null);
  const [draftKey] = useState(() => `emitedo:draft:${initialData?.id ?? 'new'}`);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [vistaPrevia, setVistaPrevia]   = useState(false);
  // Vista previa = PDF en blob URL (NO crea factura en DB). Ver /api/pdf/factura/preview.
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  // Guard atómico anti doble-submit: el `loading` (state React) no bloquea clicks
  // disparados en el mismo tick. Este ref sí, de forma síncrona.
  const submittingRef = useRef(false);

  // ── TOP SECTION: Almacén / Lista / Vendedor ───────────────────────────────
  const [showAlmacen, setShowAlmacen]               = useState(false);
  const [showListaPrecios, setShowListaPrecios]     = useState(false);
  const [showVendedor, setShowVendedor]             = useState(false);

  const [almacenId, setAlmacenId]                   = useState<number | null>(initialData?.almacenId ?? null);
  const [almacenNombre, setAlmacenNombre]           = useState('');
  const [listaPreciosId, setListaPreciosId]         = useState<number | null>(initialData?.listaPreciosId ?? null);
  const [listaPreciosNombre, setListaPreciosNombre] = useState('');
  const [vendedorId, setVendedorId]                 = useState<number | null>(initialData?.vendedorId ?? null);
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

  // ── Load visibility prefs from localStorage ───────────────────────────────
  useEffect(() => {
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
    // Limpiar dependientes y beneficiarios de items al cambiar cliente
    setDependientesCliente([]);
    dispatchItems({ type: 'CLEAR_BENEFICIARIOS' });
    // Fetch dependientes del cliente
    fetch(`/api/clientes/${c.id}/dependientes`)
      .then(r => r.json())
      .then(data => {
        const lista = Array.isArray(data.dependientes) ? data.dependientes : [];
        setDependientesCliente(lista);
      })
      .catch(() => setDependientesCliente([]));
  }

  function limpiarCliente() {
    setClienteSeleccionado(null);
    setRncManual('');
    setRncManualNombre('');
    setEmailManual('');
    setTelefonoManual('');
    setDependientesCliente([]);
    dispatchItems({ type: 'CLEAR_BENEFICIARIOS' });
  }

  function handleSelectBeneficiario(itemId: number, depId: number | null, nombreCompleto: string) {
    dispatchItems({ type: 'UPDATE_BENEFICIARIO', id: itemId, dependienteId: depId, dependienteNombre: nombreCompleto });
    if (depId) setError(null); // limpiar el banner de "falta beneficiario" al elegir uno
  }

  // ─── Búsqueda productos ───────────────────────────────────────────────────
  async function buscarProductos(q: string): Promise<Producto[]> {
    const res  = await fetch(`/api/productos?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.productos ?? [];
  }

  function seleccionarProducto(idx: number, p: Producto) {
    const tasa = (p.tasaItbis as ItemLinea['tasaItbis']) ?? '0.18';
    // Si la regla no existe (tipoEcf = 'sin-ncf' o sin tipo) usar la tasa del
    // producto. Solo forzar 'exento' si la regla explícitamente prohíbe ITBIS.
    const tasaFinal: ItemLinea['tasaItbis'] =
      regla === undefined         ? tasa :
      regla.permiteItbis          ? tasa : 'exento';
    dispatchItems({
      type: 'APPLY_PRODUCTO',
      idx,
      patch: {
        productoId: p.id,
        nombreItem: p.nombre,
        referencia: p.referencia ?? '',
        descripcionItem: p.descripcion ?? '',
        precioUnitarioItem: p.precioDOP,
        tasaItbis: tasaFinal,
        indicadorBienoServicio: p.tipo === 'bien' ? '1' : '2',
        unidadMedida: (p as Producto & { unidad?: string }).unidad ?? '',
      },
    });

    if (p.controlaInventario) {
      if (p.stockActual === 0 && !p.permiteVentaSinStock) {
        toast.error(`"${p.nombre}" está agotado y no permite venta sin stock.`, { duration: 7000 });
      } else if (p.stockActual === 0) {
        toast.warning(`"${p.nombre}" está agotado. Stock actual: 0 unidades.`, { duration: 6000 });
      } else if (p.stockActual <= p.stockMinimo) {
        toast.warning(`Stock bajo en "${p.nombre}": ${p.stockActual} unidades (mínimo: ${p.stockMinimo}).`, { duration: 6000 });
      }
    }
  }

  /**
   * Cuando el user escribe texto libre que no hace match con productos,
   * crear el producto en DB (precio 0 inicial, tasa default 18%) y
   * seleccionarlo. Así el item queda con productoId — próxima vez aparece
   * en el dropdown sin tener que retipearlo.
   */
  async function crearProductoLibre(idx: number, texto: string) {
    const nombre = texto.trim();
    if (!nombre) return;
    try {
      const item = items[idx];
      const tasaItem = String(item?.tasaItbis ?? '0.18');
      const tasa: '0.18' | '0.16' | '0' | 'exento' =
        tasaItem === '0.16' ? '0.16' :
        tasaItem === '0'    ? '0'    :
        tasaItem === 'exento' ? 'exento' :
        '0.18';
      const res = await fetch('/api/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          precio:    item?.precioUnitarioItem ?? 0,
          tasaItbis: tasa,
          tipo:      'servicio',
        }),
      });
      const data = await res.json();
      if (res.ok && data.producto) {
        seleccionarProducto(idx, data.producto);
      } else {
        // Fallback: setear solo el nombre — no se guarda producto pero la línea queda usable
        dispatchItems({ type: 'UPDATE', id: items[idx].id, field: 'nombreItem', value: nombre });
        toast.error(data.error ?? 'No se pudo crear el producto. Usando texto libre.');
      }
    } catch (e) {
      dispatchItems({ type: 'UPDATE', id: items[idx].id, field: 'nombreItem', value: nombre });
      toast.error(e instanceof Error ? e.message : 'Error de red creando producto');
    }
  }

  // ─── Cambio de tipo ───────────────────────────────────────────────────────
  function handleChangeTipo(t: string) {
    setTipoEcf(t);
    limpiarCliente();
    setNcfModificado('');
    setError(null);
    const r = TIPO_ECF_REGLAS[t];
    if (!r?.permiteItbis) dispatchItems({ type: 'FORCE_EXENTO' });
    // Si el nuevo tipo no permite la condición de pago actual, caer a la primera permitida.
    const cond = parseInt(condicionPago, 10);
    if (r?.tiposPagoPermitidos && !r.tiposPagoPermitidos.includes(cond)) {
      const primer = r.tiposPagoPermitidos[0] ?? 1;
      setCondicionPago(String(primer));
    }
  }

  // ─── Items ────────────────────────────────────────────────────────────────
  const addItem    = () => dispatchItems({ type: 'ADD' });
  const removeItem = (id: number) => dispatchItems({ type: 'REMOVE', id });
  const updateItem = (id: number, field: keyof ItemLinea, value: string | number | null) =>
    dispatchItems({ type: 'UPDATE', id, field, value });

  // ─── Reset ────────────────────────────────────────────────────────────────
  function resetForm() {
    try { localStorage.removeItem(draftKey); } catch {}
    limpiarCliente(); // also resets dependientesCliente + items beneficiarios
    setCondicionPago('1'); setFechaEmision(new Date().toISOString().slice(0, 10)); setFechaLimitePago(''); setNcfModificado('');
    setCodigoModificacion(''); setFechaNcfModificado(''); setTipoIngresos('1');
    dispatchItems({ type: 'RESET' });
    setRetenciones([]);
    setNotas(''); setTerminos(''); setPieFactura('');
    setPagoRecibido(false); setPagoFecha(new Date().toISOString().slice(0, 10));
    setPagoLineas([{ metodo: 'efectivo', valor: '', cuenta: '' }]);
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
      tipoPago: parseInt(condicionPago, 10), fechaLimitePago, ncfModificado, items,
      codigoModificacion, fechaNcfModificado, tipoIngresos,
      retenciones, notas, terminosCondiciones, pieFactura, comentario,
      pagoRecibido, pagoLineas, pagoFecha,
      almacenId, listaPreciosId, vendedorId,
      borradorId: initialData?.id ?? null,
    });
  }

  // ── Memoized totales ───────────────────────────────────────────────────────
  const totales = useMemo(() => calcularTotales(items), [items]);
  const totalRetenciones = useMemo(() => retenciones.reduce((s, r) => s + r.monto, 0), [retenciones]);
  const totalNeto = totales.total - totalRetenciones;

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
    if (condicionPago === '2' && !fechaLimitePago)
      return 'Para tipo de pago Crédito, debes definir el plazo de vencimiento.';
    if (dependientesCliente.length > 0) {
      const itemsConProducto = items.filter(i => i.nombreItem.trim());
      if (itemsConProducto.some(i => !i.dependienteId))
        return 'Cada ítem requiere un beneficiario';
    }
    if (items.every((i) => !i.nombreItem.trim()))
      return 'Agrega al menos un ítem con nombre';
    if (items.filter(i => i.nombreItem.trim()).every(i => i.precioUnitarioItem <= 0))
      return 'Los ítems deben tener un precio mayor a 0';
    return null;
  }

  /**
   * Renderiza el PDF de vista previa SIN crear la factura.
   * Pega a /api/pdf/factura/preview (stateless) → recibe el PDF como blob →
   * lo muestra vía object URL en el modal. Antes esto creaba un borrador real,
   * lo que duplicaba la factura al darle luego a "Guardar".
   */
  async function handleVistaPrevia() {
    const err = items.every(i => !i.nombreItem.trim()) ? 'Agrega al menos un ítem' : null;
    if (err) { setError(err); return; }

    setLoadingPreview(true);
    setError(null);
    try {
      const res = await fetch('/api/pdf/factura/preview', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload('borrador')),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo generar la vista previa');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      // Revocar el blob previo para no acumular memoria.
      setPreviewBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
      setVistaPrevia(true);
    } catch {
      setError('Error de conexión al generar la vista previa');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function emitir(modo: 'emitir' | 'borrador', opts?: { andThen?: 'nueva' | 'imprimir' | 'correo' }) {
    // Sin eCF seleccionado → siempre guardar como borrador (no se emite a DGII)
    const modoEfectivo: 'emitir' | 'borrador' = tipoEcf === 'sin-ncf' ? 'borrador' : modo;

    const err = modoEfectivo === 'borrador' ? (items.every(i => !i.nombreItem.trim()) ? 'Agrega al menos un ítem' : null) : validar();
    if (err) { setError(err); return; }

    if (modoEfectivo === 'emitir') {
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
        // Bug: validator usa payloadKey 'fechaNCFModificado' (NCF mayúsculas)
        // pero buildPayload emite 'fechaNcfModificado' (Ncf). Renombrar para
        // que el validator no marque required-missing en NC tipo 33/34.
        const fechaNcfMod = (payload as { fechaNcfModificado?: string }).fechaNcfModificado;
        const validationPayload: Record<string, unknown> = {
          ...payload,
          montoTotal: totales.total,
          items: itemsAugmented,
          ...(hayItemsGravados ? { indicadorMontoGravado: 0 } : {}),
          ...(fechaNcfMod ? { fechaNCFModificado: fechaNcfMod } : {}),
          // Renombrar campos para tipo 41 (Compras) — usa rncProveedor en lugar de rncComprador
          ...(tipoEcf === '41' ? {
            rncProveedor:         payload.rncComprador,
            razonSocialProveedor: payload.razonSocialComprador,
          } : {}),
          // Tipos 41/43/47: tipoIngresos NO aplica (campo prohibido). Eliminarlo del payload
          // para que el validator no marque "no debe estar presente".
          ...(tipoEcf === '41' || tipoEcf === '43' || tipoEcf === '47'
            ? { tipoIngresos: undefined }
            : {}),
        };
        // Eliminar undefined explícitos para que el validator no los vea
        if ((validationPayload as { tipoIngresos?: unknown }).tipoIngresos === undefined) {
          delete (validationPayload as { tipoIngresos?: unknown }).tipoIngresos;
        }
        const result = validateEcf(tipoEcf, validationPayload, {
          context: {
            tipoPago: parseInt(condicionPago, 10),
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

    // Guard síncrono: si ya hay un submit en vuelo, ignorar este click.
    // Bloquea el doble-click en el mismo tick (el `loading` se aplica un render
    // después y no llega a tiempo). Se libera en el finally.
    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true); setError(null);
    try {
      const res  = await fetch('/api/ecf/emitir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload(modoEfectivo)) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return; }
      try { localStorage.removeItem(draftKey); } catch {}
      // Persistir clasificación por maestros (Plan A) — metadata no fiscal.
      if (data.documentoId) {
        try {
          await fetch(`/api/facturas/${data.documentoId}/maestros`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asignaciones: clasificacion }),
          });
        } catch {}
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
      submittingRef.current = false;
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
    const esSinEcf = resultado.modo === 'borrador';
    return (
      <div className="bg-[#eef0f7] min-h-full p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-md p-5 sm:p-8 text-center">
            <CheckCircle className="h-16 w-16 text-teal-500 mx-auto mb-4" />
            {esSinEcf ? (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Factura guardada!</h2>
                <p className="text-gray-500 mb-6">Tu factura fue guardada correctamente.</p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Comprobante emitido!</h2>
                <p className="text-gray-500 mb-6">Tu e-CF fue enviado a la DGII exitosamente.</p>
              </>
            )}
            <div className="bg-gray-50 rounded-xl p-6 text-left space-y-3 border border-gray-100 mb-6">
              {!esSinEcf && resultado.encf && (
                <div className="flex justify-between"><span className="text-sm text-gray-500">e-NCF</span><span className="font-mono font-bold">{resultado.encf}</span></div>
              )}
              {!esSinEcf && resultado.trackId && (
                <div className="flex justify-between"><span className="text-sm text-gray-500">Track ID</span><span className="font-mono text-sm">{resultado.trackId}</span></div>
              )}
              {!esSinEcf && resultado.codigoSeguridad && (
                <div className="flex justify-between"><span className="text-sm text-gray-500">Código de seguridad</span><span className="font-mono font-bold text-teal-700 text-lg">{resultado.codigoSeguridad}</span></div>
              )}
              <div className="flex justify-between"><span className="text-sm text-gray-500">Monto total</span><span className="font-bold">DOP {(resultado.montoTotal ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span></div>
              {/* Fila cobro — solo en modo borrador (sin-ncf / sin DGII) */}
              {resultado.modo === 'borrador' && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Cobro</span>
                  {resultado.pagoRecibido ? (
                    <span className="text-sm font-medium text-emerald-700">
                      ✓ Cobrado
                      {resultado.pagoMetodo ? ` · ${resultado.pagoMetodo.charAt(0).toUpperCase() + resultado.pagoMetodo.slice(1).replace('_', ' ')}` : ''}
                      {resultado.pagoValor != null ? ` · DOP ${resultado.pagoValor.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : ''}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-amber-600">⏳ Pendiente de cobro</span>
                  )}
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Estado</span>
                <Badge variant="outline">
                  {resultado.modo === 'borrador'
                    ? (resultado.pagoRecibido ? 'Pagada' : 'Guardada')
                    : resultado.estado}
                </Badge>
              </div>
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" asChild><a href={`/api/pdf/factura/${resultado.documentoId}`} target="_blank" rel="noreferrer">Descargar PDF</a></Button>
              <Button variant="outline" asChild><Link href={`/dashboard/facturas/${resultado.documentoId}`}>Ver detalle</Link></Button>
              <Button variant="outline" onClick={() => { try { localStorage.removeItem(draftKey); } catch {} setResultado(null); dispatchItems({ type: 'RESET' }); limpiarCliente(); }}>Nueva factura</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => router.push('/dashboard/facturas')}>Ver todas</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Formulario ───────────────────────────────────────────────────────────
  return (
    <div className="bg-[#eef0f7] min-h-full flex flex-col">
      <a href="#main-content" className="skip-link">Saltar al contenido</a>
      <div className="p-3 sm:p-4 md:p-5 flex-1 flex flex-col">
        <NavBar
          title={initialData ? 'Editar factura' : 'Nueva factura'}
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
                  condicionPago={condicionPago} setCondicionPago={setCondicionPago}
                  diasParaPago={diasParaPago} setDiasParaPago={setDiasParaPago}
                  fechaLimitePago={fechaLimitePago}
                  ncfModificado={ncfModificado} setNcfModificado={setNcfModificado}
                  codigoModificacion={codigoModificacion} setCodigoModificacion={setCodigoModificacion}
                  fechaNcfModificado={fechaNcfModificado} setFechaNcfModificado={setFechaNcfModificado}
                  today={today}
                />
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <ClasificacionFactura
                    docId={initialData?.id}
                    value={clasificacion}
                    onChange={setClasificacion}
                  />
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
                  regla={regla}
                  buscarProductos={buscarProductos}
                  onSelectProducto={seleccionarProducto}
                  onCrearProductoLibre={crearProductoLibre}
                  onAddItem={addItem}
                  onRemoveItem={removeItem}
                  onUpdateItem={updateItem}
                  onSelectBeneficiario={handleSelectBeneficiario}
                  onOpenNuevoProducto={(idx) => setShowNuevoProductoIdx(idx)}
                  showReferencia={showItemRef}
                  showDescripcion={showItemDesc}
                  dependientes={dependientesCliente}
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
              pagoFecha={pagoFecha} setPagoFecha={setPagoFecha}
              pagoLineas={pagoLineas} setPagoLineas={setPagoLineas}
            />
          </div>

          {/* Action bar — sticky bottom, full width */}
          <BottomActionBar
            items={items}
            loading={loading}
            loadingPreview={loadingPreview}
            primaryLabel={tipoEcf === 'sin-ncf' ? 'Guardar factura' : 'Emitir e-CF'}
            loadingPrimaryLabel={tipoEcf === 'sin-ncf' ? 'Guardando…' : 'Emitiendo…'}
            onVistaPrevia={handleVistaPrevia}
            onEmitir={emitir}
            onCancelar={() => {
              try { localStorage.removeItem(draftKey); } catch {}
              router.push('/dashboard/facturas');
            }}
          />
        </form>

        {/* Modals */}
        <ModalPreviewPDF
          open={vistaPrevia}
          onOpenChange={(o) => {
            setVistaPrevia(o);
            // Al cerrar, revocar el blob para liberar memoria.
            if (!o) setPreviewBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
          }}
          tipoEcf={tipoEcf}
          previewUrl={previewBlobUrl}
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
