'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Alert,
  Box,
  Button,
  Chip,
  Typography,
} from '@mui/material';
import {
  AlertTriangle, CheckCircle, User, Calendar, Package, FileText,
  StickyNote, ScrollText, MessageSquare, CreditCard, Send,
} from 'lucide-react';
import { TIPO_ECF_REGLAS } from '@/lib/ecf/types';
import { getCategoriaDeEcf, CATEGORIAS_ECF } from '@/lib/ecf/categorias';

import { NavBar, TopBar } from './sections/TopBar';
import { CompactHeader } from './sections/CompactHeader';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { FacturaOrigenSection, type FacturaResumen } from './sections/FacturaOrigenSection';
import { SectionCard } from './sections/SectionCard';
import { AccordionSection } from './sections/AccordionSection';
import { ClienteSection } from './sections/ClienteSection';
import { DetallesSection, MOTIVOS_NOTA } from './sections/DetallesSection';
import { ItemsTable } from './sections/ItemsTable';
import { ClasificacionFactura, type ClasifAsig } from './sections/ClasificacionFactura';
import { ColumnasToggle } from './sections/ColumnasToggle';
import { RetencionesSection } from './sections/RetencionesSection';
import { ResumenSidebar } from './sections/ResumenSidebar';
import type { PagoLinea } from '@/components/pagos/PagoMetodos';
import { sumaPagos } from '@/components/pagos/PagoMetodos';
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
  categoriaFija,
}: {
  initialPerfil: EmpresaPerfil | null;
  initialData?:  BorradorInicial | null;
  /** Fija la categoría de documento por ruta → oculta el selector de categoría. */
  categoriaFija?: string;
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

  // ── Query params: ?tipo=33|34 [&padreId=N] ─────────────────────────────────
  // tipo → tipo e-CF + categoría iniciales (links "Nueva Nota de Crédito/Débito"
  // y "crear nota desde factura"). Debe resolverse como ESTADO INICIAL, no en un
  // effect: cambiar el value de un Radix Select mientras su item seleccionado se
  // desmonta dispara onValueChange('') y rompe la selección.
  const searchParams = useSearchParams();
  const qpTipo    = !initialData && searchParams.get('tipo') && TIPO_ECF_REGLAS[searchParams.get('tipo')!]
    ? searchParams.get('tipo')!
    : null;
  const qpPadreId = !initialData ? searchParams.get('padreId') : null;

  // Categoría fija por ruta (factura/NC/ND/compras/gastos). Si está presente,
  // oculta el selector de categoría y el tipo arranca en el de esa categoría.
  const catFijaObj = categoriaFija ? CATEGORIAS_ECF.find(c => c.id === categoriaFija) : null;
  const tipoDefaultCatFija = catFijaObj
    ? (catFijaObj.id === 'factura-venta' ? 'sin-ncf' : catFijaObj.tipos[0].codigo)
    : null;

  // '00' = marcador HISTORICA (sin e-CF real) → en el form equivale a 'sin-ncf'.
  const [tipoEcf, setTipoEcf]         = useState(
    initialData?.tipoEcf && initialData.tipoEcf !== '00'
      ? initialData.tipoEcf
      : (qpTipo ?? tipoDefaultCatFija ?? 'sin-ncf'),
  );
  const [categoriaId, setCategoriaId] = useState(
    categoriaFija
      ?? (initialData?.tipoEcf && initialData.tipoEcf !== '00'
            ? getCategoriaDeEcf(initialData.tipoEcf).id
            : qpTipo
              ? getCategoriaDeEcf(qpTipo).id
              : 'factura-venta'),
  );

  // Ocultar el selector de categoría: con categoría fija por ruta, o al editar
  // un borrador (no se cambia el tipo de un documento ya creado).
  const ocultarCategoria = !!categoriaFija || !!initialData;

  // Título de la pantalla según la categoría de documento.
  const tituloDoc = ({
    'nota-credito': { nuevo: 'Nueva nota de crédito', editar: 'Editar nota de crédito' },
    'nota-debito':  { nuevo: 'Nueva nota de débito',  editar: 'Editar nota de débito' },
    'compras':      { nuevo: 'Nueva compra',          editar: 'Editar compra' },
    'gastos':       { nuevo: 'Nuevo gasto',           editar: 'Editar gasto' },
  } as Record<string, { nuevo: string; editar: string }>)[categoriaId]
    ?? { nuevo: 'Nueva factura', editar: 'Editar factura' };

  // Acento + nomenclatura por tipo de documento (factura / NC / ND).
  // Distingue la pantalla con el color del botón primario y la etiqueta del total.
  // Clases Tailwind LITERALES — sin interpolar el color — para que el JIT las incluya.
  const docAccent = ({
    'nota-credito': {
      noun: 'nota de crédito', totalLabel: 'Total a acreditar',
      primaryBtnClass: 'bg-amber-600 hover:bg-amber-700 border-amber-700',
    },
    'nota-debito': {
      noun: 'nota de débito', totalLabel: 'Total a debitar',
      primaryBtnClass: 'bg-blue-600 hover:bg-blue-700 border-blue-700',
    },
  } as Record<string, { noun: string; totalLabel: string; primaryBtnClass: string }>)[categoriaId]
    ?? { noun: 'factura', totalLabel: 'Total',
         primaryBtnClass: 'bg-teal-600 hover:bg-teal-700 border-teal-700' };

  // Base de ruta del detalle/listado según el tipo — para que al crear una NC/ND
  // se aterrice en su vista propia (no en la de factura).
  const detalleBase =
    categoriaId === 'nota-credito' ? '/dashboard/notas-credito'
    : categoriaId === 'nota-debito' ? '/dashboard/notas-debito'
    : '/dashboard/facturas';

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

  // Fecha de emisión editable — solo roles con este permiso (admin/owner) y
  // solo aplica a sin-ncf. Ver CompactHeader y app/api/ecf/emitir/route.ts.
  const { can } = usePermissions();
  const puedeEditarFecha = can('facturas:fecha-personalizada');

  // ── Condición de pago ──────────────────────────────────────────────────────
  // DGII: 1=contado, 2=crédito, 3=gratuito, 4=uso/consumo.
  // Editar borrador → arranca con la fecha guardada (soporta backdating al
  // re-guardar). Factura nueva → hoy.
  const [fechaEmision, setFechaEmision] = useState(
    () => initialData?.fechaEmision ?? new Date().toISOString().slice(0, 10),
  );
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
  const [motivoNota, setMotivoNotaRaw]        = useState<string>('');
  const [codigoModificacion, setCodigoModificacion] = useState<string>('');
  const [fechaNcfModificado, setFechaNcfModificado] = useState<string>('');

  // e-NCF modificado con formato válido (E + 10-12 dígitos). Permite emitir una
  // NC/ND aunque la factura de origen no tenga e-CF en el sistema (p. ej. emitida
  // fuera de emitedo): el usuario escribe el e-NCF real y se confía en él.
  const ncfModificadoValido = /^E\d{10,12}$/.test(ncfModificado.trim());
  const [razonModificacion, setRazonModificacion]   = useState<string>('');

  const setMotivoNota = (v: string) => {
    setMotivoNotaRaw(v);
    const found = MOTIVOS_NOTA.find((m) => m.value === v);
    setCodigoModificacion(found ? String(found.codigo) : '');
    if (v !== 'otro') setRazonModificacion('');
  };
  const [tipoIngresos, setTipoIngresos]       = useState<string>('1');

  // ── Prefill "crear nota desde factura" (?padreId=N) ────────────────────────
  // Pre-llena NCF modificado, fecha, cliente y líneas del padre; persiste el
  // vínculo origenDocumentoId. El tipo/categoría ya quedaron en el estado inicial.
  const [padreNota, setPadreNota] = useState<{
    id: number; codigo: string | null; encf: string; estado: string; conEcfReal: boolean;
    tipoEcf?: string;
    montoTotal?: string; razonSocial?: string; fechaEmision?: string;
  } | null>(null);

  // Factura de origen sin-ncf (sin comprobante fiscal): no tiene e-NCF ni lo
  // tendrá → la nota es interna (borrador), sin referencia DGII (no se pide e-NCF).
  const esPadreSinNcf = padreNota?.tipoEcf === 'sin-ncf';

  // Aplica una factura padre (payload de /api/facturas/:id) al formulario:
  // e-NCF modificado, fecha, cliente y líneas. Reutilizado por el prefill via
  // ?padreId y por el selector de factura de origen en NC/ND.
  function aplicarPadre(p: {
    id?: number; codigo?: string | null; encf?: string; estado?: string; tipoEcf?: string;
    fechaEmision?: string | null;
    montos?: { montoTotalDOP?: string };
    comprador?: { clienteId?: number; razonSocial?: string | null; rnc?: string | null; email?: string | null; telefono?: string | null };
    lineas?: Array<Record<string, unknown>>;
  }) {
    if (!p?.id) return;
    const conEcfReal = typeof p.encf === 'string' && /^E\d/.test(p.encf);
    setPadreNota({
      id: p.id, codigo: p.codigo ?? null, encf: p.encf ?? '', estado: p.estado ?? '', conEcfReal,
      tipoEcf:      p.tipoEcf,
      montoTotal:   p.montos?.montoTotalDOP,
      razonSocial:  p.comprador?.razonSocial ?? undefined,
      fechaEmision: p.fechaEmision ? String(p.fechaEmision).slice(0, 10) : undefined,
    });
    if (conEcfReal && p.encf) setNcfModificado(p.encf);
    if (p.fechaEmision) setFechaNcfModificado(String(p.fechaEmision).slice(0, 10));
    // Comprador del padre
    if (p.comprador?.clienteId) {
      seleccionarCliente({
        id:          p.comprador.clienteId,
        razonSocial: p.comprador.razonSocial ?? '',
        rnc:         p.comprador.rnc ?? null,
        email:       p.comprador.email ?? null,
        telefono:    p.comprador.telefono ?? null,
      });
    } else {
      const rnc = p.comprador?.rnc ?? '';
      setRncManual(rnc);
      setRncManualNombre(p.comprador?.razonSocial ?? '');
      setEmailManual(p.comprador?.email ?? '');
      // Try to match to a registered client by RNC so the autocomplete prefills
      if (rnc) {
        fetch(`/api/clientes?q=${encodeURIComponent(rnc)}`)
          .then(r => r.json())
          .then((data) => {
            const match = (data.clientes as Cliente[] | undefined)?.find(c => c.rnc === rnc);
            if (match) seleccionarCliente(match);
          })
          .catch(() => {});
      }
    }
    // Copiar líneas del padre — SOLO en NC (devolución/descuento sobre esos ítems).
    // En ND (tipo 33) es un cargo nuevo (mora, interés, flete) → NO se copian; el
    // usuario agrega el cargo manualmente. El cliente sí se carga (arriba).
    if (tipoEcf !== '33' && Array.isArray(p.lineas) && p.lineas.length > 0) {
      const its: ItemLinea[] = p.lineas.map((l: Record<string, unknown>, i: number) => ({
        id:                     i + 1,
        productoId:             typeof l.productoId === 'number' ? l.productoId : undefined,
        nombreItem:             String(l.nombreItem ?? ''),
        referencia:             String(l.referencia ?? ''),
        descripcionItem:        String(l.descripcionItem ?? ''),
        cantidadItem:           Number(l.cantidadItem) || 1,
        precioUnitarioItem:     Number(l.precioUnitarioItem) || 0,
        descuentoPct:           Number(l.descuentoPct) || 0,
        tasaItbis:              (['0.18', '0.16', '0', 'exento'].includes(String(l.tasaItbis))
                                  ? String(l.tasaItbis) : 'exento') as ItemLinea['tasaItbis'],
        indicadorBienoServicio: String(l.indicadorBienoServicio) === '1' ? '1' : '2',
        dependienteId:          typeof l.dependienteId === 'number' ? l.dependienteId : null,
        dependienteNombre:      String(l.dependienteNombre ?? ''),
      }));
      dispatchItems({ type: 'SET', items: its });
    }
  }

  // Carga la factura padre por id (fetch + aplicarPadre).
  function cargarPadre(padreId: number) {
    fetch(`/api/facturas/${padreId}`)
      .then(r => r.json())
      .then(aplicarPadre)
      .catch(() => {});
  }

  // Limpia el vínculo con la factura de origen (mantiene cliente/líneas editables).
  function limpiarPadre() {
    setPadreNota(null);
    setNcfModificado('');
    setFechaNcfModificado('');
  }

  // Busca facturas candidatas como origen de una NC/ND (excluye notas 33/34).
  async function buscarFacturas(q: string): Promise<FacturaResumen[]> {
    const res  = await fetch(`/api/facturas?search=${encodeURIComponent(q)}&limit=20`);
    const data = await res.json();
    return ((data.docs ?? []) as FacturaResumen[]).filter(d => d.tipoEcf !== '33' && d.tipoEcf !== '34');
  }

  useEffect(() => {
    if (initialData) return; // editar borrador manda sobre los query params
    if (!qpPadreId) return;
    cargarPadre(Number(qpPadreId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  /**
   * Si un envío falla, el backend guarda un borrador que CONSERVA el e-NCF ya
   * consumido y devuelve su id. Guardarlo aquí hace que el siguiente intento
   * vaya por /api/facturas/{id}/emitir-ecf, que REUSA ese mismo número en vez
   * de tomar el siguiente y dejar un hueco en la secuencia.
   */
  const [reservaDocId, setReservaDocId] = useState<number | null>(null);
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
  // ── Tracking anti-duplicados ────────────────────────────────────────────────
  // fid = id único por MONTAJE del form (distingue 2 pestañas / re-montajes).
  // submitSeq = nº de submit dentro de este montaje (distingue doble-click/retry).
  // Se manda en cada submit como `_traza` y se loguea server-side junto al docId.
  const formInstanceId = useRef('f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).current;
  const submitSeqRef   = useRef(0);

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
    // Prefill por query params (nota desde factura) manda sobre el draft local.
    if (qpTipo || qpPadreId) { setDraftHydrated(true); return; }
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
      codigoModificacion, fechaNcfModificado, razonModificacion,
      origenDocumentoId: padreNota?.id ?? null,
      tipoIngresos,
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

  // Motivo (código de modificación) obligatorio para notas 33/34 — también al
  // guardar como borrador: la DGII lo exige y evita notas incompletas que luego
  // se traban al emitir.
  function validarMotivoNota(): string | null {
    if (!regla?.requiereNcfModificado) return null;
    if (!motivoNota) return 'Debes seleccionar el motivo de la nota de crédito / débito';
    if (motivoNota === 'otro' && !razonModificacion.trim()) return 'Debes especificar el motivo';
    return null;
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
    const motivoErr = validarMotivoNota();
    if (motivoErr) return motivoErr;
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

  // Regla cuentas por cobrar: una factura de VENTA que quedaría pendiente de cobro
  // (contado sin pago o crédito) debe identificar a quién cobrarle. Sin cliente
  // (nombre/RNC/cédula) y sin el pago completo registrado, sería una cuenta huérfana
  // en Cuentas por Cobrar (nadie de quién cobrar). Se desbloquea agregando el cliente
  // o registrando el pago total. No aplica a NC/ND, compras/gastos, ni gratuito/uso.
  function validarClienteOPago(): string | null {
    const TIPOS_VENTA = ['31', '32', '45', '46', '47', 'sin-ncf'];
    if (!TIPOS_VENTA.includes(tipoEcf)) return null;
    if (condicionPago === '3' || condicionPago === '4') return null; // gratuito / uso: no es por cobrar
    const rncFinal   = (clienteSeleccionado?.rnc ?? rncManual).trim();
    const razonFinal = (clienteSeleccionado?.razonSocial ?? rncManualNombre).trim();
    if (rncFinal || razonFinal) return null;                          // ya hay a quién cobrarle
    const pagado = pagoRecibido ? sumaPagos(pagoLineas) : 0;
    const pagoCompleto = totalNeto > 0 && Math.round(pagado * 100) >= Math.round(totalNeto * 100);
    if (pagoCompleto) return null;                                    // se cobró completo
    return 'Falta a quién cobrarle: agrega el nombre, RNC o cédula del cliente, o registra el pago completo. Una factura sin cliente no puede quedar pendiente de cobro.';
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

  async function emitir(modo: 'emitir' | 'borrador', opts?: { andThen?: 'nueva' | 'imprimir' | 'correo' | 'cobrar' }) {
    // Traza anti-duplicados: identifica el botón y la secuencia de clicks de este
    // montaje. Se loguea aquí (consola) y se manda al server (`_traza`) para ligar
    // cada submit con el documento creado y diagnosticar las facturas duplicadas.
    const traza = {
      fid:   formInstanceId,
      seq:   ++submitSeqRef.current,
      boton: opts?.andThen ? `${modo}+${opts.andThen}` : modo,
      ts:    Date.now(),
    };
    console.log('[factura-submit]', traza, 'submitting=', submittingRef.current, 'loading=', loading);

    // Sin eCF seleccionado → siempre guardar como borrador (no se emite a DGII)
    // sin-ncf (factura sin comprobante) o nota sobre factura de origen sin-ncf
    // (no hay e-NCF que referenciar) → solo borrador, nunca se emite a la DGII.
    const modoEfectivo: 'emitir' | 'borrador' = (tipoEcf === 'sin-ncf' || esPadreSinNcf) ? 'borrador' : modo;

    const err = modoEfectivo === 'borrador'
      ? (items.every(i => !i.nombreItem.trim()) ? 'Agrega al menos un ítem' : validarMotivoNota())
      : validar();
    if (err) { setError(err); return; }

    // Bloqueo cliente-o-pago al crear la factura definitiva: emitir a DGII o
    // guardar una factura sin-ncf (ambas crean una cuenta cobrable). Los borradores
    // en progreso de tipos con e-CF quedan permitidos.
    if (modoEfectivo === 'emitir' || tipoEcf === 'sin-ncf') {
      const clienteErr = validarClienteOPago();
      if (clienteErr) { setError(clienteErr); return; }
    }

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
        // indicadorNotaCredito (tipo 34) es REQUIRED para el validator: 0 = NC dentro
        // de 30 días de la factura original, 1 = después. Mismo cálculo que el mapper
        // server-side (computeIndicadorNotaCredito); el server recomputa el valor real
        // al emitir, esto solo evita el falso "campo requerido" en la validación client.
        const computeIndicadorNC = (f?: string): 0 | 1 => {
          if (!f) return 0;
          let iso = f;
          if (/^\d{2}-\d{2}-\d{4}$/.test(f)) { const [dd, mm, yyyy] = f.split('-'); iso = `${yyyy}-${mm}-${dd}`; }
          const orig = new Date(iso);
          if (Number.isNaN(orig.getTime())) return 0;
          return Math.floor((Date.now() - orig.getTime()) / 86_400_000) > 30 ? 1 : 0;
        };
        const validationPayload: Record<string, unknown> = {
          ...payload,
          montoTotal: totales.total,
          items: itemsAugmented,
          ...(hayItemsGravados ? { indicadorMontoGravado: 0 } : {}),
          ...(fechaNcfMod ? { fechaNCFModificado: fechaNcfMod } : {}),
          ...(tipoEcf === '34' ? { indicadorNotaCredito: computeIndicadorNC(fechaNcfMod) } : {}),
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
      // Si un intento anterior falló, el backend dejó el e-NCF reservado en un
      // borrador. Reintentar por esa ruta REUSA el mismo número; volver a
      // /api/ecf/emitir tomaría el siguiente y abriría un hueco en la secuencia.
      const payload = buildPayload(modoEfectivo);
      const res = reservaDocId
        ? await fetch(`/api/facturas/${reservaDocId}/emitir-ecf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipoEcf: payload.tipoEcf,
              ...(payload.rncComprador         ? { rncComprador:         payload.rncComprador }         : {}),
              ...(payload.razonSocialComprador ? { razonSocialComprador: payload.razonSocialComprador } : {}),
            }),
          })
        : await fetch('/api/ecf/emitir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, _traza: traza }) });
      const data = await res.json();
      if (!res.ok) {
        // El backend reservó el e-NCF en un borrador: guardarlo para que el
        // próximo intento lo reuse en vez de consumir otro número.
        if (typeof data.docId === 'number') setReservaDocId(data.docId);
        setError(data.error ?? 'Error al guardar');
        // El método de pago obliga tipo fiscal (ej. tarjeta con «Sin NCF»): llevar
        // al usuario al selector de tipo y resaltarlo para que lo cambie.
        if (data.requiereTipoFiscal) {
          const el = document.getElementById('tipo-comprobante-anchor');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('ring-2', 'ring-red-500', 'ring-offset-2');
            setTimeout(() => el.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2'), 4000);
          }
        }
        return;
      }
      // Emitió bien: la reserva quedó consumida por este documento.
      setReservaDocId(null);
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
      if (opts?.andThen === 'cobrar' && data.documentoId) {
        // Abre el detalle con el modal de link de pago (elige pasarela allí).
        router.push(`${detalleBase}/${data.documentoId}?cobrar=1`);
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
    if (!secuencia?.id) {
      setNcfError('No hay una secuencia configurada para este tipo de comprobante. Créala primero en Secuencias.');
      return;
    }
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
    const esNotaBorrador = esSinEcf && (tipoEcf === '33' || tipoEcf === '34');
    return (
      <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', p: { xs: 2, sm: 3 } }}>
        <Box sx={{ maxWidth: 672, mx: 'auto' }}>
          <Box
            sx={{
              bgcolor: '#fff',
              borderRadius: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              p: { xs: 2.5, sm: 4 },
              textAlign: 'center',
            }}
          >
            <CheckCircle
              style={{ width: 64, height: 64, color: '#0d9488', margin: '0 auto 16px' }}
            />
            {esNotaBorrador ? (
              <>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                  ¡{tipoEcf === '34' ? 'Nota de crédito' : 'Nota de débito'} guardada!
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  La nota quedó guardada{tipoEcf === '34' ? ' y ya reduce el saldo de la factura original' : ''}.
                </Typography>
              </>
            ) : esSinEcf ? (
              <>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                  ¡Factura guardada!
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  Tu factura fue guardada correctamente.
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                  ¡Comprobante emitido!
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  Tu e-CF fue enviado a la DGII exitosamente.
                </Typography>
              </>
            )}

            <Box
              sx={{
                bgcolor: '#f9fafb',
                borderRadius: '12px',
                p: 3,
                textAlign: 'left',
                border: '1px solid #f3f4f6',
                mb: 3,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }}
            >
              {!esSinEcf && resultado.encf && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">e-NCF</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{resultado.encf}</Typography>
                </Box>
              )}
              {!esSinEcf && resultado.trackId && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Track ID</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{resultado.trackId}</Typography>
                </Box>
              )}
              {!esSinEcf && resultado.codigoSeguridad && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Código de seguridad</Typography>
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f766e' }}>{resultado.codigoSeguridad}</Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Monto total</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  DOP {(resultado.montoTotal ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </Typography>
              </Box>
              {resultado.modo === 'borrador' && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Cobro</Typography>
                  {resultado.pagoRecibido ? (
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'success.dark' }}>
                      ✓ Cobrado
                      {resultado.pagoMetodo ? ` · ${resultado.pagoMetodo.charAt(0).toUpperCase() + resultado.pagoMetodo.slice(1).replace('_', ' ')}` : ''}
                      {resultado.pagoValor != null ? ` · DOP ${resultado.pagoValor.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : ''}
                    </Typography>
                  ) : (
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'warning.dark' }}>
                      ⏳ Pendiente de cobro
                    </Typography>
                  )}
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Estado</Typography>
                <Chip
                  label={resultado.modo === 'borrador'
                    ? (resultado.pagoRecibido ? 'Pagada' : 'Guardada')
                    : resultado.estado}
                  size="small"
                  variant="outlined"
                />
              </Box>
            </Box>

            {esNotaBorrador && (
              <Box
                sx={{
                  bgcolor: '#f0fdfa',
                  border: '1px solid #ccfbf1',
                  borderRadius: '12px',
                  p: 2,
                  textAlign: 'left',
                  mb: 3,
                }}
              >
                <Typography variant="body2" sx={{ color: '#134e4a', mb: 1.5 }}>
                  ¿Deseas enviar esta nota a la DGII ahora? Solo es posible si la
                  factura original ya tiene e-CF emitido. También puedes dejarla
                  guardada y emitirla después desde su detalle.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    disableElevation
                    disabled={padreNota ? (!padreNota.conEcfReal && !ncfModificadoValido) : false}
                    onClick={() => router.push(`${detalleBase}/${resultado.documentoId}?emitir=1`)}
                    startIcon={<Send style={{ width: 16, height: 16 }} />}
                    sx={{
                      bgcolor: '#0d9488',
                      '&:hover': { bgcolor: '#0f766e' },
                      textTransform: 'none',
                      borderRadius: '8px',
                    }}
                  >
                    Enviar a DGII ahora
                  </Button>
                  <Button
                    variant="outlined"
                    disableElevation
                    onClick={() => router.push(`${detalleBase}/${resultado.documentoId}`)}
                    sx={{ textTransform: 'none', borderRadius: '8px' }}
                  >
                    Dejar como borrador
                  </Button>
                </Box>
                {padreNota && !padreNota.conEcfReal && !ncfModificadoValido && (
                  <Typography variant="caption" color="warning.dark" sx={{ display: 'block', mt: 1 }}>
                    Escribe el e-NCF original en la nota para poder enviarla a la DGII, o emite primero la factura padre.
                  </Typography>
                )}
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                disableElevation
                component="a"
                href={`/api/pdf/factura/${resultado.documentoId}`}
                target="_blank"
                rel="noreferrer"
                sx={{ textTransform: 'none', borderRadius: '8px' }}
              >
                Descargar PDF
              </Button>
              <Button
                variant="outlined"
                disableElevation
                component={Link}
                href={`${detalleBase}/${resultado.documentoId}`}
                sx={{ textTransform: 'none', borderRadius: '8px' }}
              >
                Ver detalle
              </Button>
              <Button
                variant="outlined"
                disableElevation
                onClick={() => {
                  try { localStorage.removeItem(draftKey); } catch {}
                  setResultado(null);
                  dispatchItems({ type: 'RESET' });
                  limpiarCliente();
                }}
                sx={{ textTransform: 'none', borderRadius: '8px' }}
              >
                Nueva {docAccent.noun}
              </Button>
              <Button
                variant="contained"
                disableElevation
                onClick={() => router.push(detalleBase)}
                sx={{
                  bgcolor: '#0d9488',
                  '&:hover': { bgcolor: '#0f766e' },
                  textTransform: 'none',
                  borderRadius: '8px',
                }}
              >
                Ver todas
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  // ─── Formulario ───────────────────────────────────────────────────────────
  return (
    <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box component="a" href="#main-content" sx={{ position: 'absolute', left: '-9999px', '&:focus': { left: 8, top: 8, zIndex: 9999 } }}>Saltar al contenido</Box>
      <Box sx={{ p: { xs: 1.5, sm: 2, md: 2.5 }, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <NavBar
          title={initialData ? tituloDoc.editar : tituloDoc.nuevo}
          showAlmacen={showAlmacen}             setShowAlmacen={setShowAlmacen}
          showListaPrecios={showListaPrecios}   setShowListaPrecios={setShowListaPrecios}
          showVendedor={showVendedor}           setShowVendedor={setShowVendedor}
          toggleOpcion={toggleOpcion}
        />

        {error && (
          <Alert
            severity="error"
            icon={<AlertTriangle style={{ width: 20, height: 20 }} />}
            sx={{ borderRadius: '12px', mb: 2 }}
          >
            {error}
          </Alert>
        )}

        {/* Banner: nota creada desde una factura */}
        {padreNota && (tipoEcf === '33' || tipoEcf === '34') && (
          <Alert
            severity={padreNota.conEcfReal ? 'success' : 'warning'}
            icon={<FileText style={{ width: 20, height: 20 }} />}
            sx={{ borderRadius: '12px', mb: 2, alignItems: 'flex-start' }}
          >
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {tipoEcf === '34' ? 'Nota de crédito' : 'Nota de débito'} sobre la factura{' '}
                <Link
                  href={`/dashboard/facturas/${padreNota.id}`}
                  style={{ fontFamily: 'monospace', textDecoration: 'underline' }}
                  target="_blank"
                >
                  {padreNota.conEcfReal ? padreNota.encf : (padreNota.codigo ?? `#${padreNota.id}`)}
                </Link>
              </Typography>
              <Box
                sx={{
                  mt: 1,
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
                  gap: '4px 16px',
                }}
              >
                {padreNota.razonSocial && (
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Cliente</Typography>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{padreNota.razonSocial}</Typography>
                  </Box>
                )}
                {padreNota.montoTotal && (
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Monto original</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>RD$ {padreNota.montoTotal}</Typography>
                  </Box>
                )}
                {padreNota.fechaEmision && (
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>Fecha</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{padreNota.fechaEmision}</Typography>
                  </Box>
                )}
              </Box>
              {!padreNota.conEcfReal && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                  La factura original no tiene e-CF emitido — esta nota solo puede guardarse como{' '}
                  <strong>borrador</strong>. Podrás enviarla a la DGII cuando el padre sea emitido.
                </Typography>
              )}
            </Box>
          </Alert>
        )}

        <Box
          component="form"
          id="main-content"
          onSubmit={handleSubmit}
          onKeyDown={(e: React.KeyboardEvent<HTMLFormElement>) => {
            const t = e.target as HTMLElement;
            const isInput = t.tagName === 'INPUT' || t.tagName === 'SELECT';
            const isSubmitBtn = t.tagName === 'BUTTON' && (t as HTMLButtonElement).type === 'submit';
            if (e.key === 'Enter' && isInput && !isSubmitBtn) {
              e.preventDefault();
            }
          }}
          sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}
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
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 360px' },
              gap: { xs: 2, lg: 2.5 },
            }}
          >
            {/* LEFT column */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <CompactHeader
                empresa={empresa}
                categoriaId={categoriaId} setCategoriaId={setCategoriaId}
                tipoEcf={tipoEcf} onChangeTipo={handleChangeTipo}
                ocultarCategoria={ocultarCategoria}
                mostrarCodigoTipo={!(padreNota && !padreNota.conEcfReal && !ncfModificadoValido)}
                // Nota sobre factura sin e-CF → nunca tendrá e-NCF real: mostrar "Sin
                // comprobante fiscal" en vez de un próximo e-NCF que no se va a usar.
                sinComprobante={esPadreSinNcf}
                secuencia={secuencia}
                fechaEmision={fechaEmision}
                puedeEditarFecha={puedeEditarFecha}
                onChangeFecha={setFechaEmision}
                onEditarNcf={() => {
                  setNcfSiguienteNum('');
                  setNcfFechaVenc(secuencia?.fechaVencimiento ? secuencia.fechaVencimiento.slice(0, 10) : '');
                  setNcfPieFactura(secuencia?.pieDeFactura ?? '');
                  setNcfError(null);
                  setShowEditarNcf(true);
                }}
              />

              {(tipoEcf === '33' || tipoEcf === '34') && (
                <FacturaOrigenSection
                  tipoEcf={tipoEcf}
                  padreSeleccionado={padreNota}
                  conEcfReal={padreNota?.conEcfReal ?? false}
                  esPadreSinNcf={esPadreSinNcf}
                  buscarFacturas={buscarFacturas}
                  onSelect={(f) => cargarPadre(f.id)}
                  onClear={limpiarPadre}
                  ncfModificado={ncfModificado} setNcfModificado={setNcfModificado}
                  motivoNota={motivoNota} setMotivoNota={setMotivoNota}
                  fechaNcfModificado={fechaNcfModificado} setFechaNcfModificado={setFechaNcfModificado}
                  razonModificacion={razonModificacion} setRazonModificacion={setRazonModificacion}
                  today={today}
                />
              )}

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
                  tipoIngresos={tipoIngresos} setTipoIngresos={setTipoIngresos}
                  fechaLimitePago={fechaLimitePago}
                />
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #f3f4f6' }}>
                  <ClasificacionFactura
                    docId={initialData?.id}
                    value={clasificacion}
                    onChange={setClasificacion}
                  />
                </Box>
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
                <PieFactura pieFactura={pieFactura} setPieFactura={setPieFactura} label={docAccent.noun === 'factura' ? 'Pie de factura' : 'Pie del documento'} />
              </AccordionSection>

              <AccordionSection
                number={7} title="Comentario" icon={MessageSquare}
                defaultOpen={comentario.trim().length > 0}
              >
                <Comentarios comentario={comentario} setComentario={setComentario} />
              </AccordionSection>

              {/* Sección 8 Pago movida al sidebar derecho (ResumenSidebar) */}
            </Box>

            {/* RIGHT column — sticky sidebar: Resumen + Pago */}
            <ResumenSidebar
              empresa={empresa}
              totales={totales}
              retenciones={retenciones}
              totalNeto={totalNeto}
              totalLabel={docAccent.totalLabel}
              items={items}
              // Una Nota de Crédito acredita al cliente — no se cobra ningún pago al
              // crearla. Ocultar el card "Pago".
              showPago={tipoEcf !== '34'}
              pagoRecibido={pagoRecibido} setPagoRecibido={setPagoRecibido}
              pagoFecha={pagoFecha} setPagoFecha={setPagoFecha}
              pagoLineas={pagoLineas} setPagoLineas={setPagoLineas}
            />
          </Box>

          {/* Action bar — sticky bottom, full width */}
          <BottomActionBar
            items={items}
            loading={loading}
            loadingPreview={loadingPreview}
            primaryBtnClass={docAccent.primaryBtnClass}
            primaryLabel={tipoEcf === 'sin-ncf' ? 'Guardar factura' : esPadreSinNcf ? 'Guardar borrador' : 'Emitir e-CF'}
            loadingPrimaryLabel={(tipoEcf === 'sin-ncf' || esPadreSinNcf) ? 'Guardando…' : 'Emitiendo…'}
            onVistaPrevia={handleVistaPrevia}
            onEmitir={emitir}
            onCancelar={() => {
              try { localStorage.removeItem(draftKey); } catch {}
              router.push('/dashboard/facturas');
            }}
          />
        </Box>

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

      </Box>
    </Box>
  );
}
