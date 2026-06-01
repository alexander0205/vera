'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useProximamenteDialog } from '@/components/proximamente-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Download, FileText, RefreshCw, XCircle,
  Loader2, AlertTriangle, CheckCircle, Clock,
  Printer, Ticket, ChevronDown, Mail, Copy,
  Package, ChevronUp, Plus, MoreVertical, Send,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SectionCard } from '../nueva/sections/SectionCard';
import { AccordionSection } from '../nueva/sections/AccordionSection';
import { PagoCard, type PagoData } from './_pago-card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EntityNotes } from '@/components/entity-notes';
import { EntityHistory } from '@/components/entity-history';
import { StickyNote, History as HistoryIcon } from 'lucide-react';
import { useDefaultPrinter } from '@/lib/hooks/useDefaultPrinter';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useTiposDisponibles } from '@/lib/hooks/useTiposDisponibles';
import { useSecuencia } from '../nueva/hooks/useSecuencia';
import { TIPO_ECF_REGLAS } from '@/lib/ecf/types';

// Opciones del dropdown "Tipo de comprobante" del modal Enviar a DGII.
const TIPOS_EMIT_DGII: { value: string; label: string }[] = [
  { value: '32', label: 'e32 — Factura de Consumo' },
  { value: '31', label: 'e31 — Crédito Fiscal (empresas con RNC)' },
  { value: '44', label: 'e44 — Régimen Especial' },
  { value: '45', label: 'e45 — Gubernamental' },
  { value: '46', label: 'e46 — Exportaciones' },
  { value: '33', label: 'e33 — Nota de Débito' },
  { value: '34', label: 'e34 — Nota de Crédito' },
  { value: '41', label: 'e41 — Compras' },
  { value: '43', label: 'e43 — Gastos Menores' },
  { value: '47', label: 'e47 — Pagos al Exterior' },
];
import { RncSearch } from '@/components/RncSearch';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Linea {
  id?: number;
  nombreItem?: string;
  descripcionItem?: string;
  cantidadItem?: number;
  precioUnitarioItem?: number;
  descuentoPct?: number;
  tasaItbis?: string;
}

interface NcAsociada {
  id: number;
  encf: string | null;
  tipoEcf: string;
  estado: string;
  fechaEmision: string;
  montoTotal: number;
  montoTotalDOP: string;
}

interface FacturaDetalle {
  id: number;
  encf: string;
  tipoEcf: string;
  tipoNombre: string;
  categoria: string;
  estado: string;
  trackId: string | null;
  codigoSeguridad: string | null;
  urlVerificacion: string | null;
  fechaFirma: string | null;
  mensajesDgii: Record<string, unknown> | null;
  ncfModificado: string | null;
  fechaEmision: string;
  fechaLimitePago: string | null;
  tipoPago: number | null;
  updatedAt: string;
  terminosCondiciones: string | null;
  notas: string | null;
  pieFactura: string | null;
  comentario: string | null;
  lineas: Linea[];
  ncsAsociadas?: NcAsociada[];
  emisor: {
    razonSocial: string;
    nombreComercial?: string;
    rnc?: string;
    direccion?: string;
    telefono?: string;
    email?: string;
  };
  comprador: {
    rnc?: string;
    razonSocial?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
  };
  montos: {
    montoTotalDOP: string;
    totalItbisDOP: string;
    subtotalDOP: string;
  };
  archivos: {
    xmlUrl?: string;
    tieneXmlOriginal: boolean;
    tieneXmlFirmado: boolean;
  };
  pago: PagoData;
  createdByName?: string | null;
  dependienteNombre?: string | null;
}

// ─── Estado badge ─────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }
> = {
  ACEPTADO:             { label: 'Emitida',     variant: 'default',     icon: CheckCircle },
  ACEPTADO_CONDICIONAL: { label: 'Condicional', variant: 'secondary',   icon: CheckCircle },
  EN_PROCESO:           { label: 'En Proceso',  variant: 'outline',     icon: Clock },
  RECHAZADO:            { label: 'Rechazado',   variant: 'destructive', icon: XCircle },
  BORRADOR:             { label: 'Borrador',    variant: 'outline',     icon: Clock },
  ANULADO:              { label: 'Anulado',     variant: 'secondary',   icon: XCircle },
};

// ─── Estado DGII card (sidebar) ───────────────────────────────────────────────

function EstadoDgiiCard({
  factura, onConsultar, consultarStatus,
}: {
  factura: FacturaDetalle;
  onConsultar: () => void;
  consultarStatus: 'idle' | 'loading' | 'done' | 'error';
}) {
  const cfg = ESTADO_CONFIG[factura.estado] ?? { label: factura.estado, variant: 'outline' as const, icon: Clock };
  const Icon = cfg.icon;
  const isAceptado = factura.estado === 'ACEPTADO' || factura.estado === 'ACEPTADO_CONDICIONAL';
  const isRechazado = factura.estado === 'RECHAZADO';
  const badgeColor = isAceptado ? 'bg-emerald-100 text-emerald-700' : isRechazado ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';

  // URL portal DGII — usa la URL canónica devuelta por ecf-api (sin reconstruir client-side)
  const verUrl = factura.urlVerificacion;

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <header className="flex items-center gap-2 px-4 pt-4 pb-3 md:px-5">
        <CheckCircle className="h-4 w-4 text-teal-600 shrink-0" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-gray-900 flex-1">Estado DGII</h2>
        {factura.estado !== 'BORRADOR' && factura.estado !== 'ANULADO' && (
          <button
            type="button"
            onClick={onConsultar}
            disabled={consultarStatus === 'loading'}
            className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${consultarStatus === 'loading' ? 'animate-spin' : ''}`} />
            Consultar
          </button>
        )}
      </header>
      <div className="px-4 pb-4 md:px-5 flex items-start gap-4">
        {/* Badge circular */}
        <div className={`flex flex-col items-center justify-center rounded-lg ${badgeColor} px-3 py-3 shrink-0 min-w-[88px]`}>
          <Icon className="h-7 w-7" />
          <span className="text-xs font-semibold mt-1 text-center leading-tight">{cfg.label}</span>
        </div>
        {/* Detalle fields */}
        <div className="flex-1 space-y-1.5 text-xs min-w-0">
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Estado:</span>
            <span className="text-gray-900 font-medium">{cfg.label}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">e-NCF:</span>
            <span className="text-gray-900 font-mono truncate">{factura.encf}</span>
          </div>
          {factura.codigoSeguridad && (
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">Código de seguridad:</span>
              <span className="text-gray-900 font-mono">{factura.codigoSeguridad}</span>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Fecha emisión:</span>
            <span className="text-gray-900">{fmtDate(factura.fechaEmision)}</span>
          </div>
        </div>
      </div>
      {verUrl && (
        <div className="px-4 pb-4 md:px-5">
          <a
            href={verUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800 border border-teal-200 hover:bg-teal-50 rounded-lg py-2 transition-colors"
          >
            Ver en DGII <ArrowLeft className="h-3.5 w-3.5 rotate-[135deg]" />
          </a>
        </div>
      )}
    </section>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, variant: 'outline' as const, icon: Clock };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="flex items-center gap-1 text-sm px-3 py-1">
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </Badge>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

const fmtDOP = (n: number) =>
  `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-DO', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch {
    return iso;
  }
}

function calcTotalLinea(l: Linea): number {
  const cant  = Number(l.cantidadItem) || 0;
  const prec  = Number(l.precioUnitarioItem) || 0;
  const desc  = Number(l.descuentoPct) || 0;
  const base  = cant * prec;
  const neto  = Math.max(0, base - base * (desc / 100));
  const tasa  = !l.tasaItbis || l.tasaItbis === 'exento' ? 0 : Number(l.tasaItbis) || 0;
  return Math.round((neto + neto * tasa) * 100) / 100;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FacturaDetallePage() {
  const params   = useParams();
  const router   = useRouter();
  const docId    = params.id as string;

  const [factura, setFactura] = useState<FacturaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [pollingStatus, setPollingStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [pollMsg, setPollMsg]             = useState<string | null>(null);

  const [showAnular, setShowAnular]   = useState(false);
  const [anulando, setAnulando]       = useState(false);
  const [anularError, setAnularError] = useState<string | null>(null);
  const [anularNota, setAnularNota]   = useState<string | null>(null);
  const [anularTipo, setAnularTipo]   = useState<'01' | '02' | '03' | '04' | '05'>('04');
  const [anularForce, setAnularForce] = useState(false);
  const [anularMotivo, setAnularMotivo] = useState('');

  const [resumenOpen, setResumenOpen] = useState(true);

  const [showEmail, setShowEmail]     = useState(false);
  const [emailTo, setEmailTo]         = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // ─── Enviar a DGII (para facturas sin eCF) ──────────────────────────────────
  const [showEnviarDgii, setShowEnviarDgii]   = useState(false);
  const [showPagoMissingAlert, setShowPagoMissingAlert] = useState(false);
  const [dgiiTipoEcf, setDgiiTipoEcf]         = useState('32');
  const [enviandoDgii, setEnviandoDgii]       = useState(false);
  const [enviandoDgiiError, setEnviandoDgiiError] = useState<string | null>(null);
  // Errores estructurados devueltos por la API (con `action: 'edit-factura' | 'complete-in-modal'`).
  const [enviandoDgiiAction, setEnviandoDgiiAction] = useState<'edit-factura' | 'complete-in-modal' | null>(null);
  // Overrides locales del comprador (cuando la factura no tiene RNC y se completa al emitir).
  const [tempRnc, setTempRnc]                 = useState('');
  const [tempRazon, setTempRazon]             = useState('');
  // Numeración: próximo e-NCF de la secuencia activa del tipo seleccionado.
  // Editable para ajustar el siguiente número cuando la DGII reporta colisión.
  const [ncfNum, setNcfNum]                   = useState('');
  const { secuencia: seqInfo, invalidar: invalidarSeq } = useSecuencia(dgiiTipoEcf);
  useEffect(() => {
    if (seqInfo?.numero != null) setNcfNum(String(seqInfo.numero));
  }, [seqInfo?.numero]);

  // Prefill comprador overrides al abrir el modal. Si la factura ya trae RNC,
  // default a e31 (Crédito Fiscal); si no, e32 (Consumo).
  useEffect(() => {
    if (showEnviarDgii && factura) {
      setTempRnc(factura.comprador.rnc ?? '');
      setTempRazon(factura.comprador.razonSocial ?? '');
      setEnviandoDgiiError(null);
      setEnviandoDgiiAction(null);
      setDgiiTipoEcf(factura.comprador.rnc ? '31' : '32');
    }
  }, [showEnviarDgii, factura]);

  // ─── Validación pre-flight (espejo de la API) ────────────────────────────────
  const dgiiRegla = TIPO_ECF_REGLAS[dgiiTipoEcf];
  const dgiiValidacion = useMemo(() => {
    if (!factura || !dgiiRegla) return { ok: true as const };

    const rnc   = (tempRnc   || factura.comprador.rnc         || '').trim();
    const razon = (tempRazon || factura.comprador.razonSocial || '').trim();
    const total = parseFloat(factura.montos.montoTotalDOP) || 0;

    const camposFaltantes: { campo: string; mensaje: string; resoluble: boolean }[] = [];

    if (dgiiRegla.requiereRncComprador && !rnc) {
      camposFaltantes.push({ campo: 'rncComprador', mensaje: `e${dgiiTipoEcf} requiere RNC/Cédula del comprador.`, resoluble: true });
    }
    if (rnc && !/^\d{9}$|^\d{11}$/.test(rnc.replace(/[-\s]/g, ''))) {
      camposFaltantes.push({ campo: 'rncComprador', mensaje: 'El RNC/Cédula debe tener 9 u 11 dígitos.', resoluble: true });
    }
    if (dgiiRegla.requiereRazonSocial && !razon) {
      camposFaltantes.push({ campo: 'razonSocialComprador', mensaje: `e${dgiiTipoEcf} requiere razón social del comprador.`, resoluble: true });
    }
    if (dgiiRegla.requiereNcfModificado && !factura.ncfModificado) {
      camposFaltantes.push({ campo: 'ncfModificado', mensaje: `e${dgiiTipoEcf} debe referenciar un e-NCF previo. Edita la factura para añadirlo.`, resoluble: false });
    }
    if (factura.lineas.length === 0) {
      camposFaltantes.push({ campo: 'lineas', mensaje: 'La factura no tiene ítems. Edítala para agregarlos.', resoluble: false });
    }
    if (!dgiiRegla.permiteItbis && factura.lineas.some(l => {
      const t = parseFloat(String(l.tasaItbis ?? '0'));
      return t > 0;
    })) {
      camposFaltantes.push({ campo: 'lineas', mensaje: `e${dgiiTipoEcf} no permite ITBIS pero hay ítems gravados. Edita la factura.`, resoluble: false });
    }
    // e32 ≥ DOP 250,000 → DGII exige RNC + razón social.
    if (dgiiTipoEcf === '32' && total >= 250_000) {
      if (!rnc)   camposFaltantes.push({ campo: 'rncComprador',         mensaje: 'e32 sobre DOP 250,000 requiere RNC/Cédula del comprador.',  resoluble: true });
      if (!razon) camposFaltantes.push({ campo: 'razonSocialComprador', mensaje: 'e32 sobre DOP 250,000 requiere razón social del comprador.', resoluble: true });
    }

    if (camposFaltantes.length === 0) return { ok: true as const };

    return {
      ok: false as const,
      errores: camposFaltantes,
      requiereEditar: camposFaltantes.some(c => !c.resoluble),
      requiereCompletarAqui: camposFaltantes.every(c => c.resoluble),
    };
  }, [factura, dgiiRegla, dgiiTipoEcf, tempRnc, tempRazon]);

  const { openProximamente, dialog: proximamenteDialog } = useProximamenteDialog();

  // ─── Impresora predeterminada ────────────────────────────────────────────────
  const { printUrl, printerLabel } = useDefaultPrinter();

  // ─── Permisos del usuario (gating de UI) ─────────────────────────────────────
  // El rol `user` puede crear/emitir/exportar pero NO editar ni anular facturas.
  const { can } = usePermissions();
  const { tipoVisible } = useTiposDisponibles();
  const canEdit   = can('facturas:editar');
  const canAnular = can('facturas:anular');
  const canEmitir = can('facturas:emitir-dgii');

  // ─── Carga inicial ──────────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facturas/${docId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cargando factura');
      setFactura(data);
      setEmailTo(data.comprador?.email ?? '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Polling de estado DGII ─────────────────────────────────────────────────

  async function consultarEstado() {
    if (!factura?.trackId) return;
    setPollingStatus('loading');
    setPollMsg(null);
    try {
      const res = await fetch(`/api/ecf/estado?docId=${factura.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error consultando DGII');
      setPollingStatus('done');
      if (data.actualizado) {
        setPollMsg(`Estado actualizado: ${data.estadoAnterior} → ${data.estadoActual}`);
        await cargar();
      } else {
        setPollMsg(`Sin cambios. Estado actual: ${data.estadoActual}`);
      }
    } catch (e: unknown) {
      setPollingStatus('error');
      setPollMsg(e instanceof Error ? e.message : 'Error al consultar');
    }
  }

  // ─── Anular ─────────────────────────────────────────────────────────────────

  async function handleAnular() {
    setAnulando(true);
    setAnularError(null);
    try {
      const res = await fetch(`/api/facturas/${docId}/anular`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tipoAnulacion: anularTipo,
          motivo:        anularMotivo.trim() || undefined,
          force:         anularForce,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Mensaje útil para NCA-03 (pagos)
        if (data.pagos && !anularForce) {
          throw new Error(data.mensaje ?? data.error ?? 'Error anulando');
        }
        throw new Error(data.error ?? 'Error anulando');
      }
      setAnularNota(data.nota ?? null);
      setShowAnular(false);
      toast.success('Comprobante anulado');
      await cargar();
    } catch (e: unknown) {
      setAnularError(e instanceof Error ? e.message : 'Error anulando');
    } finally {
      setAnulando(false);
    }
  }

  // ─── Enviar email ───────────────────────────────────────────────────────────

  async function handleSendEmail() {
    if (!emailTo) {
      toast.error('Email requerido');
      return;
    }
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/facturas/${docId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error enviando email');
      toast.success('Factura enviada por correo');
      setShowEmail(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error enviando email');
    } finally {
      setSendingEmail(false);
    }
  }

  // ─── Enviar a DGII ──────────────────────────────────────────────────────────

  async function handleEnviarDgii() {
    setEnviandoDgii(true);
    setEnviandoDgiiError(null);
    try {
      // Si el usuario ajustó el siguiente número, actualizar la secuencia antes de emitir.
      if (seqInfo?.id && ncfNum && seqInfo.numero != null && Number(ncfNum) !== seqInfo.numero) {
        const pres  = await fetch(`/api/secuencias/${seqInfo.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siguiente: parseInt(ncfNum, 10) }),
        });
        const pdata = await pres.json().catch(() => ({}));
        if (!pres.ok) {
          setEnviandoDgiiError(pdata.error ?? 'No se pudo ajustar la numeración');
          setEnviandoDgii(false);
          return;
        }
        invalidarSeq(dgiiTipoEcf);
      }

      const rncBody   = tempRnc.trim();
      const razonBody = tempRazon.trim();
      const res = await fetch(`/api/facturas/${docId}/emitir-ecf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoEcf: dgiiTipoEcf,
          ...(rncBody   ? { rncComprador:         rncBody }   : {}),
          ...(razonBody ? { razonSocialComprador: razonBody } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.mensaje ?? data.error ?? 'Error enviando a DGII';
        setEnviandoDgiiError(msg);
        setEnviandoDgiiAction(data.action ?? null);
        return;
      }
      toast.success(`Comprobante emitido: ${data.encf}`);
      setShowEnviarDgii(false);
      await cargar();
    } catch (e: unknown) {
      setEnviandoDgiiError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setEnviandoDgii(false);
    }
  }

  // ─── Cálculos derivados ─────────────────────────────────────────────────────

  const totales = useMemo(() => {
    if (!factura) return { subtotal: 0, itbis: 0, total: 0 };
    return {
      subtotal: parseFloat(factura.montos.subtotalDOP) || 0,
      itbis:    parseFloat(factura.montos.totalItbisDOP) || 0,
      total:    parseFloat(factura.montos.montoTotalDOP) || 0,
    };
  }, [factura]);

  const pagadoDOP = factura ? parseFloat(factura.pago.valorDOP) || 0 : 0;
  const saldo     = Math.max(0, totales.total - pagadoDOP);
  const facturaPagada = factura?.pago.recibido && saldo === 0 && pagadoDOP > 0;

  // ─── Render guards ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !factura) {
    return (
      <section className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-center">
          <XCircle className="h-12 w-12 mx-auto mb-3 text-red-400" />
          <p className="font-medium">{error ?? 'Documento no encontrado'}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/facturas')}>
            Volver a comprobantes
          </Button>
        </div>
      </section>
    );
  }

  const esBorrador  = factura.estado === 'BORRADOR';
  // e-CF real = fue emitido a DGII (e-NCF "E..." con datos DGII). HISTORICA
  // (encf ALG-), borrador (BOR-) y sin-ncf NUNCA fueron a DGII → sin estado
  // ni consulta DGII.
  const esEcfReal   = /^E\d/.test(factura.encf) && !['HISTORICA', 'BORRADOR'].includes(factura.estado);
  // Sin e-CF real → se puede emitir a DGII (borrador, histórica de Alegra, sin-ncf).
  const yaEnDgii    = ['EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO'].includes(factura.estado);
  const puedeEmitir = factura.estado !== 'ANULADO' && !yaEnDgii;
  const sinLineas   = factura.lineas.length === 0;
  const esAnulable  = !['ANULADO'].includes(factura.estado);
  const esFinal     = ['ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO', 'ANULADO'].includes(factura.estado);
  // Consultar/Estado DGII solo para e-CF real (ya emitido a DGII), no anulado.
  const puedePolling = esEcfReal && factura.estado !== 'ANULADO';

  // Trigger unificado para "Enviar a DGII" (footer + sidebar card). Si la factura
  // es de contado y no tiene pago registrado, abre el alert de confirmación.
  function triggerEnviarDgii() {
    if (!factura) return;
    if (sinLineas) {
      // Sin ítems hay que editar primero. El rol `user` no puede editar →
      // se le indica que pida al admin en lugar de redirigir al guard.
      if (canEdit) {
        toast.info('Agrega ítems a la factura antes de emitirla a la DGII');
        router.push(`/dashboard/facturas/${factura.id}/editar`);
      } else {
        toast.info('Esta factura no tiene ítems. Pídele al administrador que la edite antes de emitirla.');
      }
      return;
    }
    if (factura.tipoPago === 1 && saldo > 0) {
      setShowPagoMissingAlert(true);
      return;
    }
    setEnviandoDgiiError(null);
    setShowEnviarDgii(true);
  }

  return (
    <section className="p-4 sm:p-6 min-h-full flex flex-col">

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/facturas">
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Comprobantes</span>
            </Link>
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 font-mono">
                {factura.encf.startsWith('BOR-') ? `Factura #${factura.id}` : factura.encf}
              </h1>
              <EstadoBadge estado={factura.estado} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-medium text-gray-600">{factura.tipoNombre}</span>
              <span className="mx-1.5">·</span>
              Fecha: {fmtDate(factura.fechaEmision)}
              {factura.fechaLimitePago && (
                <>
                  <span className="mx-1.5">·</span>
                  Vencimiento: {fmtDate(factura.fechaLimitePago)}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {puedePolling && (
            <Button
              variant="outline" size="sm"
              onClick={consultarEstado}
              disabled={pollingStatus === 'loading'}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${pollingStatus === 'loading' ? 'animate-spin' : ''}`} />
              Consultar DGII
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Printer className="h-4 w-4 mr-1" />
                Imprimir
                <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {/* Imprimir con impresora predeterminada */}
              <DropdownMenuItem
                onSelect={() => {
                  window.open(printUrl(factura.id), '_blank', 'noreferrer');
                  toast.info(`Abriendo con: ${printerLabel}`);
                }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Printer className="h-4 w-4 text-teal-600" />
                <div>
                  <p className="text-sm font-medium">Imprimir (predeterminada)</p>
                  <p className="text-xs text-gray-400 truncate max-w-[180px]">{printerLabel}</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`/api/pdf/factura/${factura.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">Factura grande (A4)</p>
                    <p className="text-xs text-gray-400">PDF tamaño carta / A4</p>
                  </div>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`/api/pdf/factura/${factura.id}?formato=tirilla`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Ticket className="h-4 w-4 text-teal-600" />
                  <div>
                    <p className="text-sm font-medium">Factura pequeña (80mm)</p>
                    <p className="text-xs text-gray-400">PDF tirilla térmica</p>
                  </div>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`/api/pdf/factura/${factura.id}/ticket`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Printer className="h-4 w-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium">Ticket HTML (web)</p>
                    <p className="text-xs text-gray-400">Vista web para imprimir</p>
                  </div>
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Más acciones — agrupadas en dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <a
                  href={`/api/pdf/factura/${factura.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Download className="h-4 w-4 text-gray-500" />
                  Descargar PDF
                </a>
              </DropdownMenuItem>
              {factura.archivos.xmlUrl && (
                <DropdownMenuItem asChild>
                  <a
                    href={factura.archivos.xmlUrl}
                    download
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="h-4 w-4 text-gray-500" />
                    Descargar XML
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => setShowEmail(true)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Mail className="h-4 w-4 text-gray-500" />
                Enviar por correo
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => openProximamente('Duplicar factura')}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Copy className="h-4 w-4 text-gray-500" />
                Duplicar
              </DropdownMenuItem>
              {esBorrador && canEdit && (
                <DropdownMenuItem asChild>
                  <Link
                    href={`/dashboard/facturas/${factura.id}/editar`}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="h-4 w-4 text-gray-500" />
                    Editar borrador
                  </Link>
                </DropdownMenuItem>
              )}
              {esAnulable && canAnular && (
                <DropdownMenuItem
                  onSelect={() => { setShowAnular(true); setAnularError(null); }}
                  className="flex items-center gap-2 cursor-pointer text-red-600"
                >
                  <XCircle className="h-4 w-4" />
                  Anular comprobante
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ─── Banners ──────────────────────────────────────────────────────── */}
      {anularNota && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{anularNota}</p>
        </div>
      )}

      {pollMsg && (
        <div className={`rounded-xl p-3 text-sm flex gap-2 mb-4 ${
          pollingStatus === 'error'
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-teal-50 border border-teal-200 text-teal-700'
        }`}>
          {pollingStatus === 'error'
            ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            : <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          {pollMsg}
        </div>
      )}

      {/* ─── Split layout: main + sticky sidebar ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">

        {/* ━━━ LEFT: contenido principal (tabbed) ━━━ */}
        <div className="min-w-0">
          <Tabs defaultValue="detalles" className="space-y-4">
            <TabsList>
              <TabsTrigger value="detalles">Detalles</TabsTrigger>
              <TabsTrigger value="notas">Notas</TabsTrigger>
              <TabsTrigger value="historia">Historia</TabsTrigger>
            </TabsList>

            <TabsContent value="detalles" className="space-y-4">

          {/* Productos y servicios */}
          <SectionCard number={1} title="Productos y servicios" icon={Package}>
            {factura.lineas.length === 0 ? (
              <div className="text-sm text-gray-500 italic py-6 text-center border border-dashed border-gray-200 rounded-lg">
                Sin ítems registrados — esta factura usa el formato anterior sin detalle de líneas.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="text-left font-medium py-2 px-2">Producto/servicio</th>
                      <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Precio</th>
                      <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Desc%</th>
                      <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Impuesto</th>
                      <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Cant.</th>
                      <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Total</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {factura.lineas.map((l, idx) => {
                      const tasa = !l.tasaItbis || l.tasaItbis === 'exento'
                        ? 'Exento'
                        : `${(Number(l.tasaItbis) * 100).toFixed(0)}%`;
                      return (
                        <tr key={l.id ?? idx} className="hover:bg-gray-50/60">
                          <td className="py-2.5 px-2 align-top">
                            <p className="font-medium text-gray-900">{l.nombreItem || '—'}</p>
                            {l.descripcionItem && (
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{l.descripcionItem}</p>
                            )}
                          </td>
                          <td className="text-right tabular-nums text-gray-700 px-2">
                            {fmtDOP(Number(l.precioUnitarioItem) || 0)}
                          </td>
                          <td className="text-right tabular-nums text-gray-600 px-2">
                            {(Number(l.descuentoPct) || 0).toFixed(0)}%
                          </td>
                          <td className="text-right text-gray-600 px-2 whitespace-nowrap">{tasa}</td>
                          <td className="text-right tabular-nums text-gray-700 px-2">
                            {Number(l.cantidadItem) || 0}
                          </td>
                          <td className="text-right tabular-nums font-medium text-gray-900 px-2 whitespace-nowrap">
                            {fmtDOP(calcTotalLinea(l))}
                          </td>
                          <td className="px-1 text-gray-300">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {esBorrador && canEdit && (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed text-teal-700 border-teal-300 hover:bg-teal-50"
                  asChild
                >
                  <Link href={`/dashboard/facturas/${factura.id}/editar`}>
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar producto o servicio
                  </Link>
                </Button>
              </div>
            )}
          </SectionCard>

          <AccordionSection
            number={2}
            title="Términos y condiciones"
            hint={factura.terminosCondiciones ? 'Configurado' : undefined}
            defaultOpen={Boolean(factura.terminosCondiciones)}
          >
            {factura.terminosCondiciones ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {factura.terminosCondiciones}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic">Sin términos y condiciones.</p>
            )}
          </AccordionSection>

          <AccordionSection
            number={3}
            title="Notas"
            hint={factura.notas ? 'Configurado' : undefined}
            defaultOpen={Boolean(factura.notas)}
          >
            {factura.notas ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{factura.notas}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">Sin notas adicionales.</p>
            )}
          </AccordionSection>

          <AccordionSection
            number={4}
            title="Pie de factura"
            hint={factura.pieFactura ? 'Configurado' : undefined}
            defaultOpen={Boolean(factura.pieFactura)}
          >
            {factura.pieFactura ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{factura.pieFactura}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">Sin pie de factura.</p>
            )}
          </AccordionSection>

          <AccordionSection
            number={5}
            title="Comentario"
            hint={factura.comentario ? 'Configurado' : undefined}
            defaultOpen={Boolean(factura.comentario)}
          >
            {factura.comentario ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{factura.comentario}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">Sin comentarios.</p>
            )}
          </AccordionSection>

          {/* Metadatos del documento */}
          {factura.createdByName && (
            <SectionCard number={6} title="Información del documento">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Creado por</p>
                  <p className="font-medium text-gray-900">{factura.createdByName}</p>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Cliente compacto */}
          <SectionCard number={factura.createdByName ? 7 : 6} title="Datos del comprador">
            {factura.comprador.razonSocial ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Razón social</p>
                  <p className="font-medium text-gray-900">{factura.comprador.razonSocial}</p>
                </div>
                {factura.comprador.rnc && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">RNC</p>
                    <p className="text-gray-800 font-mono">{factura.comprador.rnc}</p>
                  </div>
                )}
                {factura.comprador.email && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Email</p>
                    <p className="text-gray-800 break-all">{factura.comprador.email}</p>
                  </div>
                )}
                {factura.comprador.telefono && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Teléfono</p>
                    <p className="text-gray-800">{factura.comprador.telefono}</p>
                  </div>
                )}
                {factura.comprador.direccion && (
                  <div className="sm:col-span-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Dirección</p>
                    <p className="text-gray-800">{factura.comprador.direccion}</p>
                  </div>
                )}
                {factura.dependienteNombre && (
                  <div className="sm:col-span-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Beneficiario</p>
                    <p className="text-gray-800 font-medium">{factura.dependienteNombre}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">Consumidor final</p>
            )}
          </SectionCard>

            </TabsContent>

            <TabsContent value="notas">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <StickyNote className="h-4 w-4 text-teal-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Notas</h3>
                </div>
                <EntityNotes entityType="factura" entityId={factura.id} />
              </div>
            </TabsContent>

            <TabsContent value="historia">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <HistoryIcon className="h-4 w-4 text-teal-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Historia de la factura</h3>
                </div>
                <EntityHistory docId={factura.id} encf={factura.encf} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* ━━━ RIGHT: sticky sidebar ━━━ */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start min-w-0">

          {/* Resumen */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setResumenOpen(v => !v)}
              className="w-full flex items-center gap-2 px-4 pt-4 pb-3 md:px-5 hover:bg-gray-50 transition-colors"
              aria-expanded={resumenOpen}
            >
              <FileText className="h-4 w-4 text-teal-600 shrink-0" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-gray-900 flex-1 text-left">Resumen</h2>
              {resumenOpen
                ? <ChevronUp className="h-4 w-4 text-gray-400" />
                : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>

            {resumenOpen && (
              <div className="px-4 pb-4 md:px-5">
                {factura.lineas.length > 0 && (
                  <>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 text-[11px] text-gray-500 uppercase tracking-wide pb-2 border-b border-gray-100">
                      <span>Descripción</span>
                      <span className="text-right">Cant.</span>
                      <span className="text-right">Total</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {factura.lineas.map((l, idx) => (
                        <div key={l.id ?? idx} className="grid grid-cols-[1fr_auto_auto] gap-3 py-2 text-sm">
                          <span className="text-gray-700 truncate" title={l.nombreItem}>
                            {l.nombreItem || '—'}
                          </span>
                          <span className="text-gray-600 text-right tabular-nums">
                            {Number(l.cantidadItem) || 0}
                          </span>
                          <span className="text-gray-900 font-medium text-right tabular-nums whitespace-nowrap">
                            {fmtDOP(calcTotalLinea(l))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="pt-3 mt-1 space-y-1.5 border-t border-gray-100">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal</span>
                    <span className="font-medium text-gray-800 tabular-nums">{fmtDOP(totales.subtotal)}</span>
                  </div>
                  {totales.itbis > 0 && (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>ITBIS (18%)</span>
                      <span className="font-medium text-gray-800 tabular-nums">{fmtDOP(totales.itbis)}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between text-base font-bold text-gray-900 border-t-2 border-gray-200 pt-3 mt-3">
                  <span>Total</span>
                  <span className="tabular-nums">{fmtDOP(totales.total)}</span>
                </div>

                <div className={`flex justify-between text-sm mt-3 ${pagadoDOP > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  <span>Pagado</span>
                  <span className="font-medium tabular-nums">{fmtDOP(pagadoDOP)}</span>
                </div>

                <div className={`flex justify-between text-sm rounded-lg px-3 py-2 mt-2 border ${
                  saldo === 0
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                    : 'bg-red-50 border-red-100 text-red-800'
                }`}>
                  <span className="font-semibold">Saldo pendiente</span>
                  <span className="font-bold tabular-nums">{fmtDOP(saldo)}</span>
                </div>

                {facturaPagada && (
                  <p className="text-[11px] text-emerald-700 mt-2 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Factura pagada en su totalidad
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Pago — state A/B */}
          <PagoCard
            docId={factura.id}
            initial={factura.pago}
            readOnly={factura.estado === 'ANULADO'}
            totalDOP={factura.montos.montoTotalDOP}
            onSaved={(next) => {
              setFactura((prev) => prev ? { ...prev, pago: next } : prev);
            }}
          />

          {/* Estado DGII card — solo cuando hay e-CF real emitido a DGII.
              HISTORICA (ALG-), borrador (BOR-) y sin-ncf no fueron a DGII. */}
          {esEcfReal && (
            <EstadoDgiiCard factura={factura} onConsultar={consultarEstado} consultarStatus={pollingStatus} />
          )}

          {/* No emitida a DGII (histórica/borrador/sin-ncf) → CTA para generar e-CF. */}
          {!esEcfReal && puedeEmitir && (
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 md:px-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-gray-900">Estado DGII</h2>
              </div>
              <p className="text-xs text-gray-500 mb-3 leading-snug">
                No emitida a la DGII. Es un registro {esBorrador ? 'borrador' : 'histórico'} sin e-CF.
                Genera un e-CF para enviarla a la DGII.
              </p>
              <div className="flex flex-col gap-2">
                {canEmitir && (
                  <Button
                    type="button"
                    className="bg-teal-600 hover:bg-teal-700 text-white h-9 w-full"
                    onClick={triggerEnviarDgii}
                  >
                    <Send className="h-4 w-4 mr-1.5" />
                    {sinLineas && canEdit ? 'Completar y generar e-CF' : 'Generar e-CF / Enviar a DGII'}
                  </Button>
                )}
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full text-teal-700 border-teal-300 hover:bg-teal-50"
                    asChild
                  >
                    <Link href={`/dashboard/facturas/${factura.id}/editar`}>Editar antes de emitir</Link>
                  </Button>
                )}
                {!canEdit && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <span>Para editar esta factura, pídele al administrador.</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* NCA-20: NCs/débitos asociados — solo si hay alguno */}
          {factura.ncsAsociadas && factura.ncsAsociadas.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 md:px-5">
              <h3 className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
                NCs / Débitos asociados ({factura.ncsAsociadas.length})
              </h3>
              <ul className="space-y-2 text-xs">
                {factura.ncsAsociadas.map(nc => (
                  <li key={nc.id} className="flex items-center justify-between gap-3 border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <Link href={`/dashboard/facturas/${nc.id}`} className="font-mono text-teal-700 hover:underline truncate block">
                        {nc.encf ?? `Borrador #${nc.id}`}
                      </Link>
                      <div className="text-[10px] text-gray-500 mt-0.5 flex gap-2">
                        <span>e-{nc.tipoEcf}</span>
                        <span>·</span>
                        <span>{nc.estado}</span>
                        <span>·</span>
                        <span>{fmtDate(nc.fechaEmision)}</span>
                      </div>
                    </div>
                    <span className="font-mono text-gray-800 shrink-0">RD$ {nc.montoTotalDOP}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Info del comprobante — solo cuando hay e-CF real emitido a DGII */}
          {esEcfReal && (
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 md:px-5">
              <h3 className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
                Información del comprobante
              </h3>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">e-NCF</dt>
                  <dd className="font-mono font-semibold text-gray-900 text-right break-all">{factura.encf}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Tipo</dt>
                  <dd className="text-gray-800 text-right">e-{factura.tipoEcf}</dd>
                </div>
                {factura.codigoSeguridad && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">Código seg.</dt>
                    <dd className="font-mono font-bold text-teal-700 text-right">{factura.codigoSeguridad}</dd>
                  </div>
                )}
                {factura.trackId && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">Track ID</dt>
                    <dd className="font-mono text-gray-700 text-[10px] text-right break-all">{factura.trackId}</dd>
                  </div>
                )}
                {factura.ncfModificado && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-gray-500">NCF modificado</dt>
                    <dd className="font-mono text-gray-800 text-right">{factura.ncfModificado}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}
        </aside>
      </div>

      {/* ─── Bottom action bar ────────────────────────────────────────────── */}
      {/* Vista detalle = read-only. Solo borrador habilita acciones de edición.
          Para facturas emitidas: Volver + Ver PDF + Acciones (imprimir/email). */}
      <div className="sticky bottom-0 z-30 -mx-4 sm:-mx-6 mt-auto bg-white/95 backdrop-blur border-t border-gray-200 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.08)] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3">
        <Button
          type="button"
          variant="outline"
          className="text-gray-600 h-11 sm:h-9 w-full sm:w-auto"
          onClick={() => router.push('/dashboard/facturas')}
        >
          {esBorrador ? 'Cancelar' : 'Volver'}
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="text-gray-600 h-11 sm:h-9 w-full sm:w-auto"
            asChild
          >
            <a
              href={`/api/pdf/factura/${factura.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <FileText className="h-4 w-4 mr-1.5" />
              Ver PDF
            </a>
          </Button>

          {puedeEmitir ? (
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto sm:items-center">
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  className="text-teal-700 border-teal-300 hover:bg-teal-50 h-11 sm:h-9 w-full sm:w-auto"
                  asChild
                >
                  <Link href={`/dashboard/facturas/${factura.id}/editar`}>
                    {esBorrador ? 'Editar borrador' : 'Editar'}
                  </Link>
                </Button>
              ) : (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 w-full sm:w-auto sm:max-w-[260px]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                  <span>Para editar esta factura, pídele al administrador.</span>
                </div>
              )}
              {canEmitir && (
                <Button
                  type="button"
                  className="bg-teal-600 hover:bg-teal-700 text-white h-11 sm:h-9 w-full sm:w-auto"
                  onClick={triggerEnviarDgii}
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  {sinLineas && canEdit ? 'Completar y emitir' : 'Enviar a DGII'}
                </Button>
              )}
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  className="bg-teal-600 hover:bg-teal-700 text-white h-11 sm:h-9 w-full sm:w-auto"
                  disabled={esFinal && factura.estado === 'ANULADO'}
                >
                  Acciones
                  <ChevronDown className="h-3.5 w-3.5 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <a
                    href={`/api/pdf/factura/${factura.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Printer className="h-4 w-4 text-gray-500" />
                    Imprimir
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setShowEmail(true)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Mail className="h-4 w-4 text-gray-500" />
                  Enviar por correo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ─── Modals ───────────────────────────────────────────────────────── */}

      {/* Confirmar anulación */}
      <Dialog open={showAnular} onOpenChange={setShowAnular}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Anular comprobante?</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {anularError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                {anularError}
              </div>
            )}
            <p className="text-sm text-gray-700">
              Vas a anular el comprobante{' '}
              <strong className="font-mono">{factura.encf}</strong>.
            </p>

            {/* NCA-05/06: tipo de anulación (motivo DGII) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">Tipo de anulación</label>
              <select
                value={anularTipo}
                onChange={e => setAnularTipo(e.target.value as typeof anularTipo)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                <option value="01">01 — Deterioro de Factura Pre-impresa</option>
                <option value="02">02 — Errores de Impresión</option>
                <option value="03">03 — Impresión Defectuosa</option>
                <option value="04">04 — Cesación de Operaciones</option>
                <option value="05">05 — Pérdida o Hurto de Talonarios</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">Motivo interno (opcional)</label>
              <textarea
                value={anularMotivo}
                onChange={e => setAnularMotivo(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Notas internas sobre la anulación"
              />
            </div>

            {/* NCA-03: si hay pagos, requiere force */}
            <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={anularForce}
                onChange={e => setAnularForce(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Forzar anulación aunque haya pagos registrados (revertirá los pagos asociados).
              </span>
            </label>

            {(factura.estado === 'ACEPTADO' || factura.estado === 'ACEPTADO_CONDICIONAL') && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Este comprobante ya fue aceptado por la DGII. La anulación formal
                  requiere emitir una <strong>Nota de Crédito (e-34)</strong> referenciando este e-NCF.
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnular(false)} disabled={anulando}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleAnular} disabled={anulando}>
              {anulando
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Anulando…</>
                : 'Sí, anular'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enviar por correo */}
      <Dialog open={showEmail} onOpenChange={setShowEmail}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enviar factura por correo</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <label className="block">
              <span className="text-xs text-gray-600 uppercase tracking-wide">Destinatario</span>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="cliente@dominio.com"
                className="mt-1 w-full h-9 px-3 text-sm rounded-md border border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmail(false)} disabled={sendingEmail}>
              Cancelar
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={sendingEmail || !emailTo}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {sendingEmail
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enviando…</>
                : <><Mail className="h-4 w-4 mr-1" />Enviar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enviar a DGII */}
      <Dialog open={showEnviarDgii} onOpenChange={setShowEnviarDgii}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar a la DGII</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            {enviandoDgiiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{enviandoDgiiError}</span>
                </div>
                {enviandoDgiiAction === 'edit-factura' && (
                  <div className="flex justify-end">
                    {canEdit ? (
                      <Link
                        href={`/dashboard/facturas/${factura.id}/editar`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-700 underline hover:text-red-900"
                      >
                        Editar factura para completarla →
                      </Link>
                    ) : (
                      <span className="text-xs font-medium text-red-700">
                        Pídele al administrador que edite la factura.
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            <p className="text-sm text-gray-700">
              Selecciona el tipo de comprobante fiscal para emitir esta factura a la DGII.
              Se asignará un e-NCF de tu secuencia activa.
            </p>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">Tipo de comprobante (e-CF)</label>
              <select
                value={dgiiTipoEcf}
                onChange={e => setDgiiTipoEcf(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                {TIPOS_EMIT_DGII.filter(t => tipoVisible(t.value)).map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {dgiiRegla && (
                <p className="text-[11px] text-gray-500 leading-snug">{dgiiRegla.descripcion}</p>
              )}
            </div>

            {/* ─── Comprador (RNC + razón social) ─────────────────────────── */}
            {/* Mostrar solo si el tipo lo requiere (e31 sí) o e32 ≥ DOP 250,000.
                e32 normal (consumo) → oculto, aunque haya cliente preseleccionado. */}
            {dgiiRegla && (
              dgiiRegla.requiereRncComprador ||
              dgiiRegla.requiereRazonSocial ||
              (dgiiTipoEcf === '32' && (parseFloat(factura.montos.montoTotalDOP) || 0) >= 250000)
            ) && (
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">
                    {dgiiRegla.compradorLabel}
                    {(dgiiRegla.requiereRncComprador || dgiiRegla.requiereRazonSocial) && (
                      <span className="text-red-500 ml-0.5">*</span>
                    )}
                  </label>
                  {factura.comprador.rnc && (
                    <span className="text-[10px] text-gray-400">guardado en factura</span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] text-gray-600">{dgiiRegla.rncLabel}</label>
                  <RncSearch
                    value={tempRnc ? `${tempRnc}${tempRazon ? ` · ${tempRazon}` : ''}` : ''}
                    onSelect={(r) => { setTempRnc(r.rnc); setTempRazon(r.nombre); }}
                    onClear={() => { setTempRnc(''); setTempRazon(''); }}
                    placeholder="Buscar RNC, Cédula o razón social…"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] text-gray-600">Razón social / nombre</label>
                  <input
                    type="text"
                    value={tempRazon}
                    onChange={e => setTempRazon(e.target.value)}
                    placeholder="Nombre o razón social"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            )}

            {/* ─── Validaciones pre-flight ──────────────────────────────── */}
            {!dgiiValidacion.ok && (
              <div className={`rounded-lg border p-3 text-xs space-y-2 ${
                dgiiValidacion.requiereEditar
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <div className="flex gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium">
                      {dgiiValidacion.requiereEditar
                        ? 'No se puede emitir desde aquí'
                        : 'Faltan datos requeridos por la DGII'}
                    </p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {dgiiValidacion.errores.map((e, i) => (
                        <li key={i}>{e.mensaje}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {dgiiValidacion.requiereEditar && (
                  <div className="flex justify-end">
                    {canEdit ? (
                      <Link
                        href={`/dashboard/facturas/${factura.id}/editar`}
                        className="inline-flex items-center gap-1 text-xs font-medium underline hover:opacity-80"
                      >
                        Editar factura para completarla →
                      </Link>
                    ) : (
                      <span className="text-xs font-medium">
                        Pídele al administrador que edite la factura.
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Numeración — próximo e-NCF, editable para resolver colisiones de secuencia */}
            {dgiiTipoEcf !== 'sin-ncf' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">Próximo e-NCF</label>
                {seqInfo == null ? (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Cargando numeración…
                  </p>
                ) : seqInfo.sinSecuencia ? (
                  <p className="text-xs text-red-600">
                    No hay secuencia activa para e{dgiiTipoEcf}.{' '}
                    <Link href="/dashboard/secuencias" className="underline font-medium">Crea una</Link>.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-gray-900">
                        E{dgiiTipoEcf}{(ncfNum || '0').padStart(10, '0')}
                      </span>
                      {seqInfo.disponibles >= 0 && (
                        <span className="text-[11px] text-gray-400">{seqInfo.disponibles} disponibles</span>
                      )}
                    </div>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={ncfNum}
                      onChange={e => setNcfNum(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      aria-label="Siguiente número de e-NCF"
                    />
                    <p className="text-[11px] text-gray-400">
                      Si la DGII reporta el e-NCF como ya emitido, sube el siguiente número. No puede ser menor al actual.
                    </p>
                  </>
                )}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Esta acción consume un número de la secuencia activa para el tipo seleccionado
                y envía el comprobante a la DGII. No se puede deshacer.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnviarDgii(false)} disabled={enviandoDgii}>
              Cancelar
            </Button>
            <Button
              onClick={handleEnviarDgii}
              disabled={enviandoDgii || !dgiiValidacion.ok}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {enviandoDgii
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enviando…</>
                : <><Send className="h-4 w-4 mr-1" />Emitir a DGII</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {proximamenteDialog}

      {/* Alert: factura contado sin pago registrado → confirmar antes de emitir */}
      {showPagoMissingAlert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Esta factura aún no tiene pago registrado
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Es de contado pero no marcaste el cobro. ¿Cómo continúas?
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => {
                  setShowPagoMissingAlert(false);
                  document.querySelector('[data-pago-card]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                Registrar pago primero
              </Button>
              <Button
                variant="outline"
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
                onClick={() => {
                  setShowPagoMissingAlert(false);
                  setEnviandoDgiiError(null);
                  setShowEnviarDgii(true);
                }}
              >
                Emitir sin registrar pago
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowPagoMissingAlert(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
