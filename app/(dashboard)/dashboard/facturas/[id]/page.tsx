'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MuiLink from '@mui/material/Link';
import { useProximamenteDialog } from '@/components/proximamente-dialog';
import { fmtFechaHora, fmtFechaCorta } from '@/lib/utils/format';
import {
  ArrowLeft, Download, FileText, RefreshCw, XCircle,
  Loader2, AlertTriangle, CheckCircle, Clock,
  Printer, Ticket, ChevronDown, Mail, Copy,
  Package, ChevronUp, Plus, MoreVertical, Send,
  TrendingDown, TrendingUp,
} from 'lucide-react';
import { SectionCard } from '../nueva/sections/SectionCard';
import { AccordionSection } from '../nueva/sections/AccordionSection';
import { PagoCard, type PagoData } from './_pago-card';
import { CobrarLinkButton } from '@/components/pagos/CobrarLinkButton';
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
  dependienteNombre?: string | null;
}

interface NcAsociada {
  id: number;
  encf: string | null;
  codigo: string | null;
  tipoEcf: string;
  estado: string;
  estadoPago?: string;
  fechaEmision: string;
  montoTotal: number;
  montoTotalDOP: string;
  codigoModificacion?: number | null;
  razonModificacion?: string | null;
}

// Etiquetas DGII del código de modificación (tipos 33/34)
const COD_MODIFICACION_LABEL: Record<number, string> = {
  1: 'Anula NCF',
  2: 'Corrige texto',
  3: 'Corrige monto',
  4: 'Reemplazo en contingencia',
  5: 'Ref. Factura de Consumo',
};

interface FacturaDetalle {
  id: number;
  encf: string;
  codigo: string | null;
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
  origenDocumentoId: number | null;
  codigoModificacion: number | null;
  razonModificacion: string | null;
  creditoGeneradoCents: number | null;
  moraOrigenId: number | null;
  fechaEmision: string;
  createdAt?: string;
  fechaLimitePago: string | null;
  tipoPago: number | null;
  updatedAt: string;
  terminosCondiciones: string | null;
  notas: string | null;
  pieFactura: string | null;
  comentario: string | null;
  lineas: Linea[];
  ncsAsociadas?: NcAsociada[];
  notasMora?: { id: number; codigo: string | null; montoTotal: number; estado: string; estadoPago: string }[];
  moraOrigen?: { id: number; codigo: string | null; encf: string } | null;
  notaOrigen?: { id: number; codigo: string | null; encf: string; estado: string } | null;
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
    ncAplicadoDOP?: string;
  };
  archivos: {
    xmlUrl?: string;
    tieneXmlOriginal: boolean;
    tieneXmlFirmado: boolean;
  };
  pago: PagoData;
  createdByName?: string | null;
  updatedByName?: string | null;
  dependienteNombre?: string | null;
}

// ─── Estado badge ─────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  ACEPTADO:             { label: 'Emitida',          color: '#047857', bg: '#d1fae5', icon: CheckCircle },
  ACEPTADO_CONDICIONAL: { label: 'Condicional',      color: '#475569', bg: '#f1f5f9', icon: CheckCircle },
  EN_PROCESO:           { label: 'En Proceso',       color: '#374151', bg: '#f3f4f6', icon: Clock },
  RECHAZADO:            { label: 'Rechazado',        color: '#b91c1c', bg: '#fee2e2', icon: XCircle },
  BORRADOR:             { label: 'Sin comprobante',  color: '#374151', bg: '#f3f4f6', icon: Clock },
  ANULADO:              { label: 'Anulado',          color: '#475569', bg: '#f1f5f9', icon: XCircle },
};

// ─── Estado DGII card (sidebar) ───────────────────────────────────────────────

/** Normaliza mensajesDgii (array u objeto) a una lista de strings legibles. */
function mensajesDgiiList(m: Record<string, unknown> | unknown[] | null): string[] {
  if (!m) return [];
  const arr = Array.isArray(m) ? m : Object.values(m);
  return arr
    .map((x) => {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        return String(o.valor ?? o.mensaje ?? o.descripcion ?? JSON.stringify(o));
      }
      return x == null ? '' : String(x);
    })
    .filter(Boolean);
}

function EstadoDgiiCard({
  factura, onConsultar, consultarStatus,
}: {
  factura: FacturaDetalle;
  onConsultar: () => void;
  consultarStatus: 'idle' | 'loading' | 'done' | 'error';
}) {
  const cfg = ESTADO_CONFIG[factura.estado] ?? { label: factura.estado, color: '#374151', bg: '#f3f4f6', icon: Clock };
  const Icon = cfg.icon;
  const isAceptado = factura.estado === 'ACEPTADO' || factura.estado === 'ACEPTADO_CONDICIONAL';
  const isRechazado = factura.estado === 'RECHAZADO';
  const badgeBg = isAceptado ? '#d1fae5' : isRechazado ? '#fee2e2' : '#fef3c7';
  const badgeColor = isAceptado ? '#047857' : isRechazado ? '#b91c1c' : '#b45309';

  // URL portal DGII — usa la URL canónica devuelta por ecf-api (sin reconstruir client-side)
  const verUrl = factura.urlVerificacion;
  // Mensajes/errores devueltos por la DGII (motivo de rechazo, advertencias).
  const dgiiMensajes = mensajesDgiiList(factura.mensajesDgii);

  const rowSx = { display: 'flex', justifyContent: 'space-between', gap: 1 } as const;
  const labelSx = { color: '#6b7280', fontSize: '0.75rem' } as const;

  return (
    <Box component="section" sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 2, md: 2.5 }, pt: 2, pb: 1.5 }}>
        <CheckCircle size={16} color="#3658e1" style={{ flexShrink: 0 }} aria-hidden="true" />
        <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', flex: 1 }}>Estado DGII</Typography>
        {factura.estado !== 'BORRADOR' && factura.estado !== 'ANULADO' && (
          <Button
            type="button"
            onClick={onConsultar}
            disabled={consultarStatus === 'loading'}
            startIcon={<RefreshCw size={12} style={consultarStatus === 'loading' ? { animation: 'spin 1s linear infinite' } : undefined} />}
            sx={{ fontSize: '0.75rem', textTransform: 'none', color: '#3658e1', minWidth: 0, p: 0.5, '&:hover': { color: '#253a9e', bgcolor: 'transparent' } }}
          >
            Consultar
          </Button>
        )}
      </Box>
      <Box sx={{ px: { xs: 2, md: 2.5 }, pb: 2, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        {/* Badge circular */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', bgcolor: badgeBg, color: badgeColor, px: 1.5, py: 1.5, flexShrink: 0, minWidth: 88 }}>
          <Icon size={28} />
          <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, mt: 0.5, textAlign: 'center', lineHeight: 1.2 }}>{cfg.label}</Typography>
        </Box>
        {/* Detalle fields */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Box sx={rowSx}>
            <Typography component="span" sx={labelSx}>Estado:</Typography>
            <Typography component="span" sx={{ color: '#111827', fontSize: '0.75rem', fontWeight: 500 }}>{cfg.label}</Typography>
          </Box>
          <Box sx={rowSx}>
            <Typography component="span" sx={labelSx}>e-NCF:</Typography>
            <Typography component="span" sx={{ color: '#111827', fontSize: '0.75rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{factura.encf}</Typography>
          </Box>
          {factura.codigoSeguridad && (
            <Box sx={rowSx}>
              <Typography component="span" sx={labelSx}>Código de seguridad:</Typography>
              <Typography component="span" sx={{ color: '#111827', fontSize: '0.75rem', fontFamily: 'monospace' }}>{factura.codigoSeguridad}</Typography>
            </Box>
          )}
          <Box sx={rowSx}>
            <Typography component="span" sx={labelSx}>Fecha emisión:</Typography>
            <Typography component="span" sx={{ color: '#111827', fontSize: '0.75rem' }}>
              {factura.createdAt ? fmtFechaHora(factura.createdAt) : fmtFechaCorta(factura.fechaEmision)}
            </Typography>
          </Box>
          {factura.fechaFirma && (
            <Box sx={rowSx}>
              <Typography component="span" sx={labelSx}>Fecha firma:</Typography>
              <Typography component="span" sx={{ color: '#111827', fontSize: '0.75rem' }}>{factura.fechaFirma}</Typography>
            </Box>
          )}
          {factura.trackId && (
            <Box sx={rowSx}>
              <Typography component="span" sx={labelSx}>Track ID:</Typography>
              <Typography component="span" title={factura.trackId} sx={{ color: '#111827', fontSize: '0.75rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{factura.trackId}</Typography>
            </Box>
          )}
        </Box>
      </Box>
      {dgiiMensajes.length > 0 && (
        <Box sx={{ px: { xs: 2, md: 2.5 }, pb: 2 }}>
          <Box sx={{
            borderRadius: '8px', border: '1px solid', p: 1.5, fontSize: '0.75rem',
            ...(isRechazado
              ? { bgcolor: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }
              : { bgcolor: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }),
          }}>
            <Typography component="p" sx={{ fontWeight: 500, mb: 0.5, fontSize: '0.75rem' }}>{isRechazado ? 'Motivo del rechazo (DGII)' : 'Mensajes de la DGII'}</Typography>
            <Box component="ul" sx={{ listStyle: 'disc', listStylePosition: 'inside', m: 0, p: 0, wordBreak: 'break-word', '& li': { mb: 0.25 } }}>
              {dgiiMensajes.map((m, i) => <li key={i}>{m}</li>)}
            </Box>
          </Box>
        </Box>
      )}
      {verUrl && (
        <Box sx={{ px: { xs: 2, md: 2.5 }, pb: 2 }}>
          <Button
            component="a"
            href={verUrl}
            target="_blank"
            rel="noreferrer"
            nativeButton={false}
            variant="outlined"
            endIcon={<ArrowLeft size={14} style={{ transform: 'rotate(135deg)' }} />}
            sx={{
              width: '100%', fontSize: '0.875rem', fontWeight: 500, textTransform: 'none',
              color: '#2a45c4', borderColor: '#c7d2fc', borderRadius: '8px', py: 1,
              '&:hover': { color: '#253a9e', bgcolor: '#eef2fe', borderColor: '#c7d2fc' },
            }}
          >
            Ver en DGII
          </Button>
        </Box>
      )}
    </Box>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, color: '#374151', bg: '#f3f4f6', icon: Clock };
  const Icon = cfg.icon;
  return (
    <Chip
      icon={<Icon size={14} />}
      label={cfg.label}
      size="small"
      sx={{
        bgcolor: cfg.bg, color: cfg.color, fontWeight: 500, fontSize: '0.875rem',
        height: 28, px: 0.5, '& .MuiChip-icon': { color: cfg.color, ml: 0.75 },
      }}
    />
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

// ─── Variante por tipo de documento (factura / NC / ND) ───────────────────────
// El detalle se reusa para los 3; `variant` controla navegación y nomenclatura
// sin duplicar la lógica (carga, emisión, anulación, pagos son idénticas).
type DocVariant = 'factura' | 'nota-credito' | 'nota-debito';

const DOC_UI: Record<DocVariant, { backHref: string; backLabel: string; noun: string }> = {
  'factura':      { backHref: '/dashboard/facturas',      backLabel: 'Comprobantes',     noun: 'Factura' },
  'nota-credito': { backHref: '/dashboard/notas-credito', backLabel: 'Notas de crédito', noun: 'Nota de crédito' },
  'nota-debito':  { backHref: '/dashboard/notas-debito',  backLabel: 'Notas de débito',  noun: 'Nota de débito' },
};

// ─── Componente principal ─────────────────────────────────────────────────────

export function DocumentoDetalle({ variant = 'factura' }: { variant?: DocVariant }) {
  const params   = useParams();
  const router   = useRouter();
  const docId    = params.id as string;
  const ui       = DOC_UI[variant];

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

  // Tab activo del panel principal (Detalles / Notas / Historia).
  const [activeTab, setActiveTab] = useState('detalles');

  // Anchors de los menús (dropdowns) del header y la barra inferior.
  const [printAnchor, setPrintAnchor] = useState<null | HTMLElement>(null);
  const [moreAnchor, setMoreAnchor]   = useState<null | HTMLElement>(null);
  const [accionesAnchor, setAccionesAnchor] = useState<null | HTMLElement>(null);

  // ─── Enviar a DGII (para facturas sin eCF) ──────────────────────────────────
  const [showEnviarDgii, setShowEnviarDgii]   = useState(false);
  const [showPagoMissingAlert, setShowPagoMissingAlert] = useState(false);
  const [dgiiTipoEcf, setDgiiTipoEcf]         = useState('32');
  // Código de modificación (1-5) para notas 33/34. Si el borrador no lo trae
  // persistido, se elige aquí al emitir — la DGII lo exige.
  const [dgiiCodMod, setDgiiCodMod]           = useState('');
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

  // Prefill comprador overrides al abrir el modal. Notas conservan su tipo
  // (33/34); si la factura ya trae RNC, default a e31; si no, e32 (Consumo).
  useEffect(() => {
    if (showEnviarDgii && factura) {
      setTempRnc(factura.comprador.rnc ?? '');
      setTempRazon(factura.comprador.razonSocial ?? '');
      setEnviandoDgiiError(null);
      setEnviandoDgiiAction(null);
      setDgiiCodMod(factura.codigoModificacion != null ? String(factura.codigoModificacion) : '');
      setDgiiTipoEcf(
        factura.tipoEcf === '33' || factura.tipoEcf === '34'
          ? factura.tipoEcf
          : (factura.comprador.rnc ? '31' : '32'),
      );
    }
  }, [showEnviarDgii, factura]);

  // ?emitir=1 → abrir el modal Enviar a DGII al cargar (flujo post-crear nota:
  // "¿emitir ahora o dejar borrador?"). Solo una vez y solo si aún es emitible.
  // window.location en vez de useSearchParams para no requerir Suspense boundary.
  // ?cobrar=1 → abrir el flujo de link de pago al cargar (viene de "Guardar y
  // generar link de pago" en Nueva factura).
  const [autoCobrar, setAutoCobrar] = useState(false);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('cobrar') === '1') setAutoCobrar(true);
  }, []);

  const [autoEmitirDone, setAutoEmitirDone] = useState(false);
  useEffect(() => {
    if (autoEmitirDone || !factura) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('emitir') !== '1') return;
    setAutoEmitirDone(true);
    const emitible = factura.estado !== 'ANULADO'
      && !['EN_PROCESO', 'ACEPTADO', 'ACEPTADO_CONDICIONAL', 'RECHAZADO'].includes(factura.estado);
    if (emitible && factura.lineas.length > 0) {
      setEnviandoDgiiError(null);
      setShowEnviarDgii(true);
    }
  }, [factura, autoEmitirDone]);

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
    // Una nota (33/34) DEBE referenciar un e-CF de origen REAL ya emitido a la DGII.
    //  - Padre en el sistema (notaOrigen) → debe tener e-NCF real (E…) y haber ido a la
    //    DGII (no borrador/sin-ncf/anulado/rechazado).
    //  - Sin padre en el sistema (factura externa) → confiar en el e-NCF tecleado.
    // Si el origen no fue a la DGII no hay e-NCF que modificar → la DGII la rechazaría;
    // se bloquea aquí.
    if (dgiiRegla.requiereNcfModificado) {
      const ESTADOS_EMITIDO = ['ACEPTADO', 'ACEPTADO_CONDICIONAL', 'EN_PROCESO'];
      const refValida = factura.notaOrigen
        ? /^E\d{10,12}$/.test((factura.notaOrigen.encf ?? '').trim()) && ESTADOS_EMITIDO.includes(factura.notaOrigen.estado)
        : /^E\d{10,12}$/.test((factura.ncfModificado ?? '').trim());
      if (!refValida) {
        camposFaltantes.push({
          campo: 'ncfModificado',
          mensaje: factura.notaOrigen
            ? 'El comprobante de origen no fue emitido a la DGII. Emite primero la factura original — mientras tanto esta nota no puede enviarse a la DGII.'
            : `e${dgiiTipoEcf} debe referenciar un e-NCF previo emitido. Edita la nota para añadirlo.`,
          resoluble: false,
        });
      }
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

    // Notas 33/34: la DGII exige el código de modificación. Si el borrador no lo
    // trae persistido y no se eligió en el modal → pedirlo aquí (resoluble in-place,
    // sin forzar editar la nota).
    if ((dgiiTipoEcf === '33' || dgiiTipoEcf === '34') && !dgiiCodMod && factura.codigoModificacion == null) {
      camposFaltantes.push({ campo: 'codigoModificacion', mensaje: 'Selecciona el motivo / código de modificación de la nota.', resoluble: true });
    }

    if (camposFaltantes.length === 0) return { ok: true as const };

    return {
      ok: false as const,
      errores: camposFaltantes,
      requiereEditar: camposFaltantes.some(c => !c.resoluble),
      requiereCompletarAqui: camposFaltantes.every(c => c.resoluble),
    };
  }, [factura, dgiiRegla, dgiiTipoEcf, tempRnc, tempRazon, dgiiCodMod]);

  const { openProximamente, dialog: proximamenteDialog } = useProximamenteDialog();

  // ─── Impresora predeterminada ────────────────────────────────────────────────
  const { printUrl, printerLabel } = useDefaultPrinter();

  // ─── Permisos del usuario (gating de UI) ─────────────────────────────────────
  // El rol `user` puede crear/emitir/exportar pero NO editar ni anular facturas.
  const { can } = usePermissions();
  const { tipoVisible } = useTiposDisponibles();
  const canCreate = can('facturas:crear');
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

  // ─── Reintentar envío tras rechazo DGII (admin) ─────────────────────────────
  const [reseteando, setReseteando] = useState(false);
  async function handleResetEmision(mantenerEncf: boolean) {
    setReseteando(true);
    try {
      const res = await fetch(`/api/facturas/${docId}/reset-emision`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mantenerEncf }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error cancelando el envío');
      toast.success(mantenerEncf
        ? 'Envío cancelado — reintenta con el mismo e-NCF'
        : 'Envío cancelado — corrige y reenvía (tomará un e-NCF nuevo)');
      await cargar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error cancelando el envío');
    } finally {
      setReseteando(false);
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
          ...(dgiiCodMod ? { codigoModificacion: Number(dgiiCodMod) } : {}),
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

  // ─── Generar Nota de Débito por mora (borrador interno, no DGII) ────────────
  const [generandoMora, setGenerandoMora] = useState(false);

  async function handleGenerarNotaDebitoMora() {
    if (!factura) return;
    setGenerandoMora(true);
    try {
      const res = await fetch(`/api/facturas/${docId}/nota-debito-mora`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error generando nota de débito por mora');
      toast.success('Nota de débito por mora generada');
      if (data.notaDebitoId) {
        router.push(`/dashboard/facturas/${data.notaDebitoId}`);
      } else {
        await cargar();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error generando nota de débito por mora');
    } finally {
      setGenerandoMora(false);
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
  const ncAplicadoDOP = factura ? parseFloat(factura.montos.ncAplicadoDOP ?? '0') || 0 : 0;
  // Saldo = total − pagos − notas de crédito aplicadas (nunca negativo)
  const saldo     = Math.max(0, totales.total - pagadoDOP - ncAplicadoDOP);
  const facturaPagada = saldo === 0 && (pagadoDOP > 0 || ncAplicadoDOP > 0) && totales.total > 0;

  // ─── Render guards ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader2 size={32} color="#3658e1" style={{ animation: 'spin 1s linear infinite' }} />
      </Box>
    );
  }

  if (error || !factura) {
    return (
      <Box component="section" sx={{ p: 3 }}>
        <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', p: 3, textAlign: 'center' }}>
          <XCircle size={48} color="#f87171" style={{ display: 'block', margin: '0 auto 12px' }} />
          <Typography component="p" sx={{ fontWeight: 500 }}>{error ?? 'Documento no encontrado'}</Typography>
          <Button variant="outlined" sx={{ mt: 2, textTransform: 'none', borderRadius: '8px' }} onClick={() => router.push(ui.backHref)}>
            Volver a {ui.backLabel.toLowerCase()}
          </Button>
        </Box>
      </Box>
    );
  }

  const esBorrador  = factura.estado === 'BORRADOR';
  // ND de mora: una factura es elegible para generar mora si tiene saldo
  // pendiente y NO es ella misma una ND de mora ni está anulada.
  const esNotaMora      = factura.moraOrigenId != null;
  const puedeGenerarMora = !esNotaMora && factura.estado !== 'ANULADO' && saldo > 0 && can('facturas:crear');
  // Crear NC/ND desde esta factura: solo sobre documentos que no sean notas.
  const esNota          = factura.tipoEcf === '33' || factura.tipoEcf === '34';
  // Nota de crédito (34): ACREDITA (reduce la deuda del cliente). No se "paga" ni
  // tiene "saldo pendiente" → se ocultan pago/saldo en el resumen. La ND (33) sí es
  // un cargo adicional que puede cobrarse, así que conserva su pago/saldo.
  const esNc            = factura.tipoEcf === '34';
  const puedeCrearNota  = !esNota && !esNotaMora && factura.estado !== 'ANULADO' && can('facturas:crear');
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
    // El aviso "registrar cobro de contado" es lógica de cobro de factura. Una
    // nota (NC/ND) no se cobra al emitir → saltarlo y abrir el modal directo.
    if (!esNota && factura.tipoPago === 1 && saldo > 0) {
      setShowPagoMissingAlert(true);
      return;
    }
    setEnviandoDgiiError(null);
    setShowEnviarDgii(true);
  }

  // sx compartido de las tarjetas-sección del sidebar.
  const cardSx = { bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' } as const;
  // sx compartido para los <option> nativos → MenuItem dentro de TextField select.
  const selectFieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '8px' } } as const;
  // Etiqueta de campo pequeña reutilizada en los modales.
  const fieldLabelSx = { display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#4b5563', mb: 0.75 } as const;

  return (
    <Box component="section" sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 2, sm: 3 }, pb: 2 }}>

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, alignItems: { lg: 'flex-start' }, justifyContent: { lg: 'space-between' }, gap: 1.5, mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            component={Link}
            href={ui.backHref}
            nativeButton={false}
            variant="text"
            size="small"
            startIcon={<ArrowLeft size={16} />}
            sx={{ textTransform: 'none', color: '#374151', minWidth: 0 }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{ui.backLabel}</Box>
          </Button>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography component="h1" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>
                {factura.encf && !factura.encf.startsWith('BOR-')
                  ? factura.encf
                  : (factura.codigo ?? `${ui.noun} #${factura.id}`)}
              </Typography>
              <EstadoBadge estado={factura.estado} />
              {/* Estado de COBRO (independiente del estado DGII) */}
              {facturaPagada ? (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: '2px', borderRadius: '9999px', fontSize: '11px', fontWeight: 500, bgcolor: '#ecfdf5', color: '#047857', boxShadow: 'inset 0 0 0 1px #a7f3d0' }}>
                  Pagada
                </Box>
              ) : saldo > 0 && pagadoDOP > 0 ? (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: '2px', borderRadius: '9999px', fontSize: '11px', fontWeight: 500, bgcolor: '#fffbeb', color: '#b45309', boxShadow: 'inset 0 0 0 1px #fde68a' }}>
                  Pago parcial
                </Box>
              ) : null}
            </Box>
            <Typography component="p" sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.25 }}>
              {/* Solo mostrar el nombre fiscal del comprobante si fue emitido a DGII.
                  Borrador/sin-ncf/histórica → genérico, NO el tipo fiscal. */}
              <Box component="span" sx={{ fontWeight: 500, color: '#4b5563' }}>
                {esEcfReal ? factura.tipoNombre : (esBorrador ? 'Sin comprobante fiscal' : 'Documento sin comprobante fiscal')}
              </Box>
              <Box component="span" sx={{ mx: 0.75 }}>·</Box>
              Fecha: {fmtDate(factura.fechaEmision)}
              {factura.fechaLimitePago && (
                <>
                  <Box component="span" sx={{ mx: 0.75 }}>·</Box>
                  Vencimiento: {fmtDate(factura.fechaLimitePago)}
                </>
              )}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {puedePolling && (
            <Button
              variant="outlined" size="small"
              onClick={consultarEstado}
              disabled={pollingStatus === 'loading'}
              startIcon={<RefreshCw size={16} style={pollingStatus === 'loading' ? { animation: 'spin 1s linear infinite' } : undefined} />}
              sx={{ borderRadius: '8px', textTransform: 'none' }}
            >
              Consultar DGII
            </Button>
          )}

          <Button
            variant="outlined" size="small"
            onClick={(e) => setPrintAnchor(e.currentTarget)}
            startIcon={<Printer size={16} />}
            endIcon={<ChevronDown size={14} style={{ opacity: 0.6 }} />}
            sx={{ borderRadius: '8px', textTransform: 'none' }}
          >
            Imprimir
          </Button>
          <Menu
            anchorEl={printAnchor}
            open={Boolean(printAnchor)}
            onClose={() => setPrintAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { width: 256 } } as object }}
          >
            {/* Imprimir con impresora predeterminada */}
            <MenuItem
              onClick={() => {
                setPrintAnchor(null);
                window.open(printUrl(factura.id), '_blank', 'noreferrer');
                toast.info(`Abriendo con: ${printerLabel}`);
              }}
              sx={{ gap: 1, alignItems: 'flex-start', py: 1 }}
            >
              <Printer size={16} color="#3658e1" style={{ marginTop: 2 }} />
              <Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Imprimir (predeterminada)</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{printerLabel}</Typography>
              </Box>
            </MenuItem>
            <MenuItem
              component="a"
              href={`/api/pdf/factura/${factura.codigo ?? factura.id}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setPrintAnchor(null)}
              sx={{ gap: 1, alignItems: 'flex-start', py: 1 }}
            >
              <FileText size={16} color="#6b7280" style={{ marginTop: 2 }} />
              <Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Factura grande (A4)</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>PDF tamaño carta / A4</Typography>
              </Box>
            </MenuItem>
            <MenuItem
              component="a"
              href={`/api/pdf/factura/${factura.codigo ?? factura.id}?formato=tirilla`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setPrintAnchor(null)}
              sx={{ gap: 1, alignItems: 'flex-start', py: 1 }}
            >
              <Ticket size={16} color="#3658e1" style={{ marginTop: 2 }} />
              <Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Factura pequeña (80mm)</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>PDF tirilla térmica</Typography>
              </Box>
            </MenuItem>
            <MenuItem
              component="a"
              href={`/api/pdf/factura/${factura.codigo ?? factura.id}/ticket`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setPrintAnchor(null)}
              sx={{ gap: 1, alignItems: 'flex-start', py: 1 }}
            >
              <Printer size={16} color="#6b7280" style={{ marginTop: 2 }} />
              <Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Ticket HTML (web)</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>Vista web para imprimir</Typography>
              </Box>
            </MenuItem>
          </Menu>

          {/* Más acciones — agrupadas en dropdown */}
          <Button
            variant="outlined" size="small"
            onClick={(e) => setMoreAnchor(e.currentTarget)}
            sx={{ borderRadius: '8px', textTransform: 'none', minWidth: 0, px: 1 }}
          >
            <MoreVertical size={16} />
          </Button>
          <Menu
            anchorEl={moreAnchor}
            open={Boolean(moreAnchor)}
            onClose={() => setMoreAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { width: 224 } } as object }}
          >
            <MenuItem
              component="a"
              href={`/api/pdf/factura/${factura.codigo ?? factura.id}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setMoreAnchor(null)}
              sx={{ gap: 1 }}
            >
              <Download size={16} color="#6b7280" />
              Descargar PDF
            </MenuItem>
            {factura.archivos.xmlUrl && (
              <MenuItem
                component="a"
                href={factura.archivos.xmlUrl}
                download
                onClick={() => setMoreAnchor(null)}
                sx={{ gap: 1 }}
              >
                <FileText size={16} color="#6b7280" />
                Descargar XML
              </MenuItem>
            )}
            {canCreate && (
              <MenuItem
                onClick={() => { setMoreAnchor(null); setShowEmail(true); }}
                sx={{ gap: 1 }}
              >
                <Mail size={16} color="#6b7280" />
                Enviar por correo
              </MenuItem>
            )}
            {canCreate && (
              <MenuItem
                onClick={() => { setMoreAnchor(null); openProximamente('Duplicar factura'); }}
                sx={{ gap: 1 }}
              >
                <Copy size={16} color="#6b7280" />
                Duplicar
              </MenuItem>
            )}
            {canCreate && puedeCrearNota && [
              <MenuItem
                key="crear-nc"
                component={Link}
                href={`/dashboard/notas-credito/nueva?padreId=${factura.id}`}
                onClick={() => setMoreAnchor(null)}
                sx={{ gap: 1, color: '#2a45c4' }}
              >
                <Plus size={16} />
                Crear nota de crédito
              </MenuItem>,
              <MenuItem
                key="crear-nd"
                component={Link}
                href={`/dashboard/notas-debito/nueva?padreId=${factura.id}`}
                onClick={() => setMoreAnchor(null)}
                sx={{ gap: 1, color: '#2a45c4' }}
              >
                <Plus size={16} />
                Crear nota de débito
              </MenuItem>,
            ]}
            {puedeGenerarMora && (
              <MenuItem
                onClick={() => { if (!generandoMora) { setMoreAnchor(null); handleGenerarNotaDebitoMora(); } }}
                disabled={generandoMora}
                sx={{ gap: 1, color: '#c2410c' }}
              >
                {generandoMora
                  ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Plus size={16} />}
                Generar nota de débito por mora
              </MenuItem>
            )}
            {esBorrador && canEdit && (
              <MenuItem
                component={Link}
                href={`/dashboard/facturas/${factura.id}/editar`}
                onClick={() => setMoreAnchor(null)}
                sx={{ gap: 1 }}
              >
                <FileText size={16} color="#6b7280" />
                Editar borrador
              </MenuItem>
            )}
            {esAnulable && canAnular && (
              <MenuItem
                onClick={() => { setMoreAnchor(null); setShowAnular(true); setAnularError(null); }}
                sx={{ gap: 1, color: '#dc2626' }}
              >
                <XCircle size={16} />
                Anular comprobante
              </MenuItem>
            )}
          </Menu>
        </Box>
      </Box>

      {/* ─── Banners ──────────────────────────────────────────────────────── */}
      {anularNota && (
        <Box sx={{ bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', p: 2, display: 'flex', gap: 1.5, mb: 2 }}>
          <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
          <Typography sx={{ fontSize: '0.875rem', color: '#92400e' }}>{anularNota}</Typography>
        </Box>
      )}

      {pollMsg && (
        <Box sx={{
          borderRadius: '12px', p: 1.5, fontSize: '0.875rem', display: 'flex', gap: 1, mb: 2,
          ...(pollingStatus === 'error'
            ? { bgcolor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }
            : { bgcolor: '#eef2fe', border: '1px solid #c7d2fc', color: '#2a45c4' }),
        }}>
          {pollingStatus === 'error'
            ? <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            : <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />}
          {pollMsg}
        </Box>
      )}

      {/* ─── Split layout: main + sticky sidebar ─────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 360px' }, gap: 2.5 }}>

        {/* ━━━ LEFT: contenido principal (tabbed) ━━━ */}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ borderBottom: '1px solid #e5e7eb' }}>
              <Tabs
                value={activeTab}
                onChange={(_, v) => setActiveTab(v)}
                sx={{
                  minHeight: 0,
                  '& .MuiTab-root': { textTransform: 'none', minHeight: 0, py: 1, fontSize: '0.875rem', fontWeight: 500 },
                  '& .Mui-selected': { color: '#3658e1 !important' },
                  '& .MuiTabs-indicator': { bgcolor: '#3658e1' },
                }}
              >
                <Tab value="detalles" label="Detalles" />
                <Tab value="notas" label="Notas" />
                <Tab value="historia" label="Historia" />
              </Tabs>
            </Box>

            {activeTab === 'detalles' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Banner: si es NC/ND, link a la factura que modifica */}
          {factura.notaOrigen && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, borderRadius: '12px', border: '1px solid #c7d2fc', bgcolor: '#eef2fe', px: 2, py: 1.5 }}>
              <Typography sx={{ fontSize: '0.875rem', color: '#24377d' }}>
                {factura.tipoEcf === '34' ? 'Nota de crédito' : 'Nota de débito'} sobre la factura{' '}
                <Box component="span" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{factura.notaOrigen.codigo ?? factura.notaOrigen.encf}</Box>
                {factura.codigoModificacion != null && (
                  <Box component="span" sx={{ ml: 1, display: 'inline-flex', alignItems: 'center', px: 0.75, py: '2px', borderRadius: '9999px', fontSize: '10px', fontWeight: 500, bgcolor: '#fff', border: '1px solid #c7d2fc', color: '#253a9e' }}>
                    {factura.codigoModificacion} — {COD_MODIFICACION_LABEL[factura.codigoModificacion] ?? 'Modificación'}
                  </Box>
                )}
              </Typography>
              <MuiLink
                component={Link}
                href={`/dashboard/facturas/${factura.notaOrigen.id}`}
                sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#2a45c4', whiteSpace: 'nowrap', textDecoration: 'none', '&:hover': { color: '#253a9e' } }}
              >
                Ver factura →
              </MuiLink>
            </Box>
          )}

          {/* Banner: NC del modelo nuevo → generó saldo a favor (no descontó la factura) */}
          {factura.tipoEcf === '34' && factura.creditoGeneradoCents != null && (
            <Box sx={{ borderRadius: '12px', border: '1px solid #ddd6fe', bgcolor: '#f5f3ff', px: 2, py: 1.5 }}>
              {factura.creditoGeneradoCents > 0 ? (
                <Typography sx={{ fontSize: '0.875rem', color: '#4c1d95' }}>
                  Esta nota generó <Box component="span" sx={{ fontWeight: 600 }}>{fmtDOP(factura.creditoGeneradoCents / 100)}</Box> de
                  saldo a favor del cliente — <Box component="span" sx={{ fontWeight: 500 }}>no descontó la factura original</Box>.
                  El cliente puede usarlo para pagar otras facturas.
                </Typography>
              ) : (
                <Typography sx={{ fontSize: '0.875rem', color: '#4c1d95' }}>
                  Esta nota no generó saldo a favor: la factura original no tenía pagos registrados
                  (solo se acredita lo que el cliente ya pagó).
                </Typography>
              )}
            </Box>
          )}

          {/* Banner: nota borrador cuyo padre YA está emitido → recordar emisión */}
          {esNota && esBorrador && factura.notaOrigen &&
            ['ACEPTADO', 'ACEPTADO_CONDICIONAL'].includes(factura.notaOrigen.estado) && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, borderRadius: '12px', border: '1px solid #fde68a', bgcolor: '#fffbeb', px: 2, py: 1.5 }}>
              <Typography sx={{ fontSize: '0.875rem', color: '#78350f' }}>
                La factura original ya fue emitida a la DGII. Esta nota sigue como
                borrador — puedes enviarla cuando quieras (no es obligatorio).
              </Typography>
              {canEmitir && (
                <Box
                  component="button"
                  type="button"
                  onClick={triggerEnviarDgii}
                  sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#92400e', textDecoration: 'underline', whiteSpace: 'nowrap', background: 'none', border: 'none', cursor: 'pointer', p: 0, '&:hover': { color: '#78350f' } }}
                >
                  Enviar a DGII →
                </Box>
              )}
            </Box>
          )}

          {/* Banner: si es ND de mora, link a la factura padre */}
          {factura.moraOrigen && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, borderRadius: '12px', border: '1px solid #fed7aa', bgcolor: '#fff7ed', px: 2, py: 1.5 }}>
              <Typography sx={{ fontSize: '0.875rem', color: '#7c2d12' }}>
                Nota de débito por mora de la factura{' '}
                <Box component="span" sx={{ fontWeight: 600 }}>{factura.moraOrigen.codigo ?? factura.moraOrigen.encf}</Box>
              </Typography>
              <MuiLink
                component={Link}
                href={`/dashboard/facturas/${factura.moraOrigen.id}`}
                sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#c2410c', whiteSpace: 'nowrap', textDecoration: 'none', '&:hover': { color: '#9a3412' } }}
              >
                Ver factura →
              </MuiLink>
            </Box>
          )}

          {/* Productos y servicios */}
          <SectionCard number={1} title="Productos y servicios" icon={Package}>
            {factura.lineas.length === 0 ? (
              <Box sx={{ fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic', py: 3, textAlign: 'center', border: '1px dashed #e5e7eb', borderRadius: '8px' }}>
                Sin ítems registrados — esta factura usa el formato anterior sin detalle de líneas.
              </Box>
            ) : (
              <Box sx={{ overflowX: 'auto', mx: -0.5 }}>
                <Box component="table" sx={{ minWidth: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                  <Box component="thead">
                    <Box component="tr" sx={{ '& th': { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#6b7280', borderBottom: '1px solid #e5e7eb', fontWeight: 500, py: 1 } }}>
                      <Box component="th" sx={{ textAlign: 'left', px: 1 }}>Producto/servicio</Box>
                      <Box component="th" sx={{ textAlign: 'right', px: 1, whiteSpace: 'nowrap' }}>Precio</Box>
                      <Box component="th" sx={{ textAlign: 'right', px: 1, whiteSpace: 'nowrap' }}>Desc%</Box>
                      <Box component="th" sx={{ textAlign: 'right', px: 1, whiteSpace: 'nowrap' }}>Impuesto</Box>
                      <Box component="th" sx={{ textAlign: 'right', px: 1, whiteSpace: 'nowrap' }}>Cant.</Box>
                      <Box component="th" sx={{ textAlign: 'right', px: 1, whiteSpace: 'nowrap' }}>Total</Box>
                      <Box component="th" sx={{ width: 32 }}></Box>
                    </Box>
                  </Box>
                  <Box component="tbody" sx={{ '& tr': { borderTop: '1px solid #f3f4f6' } }}>
                    {factura.lineas.map((l, idx) => {
                      const tasa = !l.tasaItbis || l.tasaItbis === 'exento'
                        ? 'Exento'
                        : `${(Number(l.tasaItbis) * 100).toFixed(0)}%`;
                      return (
                        <Box component="tr" key={l.id ?? idx} sx={{ '&:hover': { bgcolor: 'rgba(249,250,251,0.6)' } }}>
                          <Box component="td" sx={{ py: 1.25, px: 1, verticalAlign: 'top' }}>
                            <Typography sx={{ fontWeight: 500, color: '#111827', fontSize: '0.875rem' }}>
                              {l.dependienteNombre ? `${l.dependienteNombre} - ${l.nombreItem || '—'}` : (l.nombreItem || '—')}
                            </Typography>
                            {l.descripcionItem && (
                              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.descripcionItem}</Typography>
                            )}
                          </Box>
                          <Box component="td" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#374151', px: 1 }}>
                            {fmtDOP(Number(l.precioUnitarioItem) || 0)}
                          </Box>
                          <Box component="td" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#4b5563', px: 1 }}>
                            {(Number(l.descuentoPct) || 0).toFixed(0)}%
                          </Box>
                          <Box component="td" sx={{ textAlign: 'right', color: '#4b5563', px: 1, whiteSpace: 'nowrap' }}>{tasa}</Box>
                          <Box component="td" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#374151', px: 1 }}>
                            {Number(l.cantidadItem) || 0}
                          </Box>
                          <Box component="td" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: '#111827', px: 1, whiteSpace: 'nowrap' }}>
                            {fmtDOP(calcTotalLinea(l))}
                          </Box>
                          <Box component="td" sx={{ px: 0.5, color: '#d1d5db' }}>
                            <MoreVertical size={14} />
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              </Box>
            )}

            {esBorrador && canEdit && (
              <Box sx={{ mt: 1.5 }}>
                <Button
                  component={Link}
                  href={`/dashboard/facturas/${factura.id}/editar`}
                  nativeButton={false}
                  type="button"
                  variant="outlined"
                  size="small"
                  startIcon={<Plus size={16} />}
                  sx={{ width: '100%', borderStyle: 'dashed', textTransform: 'none', color: '#2a45c4', borderColor: '#a5b4f9', borderRadius: '8px', '&:hover': { bgcolor: '#eef2fe', borderColor: '#a5b4f9', borderStyle: 'dashed' } }}
                >
                  Agregar producto o servicio
                </Button>
              </Box>
            )}
          </SectionCard>

          <AccordionSection
            number={2}
            title="Términos y condiciones"
            hint={factura.terminosCondiciones ? 'Configurado' : undefined}
            defaultOpen={Boolean(factura.terminosCondiciones)}
          >
            {factura.terminosCondiciones ? (
              <Typography sx={{ fontSize: '0.875rem', color: '#374151', whiteSpace: 'pre-wrap' }}>
                {factura.terminosCondiciones}
              </Typography>
            ) : (
              <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>Sin términos y condiciones.</Typography>
            )}
          </AccordionSection>

          <AccordionSection
            number={3}
            title="Notas"
            hint={factura.notas ? 'Configurado' : undefined}
            defaultOpen={Boolean(factura.notas)}
          >
            {factura.notas ? (
              <Typography sx={{ fontSize: '0.875rem', color: '#374151', whiteSpace: 'pre-wrap' }}>{factura.notas}</Typography>
            ) : (
              <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>Sin notas adicionales.</Typography>
            )}
          </AccordionSection>

          <AccordionSection
            number={4}
            title="Pie de factura"
            hint={factura.pieFactura ? 'Configurado' : undefined}
            defaultOpen={Boolean(factura.pieFactura)}
          >
            {factura.pieFactura ? (
              <Typography sx={{ fontSize: '0.875rem', color: '#374151', whiteSpace: 'pre-wrap' }}>{factura.pieFactura}</Typography>
            ) : (
              <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>Sin pie de factura.</Typography>
            )}
          </AccordionSection>

          <AccordionSection
            number={5}
            title="Comentario"
            hint={factura.comentario ? 'Configurado' : undefined}
            defaultOpen={Boolean(factura.comentario)}
          >
            {factura.comentario ? (
              <Typography sx={{ fontSize: '0.875rem', color: '#374151', whiteSpace: 'pre-wrap' }}>{factura.comentario}</Typography>
            ) : (
              <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>Sin comentarios.</Typography>
            )}
          </AccordionSection>

          {/* Metadatos del documento */}
          {(factura.createdByName || factura.updatedByName) && (
            <SectionCard number={6} title="Información del documento">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3, rowGap: 1, fontSize: '0.875rem' }}>
                {factura.createdByName && (
                  <Box>
                    <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#6b7280' }}>Creado por</Typography>
                    <Typography sx={{ fontWeight: 500, color: '#111827' }}>{factura.createdByName}</Typography>
                  </Box>
                )}
                {factura.updatedByName && (
                  <Box>
                    <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#6b7280' }}>Última edición</Typography>
                    <Typography sx={{ fontWeight: 500, color: '#111827' }}>
                      {factura.updatedByName}
                      <Box component="span" sx={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 400, ml: 0.75 }}>{fmtDate(factura.updatedAt)}</Box>
                    </Typography>
                  </Box>
                )}
              </Box>
            </SectionCard>
          )}

          {/* Cliente compacto */}
          <SectionCard number={(factura.createdByName || factura.updatedByName) ? 7 : 6} title="Datos del comprador">
            {factura.comprador.razonSocial ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3, rowGap: 1, fontSize: '0.875rem' }}>
                <Box>
                  <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#6b7280' }}>Razón social</Typography>
                  <Typography sx={{ fontWeight: 500, color: '#111827' }}>{factura.comprador.razonSocial}</Typography>
                </Box>
                {factura.comprador.rnc && (
                  <Box>
                    <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#6b7280' }}>RNC</Typography>
                    <Typography sx={{ color: '#1f2937', fontFamily: 'monospace' }}>{factura.comprador.rnc}</Typography>
                  </Box>
                )}
                {factura.comprador.email && (
                  <Box>
                    <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#6b7280' }}>Email</Typography>
                    <Typography sx={{ color: '#1f2937', wordBreak: 'break-all' }}>{factura.comprador.email}</Typography>
                  </Box>
                )}
                {factura.comprador.telefono && (
                  <Box>
                    <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#6b7280' }}>Teléfono</Typography>
                    <Typography sx={{ color: '#1f2937' }}>{factura.comprador.telefono}</Typography>
                  </Box>
                )}
                {factura.comprador.direccion && (
                  <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                    <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#6b7280' }}>Dirección</Typography>
                    <Typography sx={{ color: '#1f2937' }}>{factura.comprador.direccion}</Typography>
                  </Box>
                )}
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>
                {esEcfReal ? 'Consumidor final' : 'Sin cliente especificado'}
              </Typography>
            )}
          </SectionCard>

              </Box>
            )}

            {activeTab === 'notas' && (
              <Box sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', p: { xs: 2, md: 2.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <StickyNote size={16} color="#3658e1" />
                  <Typography component="h3" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Notas</Typography>
                </Box>
                <EntityNotes entityType="factura" entityId={factura.id} />
              </Box>
            )}

            {activeTab === 'historia' && (
              <Box sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', p: { xs: 2, md: 2.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <HistoryIcon size={16} color="#3658e1" />
                  <Typography component="h3" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Historia de la factura</Typography>
                </Box>
                <EntityHistory docId={factura.id} encf={factura.encf} />
              </Box>
            )}
          </Box>
        </Box>

        {/* ━━━ RIGHT: sticky sidebar ━━━ */}
        <Box component="aside" sx={{ display: 'flex', flexDirection: 'column', gap: 2, position: { lg: 'sticky' }, top: { lg: 16 }, alignSelf: { lg: 'flex-start' }, minWidth: 0 }}>

          {/* Resumen */}
          <Box component="section" sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
            <Box
              component="button"
              type="button"
              onClick={() => setResumenOpen(v => !v)}
              aria-expanded={resumenOpen}
              sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1, px: { xs: 2, md: 2.5 }, pt: 2, pb: 1.5, background: 'none', border: 'none', cursor: 'pointer', transition: 'background 0.15s', '&:hover': { bgcolor: '#fafafa' } }}
            >
              <FileText size={16} color="#3658e1" style={{ flexShrink: 0 }} aria-hidden="true" />
              <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', flex: 1, textAlign: 'left' }}>Resumen</Typography>
              {resumenOpen
                ? <ChevronUp size={16} color="#9ca3af" />
                : <ChevronDown size={16} color="#9ca3af" />}
            </Box>

            {resumenOpen && (
              <Box sx={{ px: { xs: 2, md: 2.5 }, pb: 2 }}>
                {factura.lineas.length > 0 && (
                  <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 1.5, fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.025em', pb: 1, borderBottom: '1px solid #f3f4f6' }}>
                      <Box component="span">Descripción</Box>
                      <Box component="span" sx={{ textAlign: 'right' }}>Cant.</Box>
                      <Box component="span" sx={{ textAlign: 'right' }}>Total</Box>
                    </Box>
                    <Box sx={{ '& > div + div': { borderTop: '1px solid #f9fafb' } }}>
                      {factura.lineas.map((l, idx) => (
                        <Box key={l.id ?? idx} sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 1.5, py: 1, fontSize: '0.875rem' }}>
                          <Box component="span" title={l.nombreItem} sx={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.nombreItem || '—'}
                          </Box>
                          <Box component="span" sx={{ color: '#4b5563', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {Number(l.cantidadItem) || 0}
                          </Box>
                          <Box component="span" sx={{ color: '#111827', fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {fmtDOP(calcTotalLinea(l))}
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </>
                )}

                <Box sx={{ pt: 1.5, mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.75, borderTop: '1px solid #f3f4f6' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#4b5563' }}>
                    <Box component="span">Subtotal</Box>
                    <Box component="span" sx={{ fontWeight: 500, color: '#1f2937', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(totales.subtotal)}</Box>
                  </Box>
                  {totales.itbis > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#4b5563' }}>
                      <Box component="span">ITBIS (18%)</Box>
                      <Box component="span" sx={{ fontWeight: 500, color: '#1f2937', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(totales.itbis)}</Box>
                    </Box>
                  )}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700, color: '#111827', borderTop: '2px solid #e5e7eb', pt: 1.5, mt: 1.5 }}>
                  <Box component="span">{esNc ? 'Total acreditado' : 'Total'}</Box>
                  <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(totales.total)}</Box>
                </Box>

                {ncAplicadoDOP > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', mt: 1.5, color: '#2a45c4' }}>
                    <Box component="span">Notas de crédito</Box>
                    <Box component="span" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>−{fmtDOP(ncAplicadoDOP)}</Box>
                  </Box>
                )}

                {!esNc && (
                  <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', mt: ncAplicadoDOP > 0 ? 0.75 : 1.5, color: pagadoDOP > 0 ? '#047857' : '#dc2626' }}>
                      <Box component="span">Pagado</Box>
                      <Box component="span" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(pagadoDOP)}</Box>
                    </Box>

                    <Box sx={{
                      display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', borderRadius: '8px', px: 1.5, py: 1, mt: 1, border: '1px solid',
                      ...(saldo === 0
                        ? { bgcolor: '#ecfdf5', borderColor: '#d1fae5', color: '#065f46' }
                        : { bgcolor: '#fef2f2', borderColor: '#fee2e2', color: '#991b1b' }),
                    }}>
                      <Box component="span" sx={{ fontWeight: 600 }}>Saldo pendiente</Box>
                      <Box component="span" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(saldo)}</Box>
                    </Box>

                    {facturaPagada && (
                      <Typography sx={{ fontSize: '11px', color: '#047857', mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CheckCircle size={12} />
                        Factura pagada en su totalidad
                      </Typography>
                    )}
                  </>
                )}
              </Box>
            )}
          </Box>

          {/* Estado DGII card — solo cuando hay e-CF real emitido a DGII.
              HISTORICA (ALG-), borrador (BOR-) y sin-ncf no fueron a DGII. */}
          {esEcfReal && (
            <EstadoDgiiCard factura={factura} onConsultar={consultarEstado} consultarStatus={pollingStatus} />
          )}

          {/* Rechazado por DGII → admin cancela el envío y reintenta. */}
          {esEcfReal && factura.estado === 'RECHAZADO' && can('facturas:anular') && (
            <Box component="section" sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #fecaca', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', px: { xs: 2, md: 2.5 }, py: 2 }}>
              <Typography component="h3" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', mb: 0.5 }}>Reintentar envío</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 1.5 }}>
                La DGII rechazó este comprobante. Corrige el motivo (ver arriba), luego cancela el envío y reenvíalo.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button
                  onClick={() => handleResetEmision(false)}
                  disabled={reseteando}
                  sx={{ width: '100%', bgcolor: '#3658e1', color: '#fff', height: 36, fontSize: '0.875rem', textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: '#2a45c4' }, '&.Mui-disabled': { bgcolor: '#3658e1', opacity: 0.5, color: '#fff' } }}
                >
                  Cancelar y reintentar con e-NCF nuevo
                </Button>
                <Box
                  component="button"
                  type="button"
                  onClick={() => handleResetEmision(true)}
                  disabled={reseteando}
                  sx={{ width: '100%', fontSize: '0.75rem', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', p: 0, '&:hover': { color: '#374151' }, '&:disabled': { opacity: 0.5, cursor: 'default' } }}
                >
                  o reintentar con el mismo e-NCF
                </Box>
              </Box>
            </Box>
          )}

          {/* No emitida a DGII (histórica/borrador/sin-ncf) → CTA para generar e-CF. */}
          {!esEcfReal && puedeEmitir && (
            <Box component="section" sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', px: { xs: 2, md: 2.5 }, py: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircle size={16} color="#f59e0b" style={{ flexShrink: 0 }} aria-hidden="true" />
                <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Estado DGII</Typography>
              </Box>
              <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mb: 1.5, lineHeight: 1.4 }}>
                No emitida a la DGII. Es un registro {esBorrador ? 'borrador' : 'histórico'} sin e-CF.
                Genera un e-CF para enviarla a la DGII.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {canEmitir && (
                  <Button
                    type="button"
                    onClick={triggerEnviarDgii}
                    startIcon={<Send size={16} />}
                    sx={{ bgcolor: '#3658e1', color: '#fff', height: 36, width: '100%', textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: '#2a45c4' } }}
                  >
                    {sinLineas && canEdit ? 'Completar y generar e-CF' : 'Generar e-CF / Enviar a DGII'}
                  </Button>
                )}
                {canEdit && (
                  <Button
                    component={Link}
                    href={`/dashboard/facturas/${factura.id}/editar`}
                    nativeButton={false}
                    type="button"
                    variant="outlined"
                    sx={{ height: 36, width: '100%', textTransform: 'none', color: '#2a45c4', borderColor: '#a5b4f9', borderRadius: '8px', '&:hover': { bgcolor: '#eef2fe', borderColor: '#a5b4f9' } }}
                  >
                    Editar antes de emitir
                  </Button>
                )}
                {!canEdit && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, borderRadius: '8px', bgcolor: '#fffbeb', border: '1px solid #fde68a', px: 1.5, py: 1, fontSize: '0.75rem', color: '#92400e' }}>
                    <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                    <Box component="span">Para editar esta factura, pídele al administrador.</Box>
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* Crear nota de crédito / débito — CTA visible en sidebar */}
          {puedeCrearNota && can('facturas:crear') && (
            <Box component="section" sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', px: { xs: 2, md: 2.5 }, py: 2 }}>
              <Typography component="h3" sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#6b7280', mb: 1.5 }}>Crear nota</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button
                  component={Link}
                  href={`/dashboard/notas-credito/nueva?padreId=${factura.id}`}
                  nativeButton={false}
                  variant="outlined"
                  startIcon={<TrendingDown size={16} />}
                  sx={{ width: '100%', height: 36, textTransform: 'none', color: '#2a45c4', borderColor: '#c7d2fc', borderRadius: '8px', justifyContent: 'flex-start', gap: 1, '&:hover': { bgcolor: '#eef2fe', borderColor: '#c7d2fc' } }}
                >
                  <Box component="span" sx={{ flex: 1, textAlign: 'left', fontSize: '0.875rem' }}>Nota de crédito</Box>
                  <Box component="span" sx={{ fontSize: '10px', color: '#9ca3af' }}>Reduce el saldo</Box>
                </Button>
                <Button
                  component={Link}
                  href={`/dashboard/notas-debito/nueva?padreId=${factura.id}`}
                  nativeButton={false}
                  variant="outlined"
                  startIcon={<TrendingUp size={16} />}
                  sx={{ width: '100%', height: 36, textTransform: 'none', color: '#c2410c', borderColor: '#fed7aa', borderRadius: '8px', justifyContent: 'flex-start', gap: 1, '&:hover': { bgcolor: '#fff7ed', borderColor: '#fed7aa' } }}
                >
                  <Box component="span" sx={{ flex: 1, textAlign: 'left', fontSize: '0.875rem' }}>Nota de débito</Box>
                  <Box component="span" sx={{ fontSize: '10px', color: '#9ca3af' }}>Cargo adicional</Box>
                </Button>
              </Box>
            </Box>
          )}

          {/* Notas de crédito/débito que modifican esta factura */}
          {factura.ncsAsociadas && factura.ncsAsociadas.length > 0 && (
            <Box component="section" sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', px: { xs: 2, md: 2.5 }, py: 2 }}>
              <Typography component="h3" sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#6b7280', mb: 1 }}>
                Notas asociadas ({factura.ncsAsociadas.length})
              </Typography>
              <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1, fontSize: '0.75rem' }}>
                {factura.ncsAsociadas.map(nc => (
                  <Box component="li" key={nc.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, borderBottom: '1px solid #f3f4f6', pb: 1, '&:last-of-type': { borderBottom: 0, pb: 0 } }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <MuiLink component={Link} href={`/dashboard/facturas/${nc.id}`} sx={{ fontFamily: 'monospace', color: '#2a45c4', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', '&:hover': { textDecoration: 'underline' } }}>
                        {nc.encf && !nc.encf.startsWith('BOR-') ? nc.encf : (nc.codigo ?? `Borrador #${nc.id}`)}
                      </MuiLink>
                      <Box sx={{ fontSize: '10px', color: '#6b7280', mt: 0.25, display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Box component="span" sx={{ color: nc.tipoEcf === '34' ? '#2a45c4' : '#c2410c', fontWeight: 500 }}>
                          {nc.tipoEcf === '34' ? 'Crédito' : 'Débito'}
                        </Box>
                        {(nc.razonModificacion || nc.codigoModificacion != null) && (
                          <>
                            <Box component="span">·</Box>
                            <Box component="span">{nc.razonModificacion?.trim() || (nc.codigoModificacion != null ? COD_MODIFICACION_LABEL[nc.codigoModificacion] ?? `Cód. ${nc.codigoModificacion}` : '')}</Box>
                          </>
                        )}
                        <Box component="span">·</Box>
                        <Box component="span">{nc.estado === 'BORRADOR' ? 'Sin emitir a DGII' : nc.estado}</Box>
                        <Box component="span">·</Box>
                        <Box component="span">{fmtDate(nc.fechaEmision)}</Box>
                      </Box>
                    </Box>
                    <Box component="span" sx={{ fontFamily: 'monospace', flexShrink: 0, color: nc.tipoEcf === '34' ? '#2a45c4' : '#1f2937' }}>
                      {nc.tipoEcf === '34' ? '−' : ''}RD$ {nc.montoTotalDOP}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* Info del comprobante — solo cuando hay e-CF real emitido a DGII */}
          {esEcfReal && (
            <Box component="section" sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', px: { xs: 2, md: 2.5 }, py: 2 }}>
              <Typography component="h3" sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#6b7280', mb: 1 }}>
                Información del comprobante
              </Typography>
              <Box component="dl" sx={{ m: 0, display: 'flex', flexDirection: 'column', gap: 1, fontSize: '0.75rem' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                  <Box component="dt" sx={{ color: '#6b7280' }}>e-NCF</Box>
                  <Box component="dd" sx={{ m: 0, fontFamily: 'monospace', fontWeight: 600, color: '#111827', textAlign: 'right', wordBreak: 'break-all' }}>{factura.encf}</Box>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                  <Box component="dt" sx={{ color: '#6b7280' }}>Tipo</Box>
                  <Box component="dd" sx={{ m: 0, color: '#1f2937', textAlign: 'right' }}>e-{factura.tipoEcf}</Box>
                </Box>
                {factura.codigoSeguridad && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                    <Box component="dt" sx={{ color: '#6b7280' }}>Código seg.</Box>
                    <Box component="dd" sx={{ m: 0, fontFamily: 'monospace', fontWeight: 700, color: '#2a45c4', textAlign: 'right' }}>{factura.codigoSeguridad}</Box>
                  </Box>
                )}
                {factura.trackId && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                    <Box component="dt" sx={{ color: '#6b7280' }}>Track ID</Box>
                    <Box component="dd" sx={{ m: 0, fontFamily: 'monospace', color: '#374151', fontSize: '10px', textAlign: 'right', wordBreak: 'break-all' }}>{factura.trackId}</Box>
                  </Box>
                )}
                {factura.ncfModificado && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                    <Box component="dt" sx={{ color: '#6b7280' }}>NCF modificado</Box>
                    <Box component="dd" sx={{ m: 0, fontFamily: 'monospace', color: '#1f2937', textAlign: 'right' }}>{factura.ncfModificado}</Box>
                  </Box>
                )}
                {factura.codigoModificacion != null && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                    <Box component="dt" sx={{ color: '#6b7280' }}>Motivo</Box>
                    <Box component="dd" sx={{ m: 0, color: '#1f2937', textAlign: 'right' }}>
                      {factura.codigoModificacion} — {COD_MODIFICACION_LABEL[factura.codigoModificacion] ?? 'Modificación'}
                    </Box>
                  </Box>
                )}
                {factura.razonModificacion && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
                    <Box component="dt" sx={{ color: '#6b7280' }}>Razón</Box>
                    <Box component="dd" sx={{ m: 0, color: '#1f2937', textAlign: 'right' }}>{factura.razonModificacion}</Box>
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* Notas de débito por mora atadas a esta factura */}
          {factura.notasMora && factura.notasMora.length > 0 && (
            <Box component="section" sx={{ bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 2, md: 2.5 }, pt: 2, pb: 1.5 }}>
                <Plus size={16} color="#ea580c" style={{ flexShrink: 0 }} aria-hidden="true" />
                <Typography component="h2" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Notas de débito por mora</Typography>
              </Box>
              <Box sx={{ px: { xs: 2, md: 2.5 }, pb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {factura.notasMora.map(nd => (
                  <Box
                    key={nd.id}
                    component={Link}
                    href={`/dashboard/facturas/${nd.id}`}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderRadius: '8px', border: '1px solid #ffedd5', bgcolor: 'rgba(255,247,237,0.4)', px: 1.5, py: 1, textDecoration: 'none', '&:hover': { bgcolor: '#fff7ed' } }}
                  >
                    <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600, color: '#9a3412' }}>{nd.codigo ?? `#${nd.id}`}</Box>
                    <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmtDOP(nd.montoTotal / 100)}</Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* Pago — historial read-only (los pagos se gestionan en Cuentas por cobrar).
              No aplica a notas de crédito: acreditan, no se cobran. */}
          {!esNc && (
            <PagoCard
              initial={factura.pago}
              totalDOP={factura.montos.montoTotalDOP}
            />
          )}

          {/* Cobro en línea: link de pago (CardNet/Azul/Simulador). Disponible en
              cualquier factura (borrador o emitida) que no sea NC y no esté pagada. */}
          {!esNc && !factura.pago?.recibido && (
            <Box sx={{ mt: 1.5 }}>
              <CobrarLinkButton
                ecfDocumentId={factura.id}
                telefonoCliente={factura.comprador?.telefono ?? null}
                className="w-full"
                autoOpen={autoCobrar}
                onPagado={() => window.location.reload()}
              />
            </Box>
          )}
        </Box>
      </Box>
      </Box>

      {/* ─── Bottom action bar ────────────────────────────────────────────── */}
      {/* Vista detalle = read-only. Solo borrador habilita acciones de edición.
          Para facturas emitidas: Volver + Ver PDF + Acciones (imprimir/email). */}
      <Box sx={{
        flexShrink: 0, zIndex: 30,
        bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)', borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -4px 12px -2px rgba(0,0,0,0.08)',
        display: 'flex', flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { sm: 'center' },
        justifyContent: { sm: 'space-between' }, gap: 1.5, px: { xs: 2, sm: 3 }, py: 1.5,
      }}>
        <Button
          type="button"
          variant="outlined"
          onClick={() => router.push(ui.backHref)}
          sx={{ color: '#4b5563', height: { xs: 44, sm: 36 }, width: { xs: '100%', sm: 'auto' }, textTransform: 'none', borderRadius: '8px' }}
        >
          {esBorrador ? 'Cancelar' : 'Volver'}
        </Button>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, gap: 1.5, width: { xs: '100%', sm: 'auto' } }}>
          <Button
            component="a"
            href={`/api/pdf/factura/${factura.codigo ?? factura.id}`}
            target="_blank"
            rel="noreferrer"
            nativeButton={false}
            type="button"
            variant="outlined"
            startIcon={<FileText size={16} />}
            sx={{ color: '#4b5563', height: { xs: 44, sm: 36 }, width: { xs: '100%', sm: 'auto' }, textTransform: 'none', borderRadius: '8px' }}
          >
            Ver PDF
          </Button>

          {puedeEmitir ? (
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, width: { xs: '100%', sm: 'auto' }, alignItems: { sm: 'center' } }}>
              {canEdit ? (
                <Button
                  component={Link}
                  href={`/dashboard/facturas/${factura.id}/editar`}
                  nativeButton={false}
                  type="button"
                  variant="outlined"
                  sx={{ color: '#2a45c4', borderColor: '#a5b4f9', height: { xs: 44, sm: 36 }, width: { xs: '100%', sm: 'auto' }, textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: '#eef2fe', borderColor: '#a5b4f9' } }}
                >
                  {esBorrador ? 'Editar borrador' : 'Editar'}
                </Button>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, borderRadius: '8px', bgcolor: '#fffbeb', border: '1px solid #fde68a', px: 1.5, py: 1, fontSize: '0.75rem', color: '#92400e', width: { xs: '100%', sm: 'auto' }, maxWidth: { sm: 260 } }}>
                  <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                  <Box component="span">Para editar esta factura, pídele al administrador.</Box>
                </Box>
              )}
              {canEmitir && (
                <Button
                  type="button"
                  onClick={triggerEnviarDgii}
                  startIcon={<Send size={16} />}
                  sx={{ bgcolor: '#3658e1', color: '#fff', height: { xs: 44, sm: 36 }, width: { xs: '100%', sm: 'auto' }, textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: '#2a45c4' } }}
                >
                  {sinLineas && canEdit ? 'Completar y emitir' : 'Enviar a DGII'}
                </Button>
              )}
            </Box>
          ) : (
            <>
              <Button
                type="button"
                onClick={(e) => setAccionesAnchor(e.currentTarget)}
                disabled={esFinal && factura.estado === 'ANULADO'}
                endIcon={<ChevronDown size={14} />}
                sx={{ bgcolor: '#3658e1', color: '#fff', height: { xs: 44, sm: 36 }, width: { xs: '100%', sm: 'auto' }, textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: '#2a45c4' }, '&.Mui-disabled': { bgcolor: '#3658e1', opacity: 0.5, color: '#fff' } }}
              >
                Acciones
              </Button>
              <Menu
                anchorEl={accionesAnchor}
                open={Boolean(accionesAnchor)}
                onClose={() => setAccionesAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                slotProps={{ paper: { sx: { width: 224 } } as object }}
              >
                <MenuItem
                  component="a"
                  href={`/api/pdf/factura/${factura.codigo ?? factura.id}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setAccionesAnchor(null)}
                  sx={{ gap: 1 }}
                >
                  <Printer size={16} color="#6b7280" />
                  Imprimir
                </MenuItem>
                <MenuItem
                  onClick={() => { setAccionesAnchor(null); setShowEmail(true); }}
                  sx={{ gap: 1 }}
                >
                  <Mail size={16} color="#6b7280" />
                  Enviar por correo
                </MenuItem>
              </Menu>
            </>
          )}
        </Box>
      </Box>

      {/* ─── Modals ───────────────────────────────────────────────────────── */}

      {/* Confirmar anulación */}
      <Dialog
        open={showAnular}
        onClose={() => setShowAnular(false)}
        slotProps={{ paper: { sx: { borderRadius: '12px', maxWidth: 384, width: '100%' } } as object }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '1.125rem' }}>¿Anular comprobante?</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {anularError && (
              <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.875rem', borderRadius: '8px', p: 1.5 }}>
                {anularError}
              </Box>
            )}
            <Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>
              Vas a anular el comprobante{' '}
              <Box component="strong" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{factura.encf}</Box>.
            </Typography>

            {/* NCA-05/06: tipo de anulación (motivo DGII) */}
            <Box>
              <Typography component="label" sx={fieldLabelSx}>Tipo de anulación</Typography>
              <TextField
                select
                size="small"
                fullWidth
                value={anularTipo}
                onChange={e => setAnularTipo(e.target.value as typeof anularTipo)}
                sx={selectFieldSx}
              >
                <MenuItem value="01">01 — Deterioro de Factura Pre-impresa</MenuItem>
                <MenuItem value="02">02 — Errores de Impresión</MenuItem>
                <MenuItem value="03">03 — Impresión Defectuosa</MenuItem>
                <MenuItem value="04">04 — Cesación de Operaciones</MenuItem>
                <MenuItem value="05">05 — Pérdida o Hurto de Talonarios</MenuItem>
              </TextField>
            </Box>

            <Box>
              <Typography component="label" sx={fieldLabelSx}>Motivo interno (opcional)</Typography>
              <TextField
                multiline
                minRows={2}
                size="small"
                fullWidth
                value={anularMotivo}
                onChange={e => setAnularMotivo(e.target.value)}
                placeholder="Notas internas sobre la anulación"
                slotProps={{ htmlInput: { maxLength: 500 } }}
                sx={selectFieldSx}
              />
            </Box>

            {/* NCA-03: si hay pagos, requiere force */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={anularForce}
                  onChange={e => setAnularForce(e.target.checked)}
                  size="small"
                  sx={{ pt: 0.25, alignSelf: 'flex-start' }}
                />
              }
              label={
                <Box component="span" sx={{ fontSize: '0.75rem', color: '#374151' }}>
                  Forzar anulación aunque haya pagos registrados (revertirá los pagos asociados).
                </Box>
              }
              sx={{ alignItems: 'flex-start', m: 0, gap: 0.5 }}
            />

            {(factura.estado === 'ACEPTADO' || factura.estado === 'ACEPTADO_CONDICIONAL') && (
              <Box sx={{ bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', p: 1.5, fontSize: '0.75rem', color: '#92400e', display: 'flex', gap: 1 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <Box component="span">
                  Este comprobante ya fue aceptado por la DGII. La anulación formal
                  requiere emitir una <Box component="strong" sx={{ fontWeight: 700 }}>Nota de Crédito (e-34)</Box> referenciando este e-NCF.
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setShowAnular(false)} disabled={anulando} sx={{ textTransform: 'none', borderRadius: '8px' }}>
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={handleAnular} disabled={anulando} startIcon={anulando ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : undefined} sx={{ textTransform: 'none', borderRadius: '8px' }}>
            {anulando ? 'Anulando…' : 'Sí, anular'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Enviar por correo */}
      <Dialog
        open={showEmail}
        onClose={() => setShowEmail(false)}
        slotProps={{ paper: { sx: { borderRadius: '12px', maxWidth: 384, width: '100%' } } as object }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '1.125rem' }}>Enviar factura por correo</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box>
            <Typography component="span" sx={{ fontSize: '0.75rem', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.025em' }}>Destinatario</Typography>
            <TextField
              type="email"
              size="small"
              fullWidth
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="cliente@dominio.com"
              sx={{ mt: 0.5, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setShowEmail(false)} disabled={sendingEmail} sx={{ textTransform: 'none', borderRadius: '8px' }}>
            Cancelar
          </Button>
          <Button
            onClick={handleSendEmail}
            disabled={sendingEmail || !emailTo}
            startIcon={sendingEmail ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={16} />}
            sx={{ bgcolor: '#3658e1', color: '#fff', textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: '#2a45c4' }, '&.Mui-disabled': { bgcolor: '#3658e1', opacity: 0.5, color: '#fff' } }}
          >
            {sendingEmail ? 'Enviando…' : 'Enviar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Enviar a DGII */}
      <Dialog
        open={showEnviarDgii}
        onClose={() => setShowEnviarDgii(false)}
        slotProps={{ paper: { sx: { borderRadius: '12px', maxWidth: 448, width: '100%' } } as object }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '1.125rem' }}>Enviar a la DGII</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {enviandoDgiiError && (
              <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.875rem', borderRadius: '8px', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <Box component="span">{enviandoDgiiError}</Box>
                </Box>
                {enviandoDgiiAction === 'edit-factura' && (
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {canEdit ? (
                      <MuiLink
                        component={Link}
                        href={`/dashboard/facturas/${factura.id}/editar`}
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', fontWeight: 500, color: '#b91c1c', textDecoration: 'underline', '&:hover': { color: '#7f1d1d' } }}
                      >
                        Editar factura para completarla →
                      </MuiLink>
                    ) : (
                      <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#b91c1c' }}>
                        Pídele al administrador que edite la factura.
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            )}
            <Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>
              Selecciona el tipo de comprobante fiscal para emitir esta factura a la DGII.
              Se asignará un e-NCF de tu secuencia activa.
            </Typography>
            <Box>
              <Typography component="label" sx={fieldLabelSx}>Tipo de comprobante (e-CF)</Typography>
              {esNota ? (
                // El tipo de una nota es intrínseco al documento (e33 débito / e34
                // crédito): no se puede cambiar al emitir. Se muestra fijo.
                <Box sx={{ width: '100%', borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: '#f9fafb', px: 1.5, py: 1, fontSize: '0.875rem', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box component="span">{TIPOS_EMIT_DGII.find(t => t.value === factura.tipoEcf)?.label ?? `e${factura.tipoEcf}`}</Box>
                  <Box component="span" sx={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#9ca3af' }}>fijo</Box>
                </Box>
              ) : (
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={dgiiTipoEcf}
                  onChange={e => setDgiiTipoEcf(e.target.value)}
                  sx={selectFieldSx}
                >
                  {/* El tipo propio del documento siempre visible: aunque aún no exista
                      secuencia (el server devuelve un error claro indicando crearla). */}
                  {TIPOS_EMIT_DGII.filter(t => tipoVisible(t.value) || t.value === factura.tipoEcf).map(t => (
                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                  ))}
                </TextField>
              )}
              {dgiiRegla && (
                <Typography sx={{ fontSize: '11px', color: '#6b7280', lineHeight: 1.4, mt: 0.5 }}>{dgiiRegla.descripcion}</Typography>
              )}
            </Box>

            {/* ─── Código de modificación (notas 33/34) ───────────────────── */}
            {(dgiiTipoEcf === '33' || dgiiTipoEcf === '34') && (
              <Box>
                <Typography component="label" sx={fieldLabelSx}>
                  Código de modificación<Box component="span" sx={{ color: '#ef4444', ml: 0.25 }}>*</Box>
                </Typography>
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={dgiiCodMod}
                  onChange={e => setDgiiCodMod(e.target.value)}
                  slotProps={{ select: { displayEmpty: true } }}
                  sx={selectFieldSx}
                >
                  <MenuItem value="">Selecciona el motivo…</MenuItem>
                  {Object.entries(COD_MODIFICACION_LABEL).map(([code, label]) => (
                    <MenuItem key={code} value={code}>{code} — {label}</MenuItem>
                  ))}
                </TextField>
                <Typography sx={{ fontSize: '11px', color: '#6b7280', lineHeight: 1.4, mt: 0.5 }}>
                  Por qué esta nota modifica el comprobante original — lo exige la DGII.
                </Typography>
              </Box>
            )}

            {/* ─── Comprador (RNC + razón social) ─────────────────────────── */}
            {/* Mostrar solo si el tipo lo requiere (e31 sí) o e32 ≥ DOP 250,000.
                e32 normal (consumo) → oculto, aunque haya cliente preseleccionado. */}
            {dgiiRegla && (
              dgiiRegla.requiereRncComprador ||
              dgiiRegla.requiereRazonSocial ||
              (dgiiTipoEcf === '32' && (parseFloat(factura.montos.montoTotalDOP) || 0) >= 250000)
            ) && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: '#f9fafb', p: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography component="label" sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>
                    {dgiiRegla.compradorLabel}
                    {(dgiiRegla.requiereRncComprador || dgiiRegla.requiereRazonSocial) && (
                      <Box component="span" sx={{ color: '#ef4444', ml: 0.25 }}>*</Box>
                    )}
                  </Typography>
                  {factura.comprador.rnc && (
                    <Box component="span" sx={{ fontSize: '10px', color: '#9ca3af' }}>guardado en factura</Box>
                  )}
                </Box>
                <Box>
                  <Typography component="label" sx={{ display: 'block', fontSize: '11px', color: '#4b5563', mb: 0.75 }}>{dgiiRegla.rncLabel}</Typography>
                  <RncSearch
                    value={tempRnc ? `${tempRnc}${tempRazon ? ` · ${tempRazon}` : ''}` : ''}
                    onSelect={(r) => { setTempRnc(r.rnc); setTempRazon(r.nombre); }}
                    onClear={() => { setTempRnc(''); setTempRazon(''); }}
                    placeholder="Buscar RNC, Cédula o razón social…"
                  />
                </Box>
                <Box>
                  <Typography component="label" sx={{ display: 'block', fontSize: '11px', color: '#4b5563', mb: 0.75 }}>Razón social / nombre</Typography>
                  <TextField
                    type="text"
                    size="small"
                    fullWidth
                    value={tempRazon}
                    onChange={e => setTempRazon(e.target.value)}
                    placeholder="Nombre o razón social"
                    sx={selectFieldSx}
                  />
                </Box>
              </Box>
            )}

            {/* ─── Validaciones pre-flight ──────────────────────────────── */}
            {!dgiiValidacion.ok && (
              <Box sx={{
                borderRadius: '8px', border: '1px solid', p: 1.5, fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: 1,
                ...(dgiiValidacion.requiereEditar
                  ? { bgcolor: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }
                  : { bgcolor: '#fffbeb', borderColor: '#fde68a', color: '#78350f' }),
              }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Typography sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                      {dgiiValidacion.requiereEditar
                        ? 'No se puede emitir desde aquí'
                        : 'Faltan datos requeridos por la DGII'}
                    </Typography>
                    <Box component="ul" sx={{ listStyle: 'disc', listStylePosition: 'inside', m: 0, p: 0, '& li': { mb: 0.25 } }}>
                      {dgiiValidacion.errores.map((e, i) => (
                        <li key={i}>{e.mensaje}</li>
                      ))}
                    </Box>
                  </Box>
                </Box>
                {dgiiValidacion.requiereEditar && (
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {canEdit ? (
                      <MuiLink
                        component={Link}
                        href={`/dashboard/facturas/${factura.id}/editar`}
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', fontWeight: 500, color: 'inherit', textDecoration: 'underline', '&:hover': { opacity: 0.8 } }}
                      >
                        Editar factura para completarla →
                      </MuiLink>
                    ) : (
                      <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                        Pídele al administrador que edite la factura.
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            )}

            {/* Numeración — próximo e-NCF, editable para resolver colisiones de secuencia */}
            {dgiiTipoEcf !== 'sin-ncf' && (
              <Box>
                <Typography component="label" sx={fieldLabelSx}>Próximo e-NCF</Typography>
                {seqInfo == null ? (
                  <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Cargando numeración…
                  </Typography>
                ) : seqInfo.sinSecuencia ? (
                  <Typography sx={{ fontSize: '0.75rem', color: '#dc2626' }}>
                    No hay secuencia activa para e{dgiiTipoEcf}.{' '}
                    <MuiLink component={Link} href="/dashboard/secuencias" sx={{ textDecoration: 'underline', fontWeight: 500, color: 'inherit' }}>Crea una</MuiLink>.
                  </Typography>
                ) : (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                        E{dgiiTipoEcf}{(ncfNum || '0').padStart(10, '0')}
                      </Box>
                      {seqInfo.disponibles >= 0 && (
                        <Box component="span" sx={{ fontSize: '11px', color: '#9ca3af' }}>{seqInfo.disponibles} disponibles</Box>
                      )}
                    </Box>
                    <TextField
                      type="number"
                      size="small"
                      fullWidth
                      value={ncfNum}
                      onChange={e => setNcfNum(e.target.value)}
                      aria-label="Siguiente número de e-NCF"
                      slotProps={{ htmlInput: { min: 1, step: 1 } }}
                      sx={{ mt: 0.75, ...selectFieldSx }}
                    />
                    <Typography sx={{ fontSize: '11px', color: '#9ca3af', mt: 0.5 }}>
                      Si la DGII reporta el e-NCF como ya emitido, sube el siguiente número. No puede ser menor al actual.
                    </Typography>
                  </>
                )}
              </Box>
            )}

            <Box sx={{ bgcolor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', p: 1.5, fontSize: '0.75rem', color: '#92400e', display: 'flex', gap: 1 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <Box component="span">
                Esta acción consume un número de la secuencia activa para el tipo seleccionado
                y envía el comprobante a la DGII. No se puede deshacer.
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="outlined" onClick={() => setShowEnviarDgii(false)} disabled={enviandoDgii} sx={{ textTransform: 'none', borderRadius: '8px' }}>
            Cancelar
          </Button>
          <Button
            onClick={handleEnviarDgii}
            disabled={enviandoDgii || !dgiiValidacion.ok}
            startIcon={enviandoDgii ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            sx={{ bgcolor: '#3658e1', color: '#fff', textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: '#2a45c4' }, '&.Mui-disabled': { bgcolor: '#3658e1', opacity: 0.5, color: '#fff' } }}
          >
            {enviandoDgii ? 'Enviando…' : 'Emitir a DGII'}
          </Button>
        </DialogActions>
      </Dialog>

      {proximamenteDialog}

      {/* Alert: factura contado sin pago registrado → confirmar antes de emitir */}
      {showPagoMissingAlert && (
        <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
          <Box sx={{ bgcolor: '#fff', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', width: '100%', maxWidth: 448, p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <AlertTriangle size={20} color="#f59e0b" style={{ marginTop: 2, flexShrink: 0 }} />
              <Box>
                <Typography component="h2" sx={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
                  Esta factura aún no tiene pago registrado
                </Typography>
                <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 0.5 }}>
                  Es de contado pero no marcaste el cobro. ¿Cómo continúas?
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
              <Button
                onClick={() => {
                  setShowPagoMissingAlert(false);
                  document.querySelector('[data-pago-card]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                sx={{ bgcolor: '#3658e1', color: '#fff', textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: '#2a45c4' } }}
              >
                Registrar pago primero
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setShowPagoMissingAlert(false);
                  setEnviandoDgiiError(null);
                  setShowEnviarDgii(true);
                }}
                sx={{ color: '#b45309', borderColor: '#fcd34d', textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: '#fffbeb', borderColor: '#fcd34d' } }}
              >
                Emitir sin registrar pago
              </Button>
              <Button
                variant="text"
                onClick={() => setShowPagoMissingAlert(false)}
                sx={{ color: '#4b5563', textTransform: 'none', borderRadius: '8px' }}
              >
                Cancelar
              </Button>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// Ruta /dashboard/facturas/[id] → detalle en modo factura.
export default function FacturaDetallePage() {
  return <DocumentoDetalle variant="factura" />;
}
