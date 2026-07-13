'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Check, Building2, KeyRound, Hash, FileText, Rocket, Loader2,
  CloudUpload, FileKey, X, Eye, EyeOff, CheckCircle, AlertTriangle,
  AlertCircle,
  Copy, ExternalLink, Shield, ArrowRight, ChevronRight,
  Download, Printer, Globe, ScrollText, FlaskConical,
  FileSignature, Upload, Zap, Lock, RefreshCw,
  Image as ImageIcon, Mail, Clock, PartyPopper,
} from 'lucide-react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Divider from '@mui/material/Divider';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Tooltip from '@mui/material/Tooltip';
import Badge from '@mui/material/Badge';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import { ProvinciaMunicipioSelect } from '@/components/provincia-municipio-select';
import { TEST_CONTRIBUYENTE } from '@/lib/config/test-data';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Perfil {
  rnc?: string; razonSocial?: string; nombreComercial?: string;
  direccion?: string; provincia?: string; municipio?: string;
  telefono?: string; emailFacturacion?: string;
  dgiiRoutingToken?: string;
}
interface CertInfo {
  tieneCertificado: boolean; errorLectura?: boolean;
  titular?: string; vencimiento?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// 6 fases del wizard (excluye los 2 pre-requisitos: empresa + certificado)
const PHASES = [
  { id: 0, label: 'Postulación DGII',    icon: FileText,     sub: ['Datos del portal', 'Firma XML', 'Validación'] },
  { id: 1, label: 'Pruebas e-CF',        icon: FlaskConical, sub: ['Datos del producto', 'Envío', 'Confirmación'] },
  { id: 2, label: 'Representaciones',    icon: Printer,      sub: ['Descargar PDFs', 'Subida', 'Validación'] },
  { id: 3, label: 'URLs Producción',     icon: Globe,        sub: ['Registrar URLs'] },
  { id: 4, label: 'Declaración Jurada',  icon: ScrollText,   sub: ['Firmar y enviar', 'Verificación RNC'] },
  { id: 5, label: '¡Finalizado!',        icon: PartyPopper,  sub: ['Entrar a OFV'] },
];

const PHASE_TITLES = [
  'Postulación en el portal DGII',
  'Pruebas de simulación e-CF',
  'Representaciones impresas',
  'URLs de producción',
  'Declaración jurada',
  '¡Habilitación completada!',
];

const EMITEDO = {
  tipoSoftware:    'EXTERNO',
  nombreSoftware:  'EmiteDO',
  version:         '1',
  rncProveedor:    '1333307391',
  nombreProveedor: 'Yisrael Technology SRL',
};

// La webhookBaseUrl viene de ecf-api en tiempo real — se carga en el componente.

const PDFS = [
  { tipo: '31',  nombre: 'Factura de Crédito Fiscal',        tam: '~45 KB' },
  { tipo: '32a', nombre: 'Factura de Consumo (≥RD$250,000)', tam: '~43 KB' },
  { tipo: '32b', nombre: 'Factura de Consumo (<RD$250,000)', tam: '~40 KB' },
  { tipo: '33',  nombre: 'Nota de Débito',                   tam: '~38 KB' },
  { tipo: '34',  nombre: 'Nota de Crédito',                  tam: '~38 KB' },
  { tipo: '41',  nombre: 'Compras',                          tam: '~36 KB' },
  { tipo: '43',  nombre: 'Gastos Menores',                   tam: '~36 KB' },
  { tipo: '44',  nombre: 'Regímenes Especiales',             tam: '~36 KB' },
  { tipo: '45',  nombre: 'Gubernamental',                    tam: '~36 KB' },
  { tipo: '46',  nombre: 'Exportaciones',                    tam: '~36 KB' },
  { tipo: '47',  nombre: 'Pagos al Exterior',                tam: '~36 KB' },
];

// ─── Pruebas de simulación e-CF — tipos y tandas según set oficial DGII ──────

type EcfSendStatus = 'idle' | 'sending' | 'aceptado' | 'rechazado' | 'condicional' | 'proceso';

interface PruebaType {
  tipo: string;
  nombre: string;
  required: number | null; // null = flujo especial (FC <250K)
  batch: number;
}

const PRUEBA_BATCHES = [
  { id: 1, label: 'Primera tanda',        desc: 'Base — deben aprobarse antes de la 2ª tanda' },
  { id: 2, label: 'Segunda tanda',        desc: 'Notas de crédito/débito (ref. a tipos 31 y 32≥250K aprobados)' },
  { id: 3, label: 'Tercera tanda — RFCE', desc: 'Resumen de Facturas de Consumo Electrónicas' },
];

// La DGII exige exactamente 1 comprobante por tipo en el Set de Pruebas de Habilitación.
// Ref: portal DGII "Estado actual de las pruebas de simulación" — todos muestran /1.
const PRUEBA_ECF_TYPES: PruebaType[] = [
  { tipo: '31',  nombre: 'Factura de Crédito Fiscal',         required: 1,    batch: 1 },
  { tipo: '32g', nombre: 'Factura de Consumo (≥RD$250,000)',  required: 1,    batch: 1 },
  { tipo: '41',  nombre: 'Compras',                            required: 1,    batch: 1 },
  { tipo: '43',  nombre: 'Gastos Menores',                     required: 1,    batch: 1 },
  { tipo: '44',  nombre: 'Regímenes Especiales',               required: 1,    batch: 1 },
  { tipo: '45',  nombre: 'Gubernamental',                      required: 1,    batch: 1 },
  { tipo: '46',  nombre: 'Exportaciones',                      required: 1,    batch: 1 },
  { tipo: '47',  nombre: 'Pagos al Exterior',                  required: 1,    batch: 1 },
  { tipo: '33',  nombre: 'Nota de Débito',                     required: 1,    batch: 2 },
  { tipo: '34',  nombre: 'Nota de Crédito',                    required: 1,    batch: 2 },
  { tipo: '32r', nombre: 'Tipo 32 RFCE — Resumen FC',          required: 1,    batch: 3 },
  { tipo: '32b', nombre: 'Factura de Consumo (<RD$250,000)',   required: null, batch: 4 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const fmtSize = (b: number) => b < 1024 ? `${b} B` : `${(b / 1024).toFixed(0)} KB`;


// ─── Shared UI ────────────────────────────────────────────────────────────────

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.25, borderBottom: '1px solid #f3f4f6', '&:last-child': { borderBottom: 0 } }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{label}</Typography>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Typography>
      </Box>
      <IconButton
        size="small"
        onClick={() => { navigator.clipboard.writeText(value).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),1500); }}
        sx={{ ml: 1.5, borderRadius: '8px', color: '#9ca3af', '&:hover': { bgcolor: '#f3f4f6', color: '#0d9488' } }}
      >
        {copied ? <Check style={{ width: 14, height: 14, color: '#14b8a6' }} /> : <Copy style={{ width: 14, height: 14 }}/>}
      </IconButton>
    </Box>
  );
}

// Campo estilo portal DGII — label + asterisco arriba, valor en input con copy button dentro.
// Si `isUrl=true` muestra "https://" como prefijo visual gris (no se copia).
function DgiiField({ label, value, span, required = true, isUrl = false }: {
  label: string; value: string; span?: 'full' | '2'; required?: boolean; isUrl?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const gridColumn = span === 'full' ? '1 / -1' : span === '2' ? 'span 2' : undefined;
  return (
    <Box sx={{ gridColumn }}>
      <Typography component="label" sx={{ display: 'block', fontSize: '0.875rem', color: '#374151', mb: 0.5 }}>
        {label}{required && <Typography component="span" sx={{ color: 'error.main', ml: 0.25 }}>*</Typography>}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '6px', bgcolor: '#fff', overflow: 'hidden', '&:focus-within': { borderColor: '#2dd4bf', boxShadow: '0 0 0 2px rgba(13,148,136,0.15)' } }}>
        {isUrl && (
          <Typography component="span" sx={{ flexShrink: 0, px: 1.5, py: 1, fontSize: '0.875rem', color: '#9ca3af', bgcolor: '#f9fafb', borderRight: '1px solid #e5e7eb', userSelect: 'none' }}>
            https://
          </Typography>
        )}
        <Typography component="span" sx={{ flex: 1, px: 1.5, py: 1, fontSize: '0.875rem', color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{value}</Typography>
        <IconButton
          onClick={() => { navigator.clipboard.writeText(value).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),1500); }}
          size="small"
          title="Copiar"
          sx={{ flexShrink: 0, px: 1.5, py: 1, borderRadius: 0, borderLeft: '1px solid #e5e7eb', bgcolor: '#f9fafb', color: '#9ca3af', '&:hover': { bgcolor: '#f0fdfa', color: '#0d9488' } }}
        >
          {copied ? <Check style={{ width: 16, height: 16, color: '#14b8a6' }} /> : <Copy style={{ width: 16, height: 16 }}/>}
        </IconButton>
      </Box>
    </Box>
  );
}

// Alias legacy — no eliminar, lo usan otras secciones
function CopyField({ label, value, span }: { label: string; value: string; span?: 'full' | '2' }) {
  return <DgiiField label={label} value={value} span={span} required={false} />;
}

function InfoBox({ color, title, children }: { color: 'blue'|'amber'|'teal'|'red'; title: string; children: React.ReactNode }) {
  const colorMap = {
    blue:  { border: '#bfdbfe', bgcolor: '#eff6ff', color: '#1e40af' },
    amber: { border: '#fde68a', bgcolor: '#fffbeb', color: '#92400e' },
    teal:  { border: '#99f6e4', bgcolor: '#f0fdfa', color: '#134e4a' },
    red:   { border: '#fecaca', bgcolor: '#fef2f2', color: '#991b1b' },
  }[color];
  return (
    <Box sx={{ borderRadius: '12px', border: `1px solid ${colorMap.border}`, bgcolor: colorMap.bgcolor, color: colorMap.color, p: 2 }}>
      {title && <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, mb: 0.5 }}>{title}</Typography>}
      <Box sx={{ fontSize: '0.75rem', opacity: 0.9 }}>{children}</Box>
    </Box>
  );
}

function NavFooter({
  onBack, onNext, nextLabel = 'Continuar', nextDisabled = false, nextLoading = false,
}: {
  onBack?: () => void; onNext?: () => void;
  nextLabel?: string; nextDisabled?: boolean; nextLoading?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 2, mt: 1, borderTop: '1px solid #f3f4f6' }}>
      {onBack
        ? <Button variant="outlined" onClick={onBack} sx={{ textTransform: 'none', borderRadius: '8px' }}>← Atrás</Button>
        : <Box />}
      {onNext && (
        <Button
          onClick={onNext}
          disabled={nextDisabled || nextLoading}
          variant="contained"
          disableElevation
          sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, '&:disabled': { opacity: 0.4 }, px: 4, gap: 0.75 }}
        >
          {nextLoading && <CircularProgress size={16} sx={{ color: 'inherit', mr: 0.5 }} />}
          {nextLabel} {!nextLoading && <ChevronRight style={{ width: 16, height: 16 }}/>}
        </Button>
      )}
    </Box>
  );
}

// ─── HelpPopover ──────────────────────────────────────────────────────────────

function HelpPopover({ content, link, linkText }: {
  content: string; link?: string; linkText?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  return (
    <Box ref={ref} sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Más información"
        sx={{ height: 20, width: 20, borderRadius: '50%', border: '1px solid #d1d5db', bgcolor: '#fff', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, lineHeight: 1, cursor: 'pointer', '&:hover': { borderColor: '#2dd4bf', color: '#0d9488' }, transition: 'color 0.15s, border-color 0.15s' }}
      >
        ?
      </Box>
      {open && (
        <Box sx={{ position: 'absolute', zIndex: 70, width: 256, bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 25px 50px rgba(0,0,0,0.15)', p: 2, left: 28, top: '50%', transform: 'translateY(-50%)' }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', lineHeight: 1.6 }}>{content}</Typography>
          {link && (
            <Box component="a" href={link} target="_blank" rel="noopener noreferrer"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: '#0d9488', fontWeight: 600, '&:hover': { color: '#0f766e' }, mt: 1.25 }}>
              <ExternalLink style={{ width: 12, height: 12 }}/>{linkText ?? 'Ver en DGII'}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// ─── DgiiScreenshot — muestra captura del portal DGII ────────────────────────

function DgiiScreenshot({
  src, alt, caption, mode = 'popover', label = 'Ver pantalla del portal DGII',
}: {
  src: string;
  alt: string;
  caption?: string;
  mode?: 'popover' | 'inline';
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (mode === 'inline') {
    return (
      <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', bgcolor: '#fff' }}>
        <Box sx={{ px: 1.5, py: 1, bgcolor: '#f9fafb', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ImageIcon style={{ width: 14, height: 14, color: '#9ca3af' }} />
          <Typography sx={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Así se ve en el portal DGII</Typography>
        </Box>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} style={{ width: '100%', height: 'auto' }} />
        {caption && <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', px: 2, py: 1.5, borderTop: '1px solid #f3f4f6', bgcolor: 'rgba(249,250,251,0.6)' }}>{caption}</Typography>}
      </Box>
    );
  }

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen(true)}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.75rem', fontWeight: 600, color: '#0d9488', cursor: 'pointer', background: 'none', border: 'none', '&:hover': { color: '#0f766e', textDecoration: 'underline' }, textUnderlineOffset: '2px' }}
      >
        <ImageIcon style={{ width: 14, height: 14 }}/>
        {label}
      </Box>

      {open && (
        <Box
          sx={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}
        >
          <Box
            sx={{ bgcolor: '#fff', borderRadius: '16px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', maxWidth: '48rem', width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.5, borderBottom: '1px solid #e5e7eb' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ height: 28, width: 28, borderRadius: '8px', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ImageIcon style={{ width: 16, height: 16, color: '#0d9488' }} />
                </Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Portal DGII</Typography>
              </Box>
              <IconButton
                onClick={() => setOpen(false)}
                size="small"
                sx={{ borderRadius: '50%', color: '#9ca3af', '&:hover': { bgcolor: '#f3f4f6', color: '#4b5563' } }}
              >
                <X style={{ width: 16, height: 16 }}/>
              </IconButton>
            </Box>
            <Box sx={{ overflowY: 'auto' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={alt} style={{ width: '100%', height: 'auto' }} />
              {caption && (
                <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', px: 2.5, py: 2, borderTop: '1px solid #f3f4f6', lineHeight: 1.6 }}>
                  {caption}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </>
  );
}

// ─── WaitForDgii — estado de espera simulado para validaciones DGII ─────────

function WaitForDgii({
  title,
  description,
  estimated,
  onComplete,
  simulateSeconds = 8,
  successTitle = '¡Validación completada!',
  successDescription = 'DGII aprobó tu solicitud. Puedes continuar con la siguiente fase.',
  allowSkip = true,
}: {
  title: string;
  description: string;
  estimated: string;
  onComplete: () => void;
  simulateSeconds?: number;
  successTitle?: string;
  successDescription?: string;
  allowSkip?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const stepMs = 120;
    const totalMs = simulateSeconds * 1000;
    const delta = (stepMs / totalMs) * 100;
    const interval = setInterval(() => {
      setProgress(p => {
        const next = p + delta;
        if (next >= 100) {
          clearInterval(interval);
          setDone(true);
          return 100;
        }
        return next;
      });
    }, stepMs);
    return () => clearInterval(interval);
  }, [simulateSeconds]);

  if (done) {
    return (
      <Box sx={{ borderRadius: '16px', border: '1px solid #99f6e4', bgcolor: 'rgba(240,253,250,0.6)', p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box sx={{ height: 44, width: 44, borderRadius: '50%', bgcolor: '#ccfbf1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckCircle style={{ width: 20, height: 20, color: '#0d9488' }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.primary' }}>{successTitle}</Typography>
            <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 0.5, lineHeight: 1.6 }}>{successDescription}</Typography>
          </Box>
        </Box>
        <Button onClick={onComplete} variant="contained" disableElevation sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, width: '100%', gap: 1 }}>
          Continuar <ChevronRight style={{ width: 16, height: 16 }}/>
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ borderRadius: '16px', border: '1px solid #bfdbfe', bgcolor: 'rgba(239,246,255,0.5)', p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ height: 44, width: 44, borderRadius: '50%', bgcolor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite', color: '#2563eb' }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.primary' }}>{title}</Typography>
          <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 0.5, lineHeight: 1.6 }}>{description}</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
          <Typography component="span" sx={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.75rem' }}>
            <RefreshCw style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }}/>
            Consultando estado en portal DGII…
          </Typography>
          <Typography component="span" sx={{ color: '#6b7280', fontFamily: 'monospace', fontSize: '0.75rem' }}>{Math.floor(progress)}%</Typography>
        </Box>
        <LinearProgress variant="determinate" value={progress} sx={{ height: 6, borderRadius: '9999px', bgcolor: '#dbeafe', '& .MuiLinearProgress-bar': { bgcolor: '#3b82f6' } }} />
      </Box>

      <Box sx={{ borderRadius: '12px', bgcolor: '#fff', border: '1px solid #dbeafe', p: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Mail style={{ width: 16, height: 16, flexShrink: 0, marginTop: '2px', color: '#3b82f6' }} />
        <Box>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Clock style={{ width: 12, height: 12 }}/>
            Plazo típico: {estimated}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.5, lineHeight: 1.6 }}>
            Puedes cerrar EmiteDo — te avisaremos por correo y WhatsApp cuando DGII responda.
            El wizard te llevará automáticamente a la siguiente fase.
          </Typography>
        </Box>
      </Box>

      {allowSkip && (
        <Box
          component="button"
          onClick={() => { setProgress(100); setDone(true); }}
          sx={{ fontSize: '0.75rem', color: '#9ca3af', textDecoration: 'underline', textUnderlineOffset: '2px', cursor: 'pointer', background: 'none', border: 'none', '&:hover': { color: '#4b5563' } }}
        >
          [Demo] Saltar espera
        </Box>
      )}
    </Box>
  );
}

// ─── EtapasHero — overview colapsable de las 3 etapas DGII ───────────────────

function EtapasHero() {
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ borderRadius: '16px', border: '1px solid #e5e7eb', bgcolor: '#fff', overflow: 'hidden' }}>
      <Box
        component="button"
        onClick={() => setOpen(v => !v)}
        sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.5, cursor: 'pointer', background: 'none', border: 'none', '&:hover': { bgcolor: '#f9fafb' }, transition: 'background-color 0.15s' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ height: 28, width: 28, borderRadius: '8px', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ImageIcon style={{ width: 16, height: 16, color: '#0d9488' }} />
          </Box>
          <Box sx={{ textAlign: 'left' }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Las 3 etapas oficiales de la DGII</Typography>
            <Typography sx={{ fontSize: '11px', color: '#9ca3af' }}>Solicitud → Set de Pruebas → Certificación</Typography>
          </Box>
        </Box>
        <ChevronRight style={{ width: 16, height: 16, color: '#9ca3af', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </Box>
      {open && (
        <Box sx={{ borderTop: '1px solid #f3f4f6', p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f9fafb' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dgii-guia/3-etapas-overview.png"
            alt="Diagrama de las 3 etapas: Solicitud, Set de Pruebas, Certificación"
            style={{ maxWidth: '100%', height: 'auto' }}
          />
        </Box>
      )}
    </Box>
  );
}

// ─── StatusPill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: EcfSendStatus }) {
  if (status === 'idle') return null;
  const map: Partial<Record<EcfSendStatus, { bgcolor: string; color: string; label: string }>> = {
    sending:     { bgcolor: '#dbeafe', color: '#1d4ed8', label: 'Enviando…' },
    aceptado:    { bgcolor: '#ccfbf1', color: '#0f766e', label: 'Aceptado' },
    rechazado:   { bgcolor: '#fee2e2', color: '#b91c1c', label: 'Rechazado' },
    condicional: { bgcolor: '#fef3c7', color: '#92400e', label: 'Acep. condicional' },
    proceso:     { bgcolor: '#f3f4f6', color: '#4b5563', label: 'En proceso' },
  };
  const c = map[status];
  if (!c) return null;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: '9999px', fontSize: '10px', fontWeight: 600, bgcolor: c.bgcolor, color: c.color }}>
      {status === 'sending'  && <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }}/>}
      {status === 'aceptado' && <Check   style={{ width: 10, height: 10 }}/>}
      {c.label}
    </Box>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ phase, completed, onJump }: { phase: number; completed: Set<number>; onJump: (p: number) => void }) {
  const maxReached = Math.max(phase, ...Array.from(completed), 0);
  return (
    <Box component="nav" sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', width: 224, flexShrink: 0, pt: 1, userSelect: 'none' }}>
      {PHASES.map((p, i) => {
        const isDone    = completed.has(p.id);
        const isCurrent = p.id === phase;
        const isLocked  = p.id > maxReached;
        return (
          <Box key={p.id} sx={{ position: 'relative' }}>
            {i < PHASES.length - 1 && (
              <Box sx={{ position: 'absolute', left: 15, top: 32, width: 2, height: 'calc(100% - 4px)', bgcolor: isDone ? '#2dd4bf' : '#e5e7eb' }} />
            )}
            <Box
              component="button"
              onClick={() => !isLocked && onJump(p.id)}
              disabled={isLocked}
              sx={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 1, py: 1, borderRadius: '12px', textAlign: 'left', cursor: isLocked ? 'not-allowed' : 'pointer', background: 'none', border: 'none', mb: 0.5, opacity: isLocked ? 0.4 : 1, bgcolor: isCurrent ? '#f0fdfa' : 'transparent', '&:hover': !isLocked ? { bgcolor: isCurrent ? '#f0fdfa' : '#f9fafb' } : {}, transition: 'background-color 0.15s' }}
            >
              <Box sx={{ height: 30, width: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '2px solid', mt: 0.25, transition: 'all 0.15s', borderColor: isDone ? '#0d9488' : isCurrent ? '#0d9488' : '#e5e7eb', bgcolor: isDone ? '#0d9488' : '#fff', color: isDone ? '#fff' : isCurrent ? '#0d9488' : '#9ca3af' }}>
                {isDone ? <Check style={{ width: 14, height: 14 }}/> : <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{p.id + 1}</Typography>}
              </Box>
              <Box sx={{ pt: 0.25, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isCurrent ? 'text.primary' : isDone ? '#0f766e' : '#9ca3af' }}>
                  {p.label}
                </Typography>
                {isCurrent && (
                  <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    {p.sub.map(s => (
                      <Typography key={s} sx={{ fontSize: '0.75rem', color: '#0d9488', lineHeight: 1.4 }}>· {s}</Typography>
                    ))}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Pre-requisito: Empresa + Certificado ────────────────────────────────────

function PhaseEmpresa({ onComplete }: { onComplete: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [perfil,       setPerfil]       = useState<Perfil>({});
  const [razonSocial,  setRazonSocial]  = useState('');
  const [emailFact,    setEmailFact]    = useState('');
  const [direccion,    setDireccion]    = useState('');
  const [provincia,    setProvincia]    = useState('');
  const [municipio,    setMunicipio]    = useState('');
  const [savingPerfil, setSavingPerfil] = useState(false);
  const [perfilSaved,  setPerfilSaved]  = useState(false);

  const [certInfo,      setCertInfo]      = useState<CertInfo | null>(null);
  const [file,          setFile]          = useState<File | null>(null);
  const [password,      setPassword]      = useState('');
  const [showPass,      setShowPass]      = useState(false);
  const [dragging,      setDragging]      = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certError,     setCertError]     = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [errors,  setErrors]  = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch('/api/equipo/perfil').then(r => r.json()),
      fetch('/api/equipo/certificado').then(r => r.json()),
    ]).then(([p, c]) => {
      setPerfil(p); setRazonSocial(p.razonSocial ?? '');
      setEmailFact(p.emailFacturacion ?? ''); setDireccion(p.direccion ?? '');
      setProvincia(p.provincia ?? ''); setMunicipio(p.municipio ?? '');
      setCertInfo(c);
    }).finally(() => setLoading(false));
  }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (!razonSocial.trim()) e.razonSocial = 'Requerido';
    if (!emailFact.trim())   e.email       = 'Requerido';
    if (!direccion.trim())   e.direccion   = 'Requerido';
    if (!provincia.trim())   e.provincia   = 'Requerido';
    if (!municipio.trim())   e.municipio   = 'Requerido';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSavePerfil() {
    if (!validate()) return false;
    setSavingPerfil(true);
    try {
      const res = await fetch('/api/equipo/perfil', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...perfil, razonSocial, emailFacturacion: emailFact, direccion, provincia, municipio }),
      });
      if (res.ok) { setPerfilSaved(true); return true; }
      return false;
    } finally { setSavingPerfil(false); }
  }

  function handleFile(f: File) {
    if (!f.name.match(/\.(p12|pfx)$/i)) { setCertError('Debe ser .p12 o .pfx'); return; }
    if (f.size > 1_500_000)              { setCertError('Máximo 1.5 MB'); return; }
    setFile(f); setCertError(null);
  }

  async function handleUploadCert() {
    if (!file || !password) return;
    setUploadingCert(true); setCertError(null);
    try {
      const buf    = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res    = await fetch('/api/equipo/certificado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certP12: base64, certPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) { setCertError(data.error ?? 'Error al guardar'); return; }
      setCertInfo(data); setFile(null); setPassword('');
    } catch { setCertError('Error de conexión'); }
    finally { setUploadingCert(false); }
  }

  const perfilCompleto = !!(razonSocial.trim() && emailFact.trim() && direccion.trim() && provincia.trim() && municipio.trim());
  const certListo      = !!(certInfo?.tieneCertificado && !certInfo.errorLectura);
  const canContinue    = perfilCompleto && certListo;

  if (loading) return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 288 }}>
      <CircularProgress sx={{ color: '#14b8a6' }} />
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>

        {/* Datos empresa */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Datos fiscales</Typography>
          <Box sx={{ borderRadius: '16px', border: '1px solid #e5e7eb', p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: '0.75rem', mb: 0.75, display: 'block', color: '#9ca3af' }}>RNC</Typography>
              <TextField value={perfil.rnc ?? ''} disabled size="small" fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#f9fafb' }, '& .MuiInputBase-input': { color: '#6b7280', fontSize: '0.875rem' } }} />
              <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.5 }}>
                Para cambiar el RNC ve a{' '}
                <Link href="/dashboard/configuracion" style={{ color: '#0d9488' }}>Configuración</Link>
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.75rem', mb: 0.75, display: 'block' }}>Razón social <Typography component="span" sx={{ color: 'error.main' }}>*</Typography></Typography>
              <TextField value={razonSocial}
                onChange={e => { setRazonSocial(e.target.value); setErrors(v => ({...v, razonSocial:''})); }}
                placeholder="Mi Empresa SRL"
                size="small" fullWidth
                error={!!errors.razonSocial}
                helperText={errors.razonSocial}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.75rem', mb: 0.75, display: 'block' }}>Correo de facturación <Typography component="span" sx={{ color: 'error.main' }}>*</Typography></Typography>
              <TextField type="email" value={emailFact}
                onChange={e => { setEmailFact(e.target.value); setErrors(v => ({...v, email:''})); }}
                placeholder="facturacion@empresa.com"
                size="small" fullWidth
                error={!!errors.email}
                helperText={errors.email}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.75rem', mb: 0.75, display: 'block' }}>Calle y número <Typography component="span" sx={{ color: 'error.main' }}>*</Typography></Typography>
              <TextField value={direccion}
                onChange={e => { setDireccion(e.target.value); setErrors(v => ({...v, direccion:''})); }}
                placeholder="Ej: Calle El Conde #45, Apto 2B"
                size="small" fullWidth
                error={!!errors.direccion}
                helperText={errors.direccion}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Box>
            <ProvinciaMunicipioSelect
              provincia={provincia}
              municipio={municipio}
              onProvinciaChange={v => { setProvincia(v); setErrors(e => ({...e, provincia:'', municipio:''})); }}
              onMunicipioChange={v => { setMunicipio(v); setErrors(e => ({...e, municipio:''})); }}
              required
              errors={errors}
            />
          </Box>
        </Box>

        {/* Certificado */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Certificado digital P12</Typography>
          <Box sx={{ borderRadius: '16px', border: '1px solid #e5e7eb', p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280' }}>
              Emitido por INDOTEL a través de Viafirma, Cámara de Comercio RD o DigiCert.
            </Typography>

            {certListo ? (
              <Box sx={{ borderRadius: '12px', border: '1px solid #99f6e4', bgcolor: '#f0fdfa', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircle style={{ width: 16, height: 16, flexShrink: 0, color: '#14b8a6' }} />
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#134e4a' }}>Certificado activo</Typography>
                </Box>
                {certInfo?.titular && <Typography sx={{ fontSize: '0.75rem', color: '#0f766e' }}>{certInfo.titular}</Typography>}
                {certInfo?.vencimiento && (
                  <Typography sx={{ fontSize: '0.75rem', color: '#0d9488' }}>Vence: {certInfo.vencimiento}</Typography>
                )}
                <Box component="button" sx={{ fontSize: '0.75rem', color: '#0d9488', textDecoration: 'underline', textUnderlineOffset: '2px', cursor: 'pointer', background: 'none', border: 'none', p: 0, textAlign: 'left' }}
                  onClick={() => setCertInfo({ tieneCertificado: false })}>
                  Reemplazar certificado
                </Box>
              </Box>
            ) : (
              <>
                {!file ? (
                  <Box
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                    onClick={() => fileInputRef.current?.click()}
                    sx={{ borderRadius: '12px', border: `2px dashed ${dragging ? '#2dd4bf' : '#e5e7eb'}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 4, px: 2, textAlign: 'center', bgcolor: dragging ? '#f0fdfa' : 'transparent', '&:hover': { borderColor: '#5eead4', bgcolor: '#f9fafb' }, transition: 'all 0.15s' }}
                  >
                    <CloudUpload style={{ width: 32, height: 32, color: dragging ? '#14b8a6' : '#9ca3af' }} />
                    <Box>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Arrastra tu certificado aquí</Typography>
                      <Box component="button" type="button" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        sx={{ fontSize: '0.75rem', color: '#0d9488', cursor: 'pointer', background: 'none', border: 'none', mt: 0.25, '&:hover': { textDecoration: 'underline' } }}>
                        o selecciona el archivo .p12 / .pfx
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#f9fafb', px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <FileKey style={{ width: 16, height: 16, flexShrink: 0, color: '#0d9488' }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{fmtSize(file.size)}</Typography>
                    </Box>
                    <IconButton onClick={() => { setFile(null); setCertError(null); }} size="small" sx={{ borderRadius: '50%', color: '#9ca3af', '&:hover': { bgcolor: '#e5e7eb', color: '#4b5563' } }}>
                      <X style={{ width: 14, height: 14 }}/>
                    </IconButton>
                  </Box>
                )}

                <input ref={fileInputRef} type="file" accept=".p12,.pfx" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

                <Box>
                  <Typography sx={{ fontSize: '0.75rem', mb: 0.75, display: 'block' }}>Clave del certificado <Typography component="span" sx={{ color: 'error.main' }}>*</Typography></Typography>
                  <TextField
                    type={showPass ? 'text' : 'password'}
                    placeholder="Contraseña"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setCertError(null); }}
                    size="small" fullWidth
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                    slotProps={{ input: { endAdornment: (
                        <InputAdornment position="end">
                          <IconButton type="button" onClick={() => setShowPass(v => !v)} edge="end" size="small" sx={{ color: '#9ca3af', '&:hover': { color: '#4b5563' } }}>
                            {showPass ? <EyeOff style={{ width: 16, height: 16 }}/> : <Eye style={{ width: 16, height: 16 }}/>}
                          </IconButton>
                        </InputAdornment>
                      ) } as object }}
                  />
                </Box>

                {certError && (
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1.5 }}>
                    <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, marginTop: '1px', color: '#ef4444' }} />
                    <Typography sx={{ fontSize: '0.75rem', color: '#b91c1c' }}>{certError}</Typography>
                  </Box>
                )}

                <Button onClick={handleUploadCert} disabled={!file || !password || uploadingCert}
                  variant="contained" disableElevation size="small"
                  sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, '&:disabled': { opacity: 0.4 }, width: '100%' }}>
                  {uploadingCert
                    ? <><CircularProgress size={14} sx={{ color: 'inherit', mr: 1 }} />Guardando…</>
                    : <><KeyRound style={{ width: 14, height: 14, marginRight: 8 }} />Guardar certificado</>}
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Box>

      <NavFooter
        onNext={async () => { if (!perfilSaved) await handleSavePerfil(); onComplete(); }}
        nextDisabled={!canContinue}
        nextLoading={savingPerfil}
        nextLabel="Guardar y continuar"
      />
      {!canContinue && (
        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'right', mt: -1 }}>
          {!perfilCompleto && '• Completa los datos de tu empresa '}
          {!certListo && '• Sube tu certificado P12'}
        </Typography>
      )}
    </Box>
  );
}

// ─── Phase 0: Postulación DGII ───────────────────────────────────────────────

function PhasePostulacion({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const xmlInputRef = useRef<HTMLInputElement>(null);

  const [webhookBaseUrl,  setWebhookBaseUrl]  = useState('');
  const [sub,             setSub]             = useState(0);
  const [xmlFile,         setXmlFile]         = useState<File | null>(null);
  const [signing,         setSigning]         = useState(false);
  const [signed,          setSigned]          = useState(false);
  const [downloaded,      setDownloaded]      = useState(false);
  const [uploadConfirmed, setUploadConfirmed] = useState(false);
  const [signError,       setSignError]       = useState<string | null>(null);

  // XML firmado (base64) devuelto por el backend — se usa para descargar
  const [xmlFirmado,     setXmlFirmado]     = useState<{ base64: string; name: string } | null>(null);

  useEffect(() => {
    fetch('/api/ecf/urls-dgii').then(r => r.json()).then(d => setWebhookBaseUrl(d.webhookBaseUrl ?? ''));
    // Cargar estado persistido
    import('@/lib/habilitacion/client').then(({ cargarEstado }) => {
      cargarEstado().then(({ state }) => {
        if (state.postulacion?.uploadConfirmed) setUploadConfirmed(true);
        if (state.postulacion?.xmlFirmadoDataUrl) {
          setXmlFirmado({
            base64: state.postulacion.xmlFirmadoDataUrl,
            name:   state.postulacion.xmlFirmadoName ?? 'postulacion-firmada.xml',
          });
          setSigned(true);
          setDownloaded(true);
        }
      }).catch(() => { /* silent */ });
    });
  }, []);

  const urls = {
    recepcion:    webhookBaseUrl || 'Cargando…',
    aprobacion:   webhookBaseUrl || 'Cargando…',
    autenticacion:webhookBaseUrl || 'Cargando…',
  };

  async function handleFirmar() {
    if (!xmlFile) return;
    setSignError(null);
    setSigning(true);
    try {
      const { firmarXml, guardarEstado } = await import('@/lib/habilitacion/client');
      const result = await firmarXml({ xmlFile, proposito: 'postulacion' });
      setXmlFirmado({ base64: result.xmlFirmadoBase64, name: result.xmlFirmadoNombre });
      setSigned(true);
      await guardarEstado({
        postulacion: {
          xmlFirmadoDataUrl: result.xmlFirmadoBase64,
          xmlFirmadoName:    result.xmlFirmadoNombre,
        },
      });
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Error firmando el XML');
    } finally {
      setSigning(false);
    }
  }

  async function handleDescargar() {
    if (!xmlFirmado) return;
    const { descargarBase64, guardarEstado } = await import('@/lib/habilitacion/client');
    descargarBase64(xmlFirmado.base64, xmlFirmado.name);
    setDownloaded(true);
    await guardarEstado({ postulacion: { xmlFirmadoDataUrl: xmlFirmado.base64, xmlFirmadoName: xmlFirmado.name } });
  }

  async function handleConfirmarSubida(v: boolean) {
    setUploadConfirmed(v);
    const { guardarEstado } = await import('@/lib/habilitacion/client');
    await guardarEstado({ postulacion: { uploadConfirmed: v } });
  }

  const STEPS = ['Datos del portal', 'Firma digital', 'Envío al portal', 'Validación DGII'];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* Stepper */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {STEPS.map((label, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <Box sx={{ height: 28, width: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, border: '2px solid', transition: 'all 0.15s', borderColor: i < sub ? '#0d9488' : i === sub ? '#0d9488' : '#e5e7eb', bgcolor: i < sub ? '#0d9488' : '#fff', color: i < sub ? '#fff' : i === sub ? '#0d9488' : '#9ca3af' }}>
                {i < sub ? <Check style={{ width: 12, height: 12 }}/> : i + 1}
              </Box>
              <Typography component="span" sx={{ fontSize: '10px', fontWeight: 500, whiteSpace: 'nowrap', color: i === sub ? '#0f766e' : i < sub ? '#14b8a6' : '#9ca3af' }}>
                {label.replace(/^\d+\.\s/, '')}
              </Typography>
            </Box>
            {i < STEPS.length - 1 && (
              <Box sx={{ flex: 1, height: 2, mb: 2, mx: 1, borderRadius: '9999px', bgcolor: i < sub ? '#2dd4bf' : '#e5e7eb', transition: 'background-color 0.15s' }} />
            )}
          </Box>
        ))}
      </Box>

      {/* ── Sub 0: Datos del portal ── */}
      {sub === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

          {/* 1 — CTA principal: abrir portal */}
          <Box sx={{ borderRadius: '12px', border: '1px solid #99f6e4', bgcolor: '#f0fdfa', px: 2.5, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#134e4a' }}>Abre el portal DGII y crea tu postulación</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#0f766e', mt: 0.25 }}>
                Sección <strong>Emisor Electrónico → CREAR POSTULACIÓN</strong>.
                Copia los datos de abajo y haz clic en <strong>"Generar archivo"</strong>.
              </Typography>
            </Box>
            <Box component="a" href="https://ecf.dgii.gov.do/testecf/contribuyentes" target="_blank" rel="noopener noreferrer"
              sx={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 2, py: 1, borderRadius: '8px', bgcolor: '#0d9488', color: '#fff', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none', '&:hover': { bgcolor: '#0f766e' }, transition: 'background-color 0.15s' }}>
              Abrir portal <ExternalLink style={{ width: 14, height: 14 }}/>
            </Box>
          </Box>

          {/* 2 — Formulario estilo portal DGII */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Software */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>⚙️ Datos del software de facturación.</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.25 }}>Los campos se ven iguales en el sitio de la DGII:</Typography>
                </Box>
                <DgiiScreenshot
                  src="/dgii-guia/paso1-datos-software.png"
                  alt="Formulario de datos del software en el portal DGII"
                  caption="Pega los tres URLs (recepción, aprobación comercial, autenticación) exactamente como aparecen abajo."
                  label="Ver dónde pegar"
                />
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                <DgiiField label="Tipo de software"            value={EMITEDO.tipoSoftware}  required={false} />
                <DgiiField label="Nombre del software"         value={EMITEDO.nombreSoftware} />
                <DgiiField label="Versión del software"        value={EMITEDO.version} />
                <DgiiField label="URL de recepción"            value={urls.recepcion}     span="full" isUrl />
                <DgiiField label="URL de aprobación comercial" value={urls.aprobacion}    span="full" isUrl />
                <DgiiField label="URL de autenticación"        value={urls.autenticacion} span="full" isUrl />
              </Box>
            </Box>

            {/* Proveedor */}
            <Box>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>👤 Datos del proveedor electrónico.</Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                <DgiiField label="RNC / Cédula"   value={EMITEDO.rncProveedor} />
                <DgiiField label="Razón social"    value={EMITEDO.nombreProveedor} span="2" />
                <DgiiField label="Nombre comercial" value={EMITEDO.nombreSoftware} span="full" required={false} />
              </Box>
            </Box>

          </Box>


          <NavFooter onBack={onBack} onNext={() => setSub(1)} nextLabel="Ya generé el XML" />
        </Box>
      )}

      {/* ── Sub 1: Firma XML ── */}
      {sub === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <InfoBox color="blue" title="Carga el Formulario de Postulación">
            En el portal DGII hiciste clic en <strong>"Generar archivo"</strong> y descargaste
            el Formulario de Postulación. Cárgalo aquí — EmiteDo le aplica la Firma Digital automáticamente.
          </InfoBox>

          {/* Paso 1: Cargar Formulario de Postulación */}
          <Box sx={{ borderRadius: '12px', border: `1px solid ${xmlFile ? '#99f6e4' : '#e5e7eb'}`, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, transition: 'all 0.15s' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ height: 24, width: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, bgcolor: xmlFile ? '#0d9488' : '#e5e7eb', color: xmlFile ? '#fff' : '#4b5563' }}>
                {xmlFile ? <Check style={{ width: 14, height: 14 }}/> : '1'}
              </Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Cargar el Formulario de Postulación</Typography>
            </Box>

            {!xmlFile ? (
              <Box
                onClick={() => xmlInputRef.current?.click()}
                sx={{ borderRadius: '12px', border: '2px dashed #e5e7eb', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 3.5, px: 2, textAlign: 'center', '&:hover': { borderColor: '#5eead4', bgcolor: '#f9fafb' }, transition: 'all 0.15s' }}
              >
                <Upload style={{ width: 28, height: 28, color: '#9ca3af' }} />
                <Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Formulario de Postulación (.xml)</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25 }}>El archivo que descargaste del portal DGII · Máx. 2 MB</Typography>
                </Box>
              </Box>
            ) : (
              <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#f9fafb', px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <FileText style={{ width: 16, height: 16, flexShrink: 0, color: '#0d9488' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{xmlFile.name}</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{fmtSize(xmlFile.size)}</Typography>
                </Box>
                {!signed && (
                  <IconButton onClick={() => setXmlFile(null)} size="small" sx={{ borderRadius: '50%', color: '#9ca3af', '&:hover': { bgcolor: '#e5e7eb', color: '#4b5563' } }}>
                    <X style={{ width: 14, height: 14 }}/>
                  </IconButton>
                )}
              </Box>
            )}
            <input ref={xmlInputRef} type="file" accept=".xml" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) setXmlFile(f); e.target.value = ''; }} />
          </Box>

          {/* Paso 2: Aplicar Firma Digital */}
          <Box sx={{ borderRadius: '12px', border: `1px solid ${signed ? '#99f6e4' : !xmlFile ? '#f3f4f6' : '#e5e7eb'}`, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, opacity: !signed && !xmlFile ? 0.4 : 1, transition: 'all 0.15s' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ height: 24, width: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, bgcolor: signed ? '#0d9488' : '#e5e7eb', color: signed ? '#fff' : '#4b5563' }}>
                {signed ? <Check style={{ width: 14, height: 14 }}/> : '2'}
              </Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Aplicar Firma Digital</Typography>
            </Box>
            {!signed ? (
              <Button onClick={handleFirmar} disabled={!xmlFile || signing}
                variant="contained" disableElevation
                sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, width: '100%', gap: 1 }}>
                {signing
                  ? <><CircularProgress size={16} sx={{ color: 'inherit' }} />Aplicando Firma Digital…</>
                  : <><FileSignature style={{ width: 16, height: 16 }}/>Aplicar Firma Digital</>}
              </Button>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', p: 1.5, color: '#134e4a' }}>
                <CheckCircle style={{ width: 16, height: 16, flexShrink: 0 }}/>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Firma Digital aplicada correctamente</Typography>
              </Box>
            )}
            {signError && (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', p: 1.5, color: '#991b1b' }}>
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: '1px' }}/>
                <Typography sx={{ fontSize: '0.75rem' }}>{signError}</Typography>
              </Box>
            )}
          </Box>

          {/* Paso 3: Descargar Formulario firmado */}
          <Box sx={{ borderRadius: '12px', border: `1px solid ${downloaded ? '#99f6e4' : !signed ? '#f3f4f6' : '#e5e7eb'}`, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, opacity: !downloaded && !signed ? 0.4 : 1, transition: 'all 0.15s' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ height: 24, width: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, bgcolor: downloaded ? '#0d9488' : '#e5e7eb', color: downloaded ? '#fff' : '#4b5563' }}>
                {downloaded ? <Check style={{ width: 14, height: 14 }}/> : '3'}
              </Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Descargar Formulario firmado</Typography>
            </Box>
            <Button
              variant="outlined"
              disabled={!signed || !xmlFirmado}
              onClick={handleDescargar}
              sx={{ textTransform: 'none', borderRadius: '8px', width: '100%', gap: 1 }}
            >
              <Download style={{ width: 16, height: 16 }}/> Descargar Formulario firmado
            </Button>
          </Box>

          <NavFooter
            onBack={() => setSub(0)}
            onNext={() => setSub(2)}
            nextDisabled={!downloaded}
            nextLabel="Ya lo descargué"
          />
        </Box>
      )}

      {/* ── Sub 2: Subir al portal DGII ── */}
      {sub === 2 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <InfoBox color="amber" title="Envío de archivo de declaración jurada firmado — portal DGII">
            En tu postulación, busca la sección <strong>Envío de archivo de declaración jurada firmado</strong>.
            Haz clic en <strong>Elegir archivo</strong>, selecciona el Formulario firmado
            que descargaste y presiona <strong>ENVIAR ARCHIVO</strong>.
          </InfoBox>

          <DgiiScreenshot
            mode="inline"
            src="/dgii-guia/paso2-envio-xml-postulacion.png"
            alt="Sección Envío de archivo de declaración jurada firmado en el portal DGII"
            caption='Sección "Envío de archivo de declaración jurada firmado" del portal DGII. Selecciona el Formulario firmado y presiona ENVIAR ARCHIVO.'
          />

          <Box sx={{ borderRadius: '12px', border: '1px solid #dbeafe', bgcolor: '#eff6ff', px: 2, py: 1.5, fontSize: '0.875rem', color: '#1e40af' }}>
            <Typography sx={{ fontWeight: 500, mb: 0.25, fontSize: '0.875rem' }}>Tras enviar el archivo:</Typography>
            <Typography sx={{ color: '#1d4ed8', fontSize: '0.875rem' }}>
              DGII te responderá por <strong>Buzón de Oficina Virtual</strong> en <strong>1 a 3 días hábiles</strong>.
              Si la postulación es aprobada se habilita el Set de Pruebas; si es rechazada, DGII te indica qué corregir.
            </Typography>
          </Box>

          <FormControlLabel
            control={<Checkbox checked={uploadConfirmed} onChange={e => handleConfirmarSubida(e.target.checked)} size="small" sx={{ color: '#9ca3af', '&.Mui-checked': { color: '#0d9488' }, mt: -0.25 }} />}
            label={<Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>Realicé el Envío de archivo de declaración jurada firmado en el portal DGII</Typography>}
            sx={{ alignItems: 'flex-start', mx: 0 }}
          />

          <NavFooter
            onBack={() => setSub(1)}
            onNext={() => setSub(3)}
            nextDisabled={!uploadConfirmed}
            nextLabel="Esperar validación"
          />
        </Box>
      )}

      {/* ── Sub 3: Esperar confirmación de DGII ──
           DGII no expone un endpoint público para consultar estado de postulación.
           La respuesta llega por Buzón de Oficina Virtual (correo DGII).
           El usuario debe confirmar manualmente cuando reciba el correo. */}
      {sub === 3 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

          {/* Cabecera con icono de correo */}
          <Box sx={{ borderRadius: '16px', border: '1px solid #fde68a', background: 'linear-gradient(135deg, #fffbeb, #fff7ed)', p: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
              <Box sx={{ height: 48, width: 48, borderRadius: '50%', bgcolor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Mail style={{ width: 24, height: 24, color: '#92400e' }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: 'text.primary' }}>
                  Espera la respuesta de DGII
                </Typography>
                <Typography sx={{ fontSize: '0.875rem', color: '#374151', mt: 0.5 }}>
                  Enviaste tu Formulario de Postulación firmado al portal DGII.
                  Ahora DGII lo está validando en sus servidores.
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Cómo te responde DGII */}
          <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff', p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Clock style={{ width: 16, height: 16, color: '#9ca3af' }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Tiempo estimado: 1 a 3 días hábiles</Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>
                DGII te notificará el resultado por <strong>Buzón de Oficina Virtual</strong>.
                No cierres sesión en EmiteDO — tu progreso ya está guardado.
              </Typography>
              <Box component="ul" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.875rem', color: '#4b5563', pl: 2, listStyleType: 'disc' }}>
                <li>Si tu postulación es <strong style={{ color: '#0f766e' }}>aprobada</strong>, DGII habilita el Set de Pruebas en el Portal de Certificación.</li>
                <li>Si es <strong style={{ color: '#dc2626' }}>rechazada</strong>, DGII te indica qué datos corregir.</li>
              </Box>
            </Box>

            <Box component="a" href="https://dgii.gov.do/ofv/" target="_blank" rel="noopener noreferrer"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.75rem', fontWeight: 600, color: '#0f766e', '&:hover': { color: '#134e4a', textDecoration: 'underline' }, textUnderlineOffset: '2px' }}>
              Abrir Oficina Virtual DGII
              <ExternalLink style={{ width: 12, height: 12 }}/>
            </Box>
          </Box>

          {/* Confirmación manual */}
          <Box sx={{ borderRadius: '12px', border: '2px solid #99f6e4', bgcolor: 'rgba(240,253,250,0.5)', p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <CheckCircle style={{ width: 20, height: 20, marginTop: '2px', flexShrink: 0, color: '#0d9488' }} />
              <Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                  ¿Ya recibiste el correo de aprobación de DGII?
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', mt: 0.25 }}>
                  Solo cuando DGII confirme que tu postulación fue aprobada, puedes continuar con el Set de Pruebas.
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
              <Button
                onClick={onComplete}
                variant="contained" disableElevation
                sx={{ flex: 1, textTransform: 'none', borderRadius: '8px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, gap: 1 }}
              >
                <Check style={{ width: 16, height: 16 }}/>
                DGII ya aprobó mi postulación
              </Button>
              <Button
                variant="outlined"
                onClick={() => setSub(2)}
                sx={{ textTransform: 'none', borderRadius: '8px', borderColor: '#d1d5db', color: '#374151', '&:hover': { bgcolor: '#f9fafb' }, gap: 1 }}
              >
                <AlertCircle style={{ width: 16, height: 16 }}/>
                DGII me rechazó
              </Button>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Box component="button" onClick={() => setSub(2)}
              sx={{ fontSize: '0.875rem', color: '#6b7280', cursor: 'pointer', background: 'none', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 0.5, '&:hover': { color: '#374151' } }}>
              ← Volver
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ─── Phase 1: Pruebas e-CF ────────────────────────────────────────────────────

function PhasePruebas({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [sub,    setSub]    = useState(0);
  const [maxSub, setMaxSub] = useState(0);

  // Form
  const [nombre,     setNombre]     = useState('');
  const [precio,     setPrecio]     = useState('');
  const [tarifa,     setTarifa]     = useState('18');
  const [itemTipo,   setItemTipo]   = useState('servicio');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Progress
  const [counts,      setCounts]      = useState<Record<string, number>>({});
  const [statuses,    setStatuses]    = useState<Record<string, EcfSendStatus>>({});
  const [currentType, setCurrentType] = useState<string | null>(null);
  const [batchDone,   setBatchDone]   = useState<Set<number>>(new Set());
  const [emitError,   setEmitError]   = useState<string | null>(null);

  // Polling de validación DGII — arranca cuando termina la emisión.
  // Consulta el estado final de cada trackId contra CerteCF.
  const [polling,          setPolling]          = useState(false);
  const [pendingTrackIds,  setPendingTrackIds]  = useState<{ tipo: string; encf: string; trackId: string; documentoId?: number }[]>([]);
  const [validatedByTipo,  setValidatedByTipo]  = useState<Record<string, number>>({});

  // FC <250Mil
  const [fc250Done,        setFc250Done]        = useState(false);
  const [downloading32b,   setDownloading32b]   = useState(false);
  const [download32bError, setDownload32bError] = useState<string | null>(null);

  const [confirmed, setConfirmed] = useState(false);

  /** Descarga el XML firmado de un e-CF emitido durante las pruebas. */
  async function downloadXml(documentoId: number, encf: string) {
    try {
      const res = await fetch(`/api/ecf/xml?id=${documentoId}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${encf}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silencioso — si falla el usuario puede reintentar
    }
  }

  /** Descarga el PDF de la Factura de Consumo RFCE (<RD$250K) del Set de Pruebas. */
  async function handleDownload32b() {
    setDownloading32b(true);
    setDownload32bError(null);
    try {
      const res = await fetch('/api/habilitacion/pdf-representacion', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tipo: '32b' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'representacion-32b-rfce.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownload32bError(err instanceof Error ? err.message : 'Error descargando PDF');
    } finally {
      setDownloading32b(false);
    }
  }

  // Un tipo está listo cuando DGII aceptó todos los requeridos.
  // Todos los tipos listos → grid completo → auto-avance a Sub 2.
  const gridDone = PRUEBA_ECF_TYPES
    .filter(t => t.required !== null)
    .every(t => statuses[t.tipo] === 'aceptado');

  function goSub(i: number) { setSub(i); setMaxSub(m => Math.max(m, i)); }

  function reset() {
    setCounts({}); setStatuses({}); setCurrentType(null);
    setBatchDone(new Set()); setFc250Done(false);
    setSub(0); setMaxSub(0);
    setEmitError(null);
    setPolling(false); setPendingTrackIds([]); setValidatedByTipo({});
  }

  // Cargar estado persistido al montar
  useEffect(() => {
    import('@/lib/habilitacion/client').then(({ cargarEstado }) => {
      cargarEstado().then(({ state }) => {
        if (state.pruebas?.emitidas) {
          setCounts(state.pruebas.emitidas);
          // Reconstruir status: emitidos quedan en 'proceso' hasta que
          // el polling confirme el estado final con DGII.
          const newStatuses: Record<string, EcfSendStatus> = {};
          for (const t of PRUEBA_ECF_TYPES) {
            if (t.required === null) continue;
            const n = state.pruebas!.emitidas![t.tipo] ?? 0;
            if (n >= t.required) newStatuses[t.tipo] = 'proceso';
          }
          setStatuses(newStatuses);
        }
        // Restaurar datos del formulario de pruebas
        if (state.pruebas?.itemNombre) setNombre(state.pruebas.itemNombre);
        if (state.pruebas?.itemPrecio) setPrecio(state.pruebas.itemPrecio);
        if (state.pruebas?.itemTarifa) setTarifa(state.pruebas.itemTarifa);
        if (state.pruebas?.itemTipo)   setItemTipo(state.pruebas.itemTipo);

        if (state.pruebas?.fc250Done) setFc250Done(true);
        if (state.pruebas?.confirmed) {
          setConfirmed(true);
          // Las pruebas ya fueron confirmadas — saltar directamente a sub 3 (Confirmación)
          // para que el usuario pueda hacer clic en "Continuar" y avanzar a la fase 3.
          setSub(3);
        }

        // Si ya hay trackIds guardados y la confirmación aún no se hizo,
        // reanudar polling para refrescar los estados con DGII.
        if (state.pruebas?.trackIds && state.pruebas.trackIds.length > 0 && !state.pruebas.confirmed) {
          setSub(1);
          setPendingTrackIds(state.pruebas.trackIds);
          setPolling(true);
        }
      }).catch(() => { /* silent */ });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-avance cuando gridDone se vuelve true y no hay polling activo
  // (p. ej. RFCE aceptado sincrónicamente o todos los tipos ya validados)
  useEffect(() => {
    if (gridDone && !polling && sub === 1) {
      goSub(2);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridDone, polling]);

  // ── Polling de validación DGII ──
  // Se activa al terminar la emisión. Consulta el estado de cada trackId cada 5s.
  // Cuando todos están en estado final (Aceptado, AceptadoCondicional o Rechazado),
  // detiene el polling. Si todos aceptados → auto-avanza a Sub 2 (FC <250K).
  useEffect(() => {
    if (!polling) return;

    // Si no hay trackIds que consultar, detener el polling de inmediato.
    // Ocurre cuando startEmission reutiliza e-CF ya emitidos o todos eran RFCE síncronos.
    if (pendingTrackIds.length === 0) {
      setPolling(false);
      return;
    }

    let cancelled = false;

    async function tick() {
      try {
        const { consultarEstadosPruebas } = await import('@/lib/habilitacion/client');

        // Filtrar trackIds válidos (RFCE puede no tener trackId — respuesta síncrona DGII)
        // Usar comparación estricta en lugar de !! para no enviar strings vacíos al API
        const validItems   = pendingTrackIds.filter(p => typeof p.trackId === 'string' && p.trackId.length > 0);
        const trackIds     = validItems.map(p => p.trackId);

        // Items sin trackId (RFCE síncrono) → ya aceptados, no necesitan polling
        const syncAccepted = pendingTrackIds.filter(p => !p.trackId);

        // Si no hay nada que consultar, marcar síncronos como aceptados y avanzar
        if (trackIds.length === 0) {
          if (!cancelled) {
            const validated: Record<string, number> = {};
            for (const item of syncAccepted) {
              validated[item.tipo] = (validated[item.tipo] ?? 0) + 1;
            }
            setValidatedByTipo(validated);
            // Actualizar statuses para los tipos aceptados sincrónicamente
            if (Object.keys(validated).length > 0) {
              setStatuses(prev => {
                const next = { ...prev };
                for (const t of PRUEBA_ECF_TYPES) {
                  if (t.required === null) continue;
                  const v = validated[t.tipo] ?? 0;
                  if (v >= t.required) next[t.tipo] = 'aceptado';
                }
                return next;
              });
            }
            setPolling(false);
          }
          return;
        }

        const results  = await consultarEstadosPruebas(trackIds);

        if (cancelled) return;

        // Agrupar resultados por tipo del wizard
        const validated: Record<string, number> = {};
        const rejected:  Record<string, number> = {};
        let   allFinal  = true;
        let   anyReject = false;
        const mensajesRechazo: string[] = [];

        // Contar RFCE síncronos (sin trackId) como aceptados directamente
        for (const item of syncAccepted) {
          validated[item.tipo] = (validated[item.tipo] ?? 0) + 1;
        }

        for (const r of results) {
          const match = validItems.find(p => p.trackId === r.trackId);
          if (!match) continue;
          if (r.estadoInterno === 'ACEPTADO' || r.estadoInterno === 'ACEPTADO_CONDICIONAL') {
            validated[match.tipo] = (validated[match.tipo] ?? 0) + 1;
          } else if (r.estadoInterno === 'RECHAZADO') {
            rejected[match.tipo] = (rejected[match.tipo] ?? 0) + 1;
            anyReject = true;
            const desc = r.mensajes?.[0]?.descripcion ?? 'Rechazado por DGII';
            mensajesRechazo.push(`${match.tipo} (${match.encf}): ${desc}`);
          } else {
            allFinal = false;
          }
        }

        setValidatedByTipo(validated);

        // Actualizar status por tipo basado en las validaciones
        setStatuses(() => {
          const next: Record<string, EcfSendStatus> = {};
          for (const t of PRUEBA_ECF_TYPES) {
            if (t.required === null) continue;
            const v = validated[t.tipo] ?? 0;
            const r = rejected[t.tipo]  ?? 0;
            if (r > 0)              next[t.tipo] = 'rechazado';
            else if (v >= t.required) next[t.tipo] = 'aceptado';
            else                    next[t.tipo] = 'proceso';
          }
          return next;
        });

        // Si todos en estado final → detener polling
        if (allFinal) {
          setPolling(false);
          if (anyReject) {
            setEmitError(
              'DGII rechazó algunos comprobantes:\n' + mensajesRechazo.join('\n'),
            );
          } else {
            // Todos aceptados → auto-avanzar a Sub 2 (FC <250K)
            goSub(2);
          }
        }
      } catch (err) {
        // Silencioso — reintentamos en el siguiente tick
        console.error('[habilitacion/polling] error:', err);
      }
    }

    // Primer tick inmediato + luego cada 5s
    tick();
    const interval = setInterval(tick, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [polling, pendingTrackIds]);

  function validateForm() {
    const e: Record<string, string> = {};
    if (!nombre.trim()) e.nombre = 'Requerido';
    if (!precio.trim() || isNaN(parseFloat(precio)) || parseFloat(precio) <= 0)
      e.precio = 'Ingresa un precio válido';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }

  // Mapea el tipo del wizard al tipoEcf real de la DGII
  function mapTipoReal(uiTipo: string): string {
    if (uiTipo === '32g' || uiTipo === '32r' || uiTipo === '32b') return '32';
    return uiTipo;
  }

  async function startEmission() {
    if (!validateForm()) return;
    goSub(1);
    setEmitError(null);

    const precioBase = parseFloat(precio);
    const tarifaDec  = (parseFloat(tarifa) / 100) as 0 | 0.16 | 0.18;
    const itemTipoCode = (itemTipo === 'bien' ? 1 : 2) as 1 | 2;

    const { emitirEcfPrueba, buildEncfPruebaRandom, guardarEstado } = await import('@/lib/habilitacion/client');

    // Persistir datos del formulario para restaurarlos al recargar la página
    guardarEstado({
      pruebas: { itemNombre: nombre, itemPrecio: precio, itemTarifa: tarifa, itemTipo },
    }).catch(() => {});

    const counterLocal: Record<string, number> = { ...counts };
    const trackIdsLocal: { tipo: string; encf: string; trackId: string; documentoId?: number }[] = [];

    for (const batchInfo of PRUEBA_BATCHES) {
      const types = PRUEBA_ECF_TYPES.filter(t => t.batch === batchInfo.id && t.required !== null);
      for (const t of types) {
        // Si ya está completo, saltar
        if ((counterLocal[t.tipo] ?? 0) >= t.required!) {
          setStatuses(s => ({ ...s, [t.tipo]: 'aceptado' }));
          continue;
        }

        setCurrentType(t.tipo);
        setStatuses(s => ({ ...s, [t.tipo]: 'sending' }));

        const realTipo = mapTipoReal(t.tipo);
        // 32g requiere monto ≥ RD$250K; 32r/32b → < RD$250K (va por RFCE)
        const realPrecio = t.tipo === '32g'
          ? Math.max(precioBase, 260000)
          : (t.tipo === '32r' || t.tipo === '32b')
            ? Math.min(precioBase, 100000)
            : precioBase;
        // rncComprador obligatorio: tipos B2B + compras + gubernamental + 32≥250K + exportaciones
        const requiereRnc = ['31','33','34','41','44','45','46'].includes(realTipo) || t.tipo === '32g';
        // razonSocialComprador obligatorio también para exportaciones (tipo 46)
        const requiereRazonSocial = requiereRnc || realTipo === '46';

        // Tipos 33 (nota débito) y 34 (nota crédito) requieren referenciar un e-CF
        // tipo 31 real ya enviado a la DGII.  Buscamos el NCF primero en la emisión
        // actual (trackIdsLocal) y, si el tipo 31 fue emitido en una sesión anterior,
        // en los trackIds ya persistidos que se cargaron en pendingTrackIds al montar.
        const esNota        = realTipo === '33' || realTipo === '34';
        const ncfReferencia = esNota
          ? (trackIdsLocal.find(e => e.tipo === '31')?.encf ??
             pendingTrackIds.find(e => e.tipo === '31')?.encf)
          : undefined;

        // Guardia: si no encontramos un tipo 31 previo, las notas fallarán en DGII.
        if (esNota && !ncfReferencia) {
          setEmitError(
            `Tipo ${t.tipo} requiere un tipo 31 (Crédito Fiscal) ya emitido como referencia. ` +
            `Asegúrate de que el Batch 1 (tipo 31) fue aceptado antes de emitir notas.`,
          );
          setStatuses(s => ({ ...s, [t.tipo]: 'rechazado' }));
          setCurrentType(null);
          return;
        }

        // Código de modificación:
        //   '1' = Anulación     → montoTotal DEBE ser 0 (no aplica para pruebas con monto)
        //   '2' = Corrección    → montoTotal DEBE ser 0
        //   '3' = Devolución/Descuento → montoTotal > 0 ✓ (compatible con item de prueba)
        // Usamos '3' para tipos 33 y 34 ya que el item de prueba tiene monto > 0.
        const codModif   = esNota ? '3' : undefined;
        const razonModif = esNota ? 'Prueba de certificación DGII' : undefined;

        let ok = counterLocal[t.tipo] ?? 0;
        for (let i = ok + 1; i <= t.required!; i++) {
          // Hasta 3 intentos por e-CF: cada intento genera un NCF aleatorio nuevo,
          // lo que evita la colisión "código ya utilizado" sin llevar contador manual.
          const MAX_RETRIES = 3;
          let lastErr: Error | null = null;
          let succeeded = false;

          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              const encfHardcoded = buildEncfPruebaRandom(realTipo);

              // Tipos exentos de ITBIS — forzar tarifa 0
              // Tipo 41 siempre usa 18% (IndicadorFacturacion=1 fijo); si el usuario eligió 16%
              // DGII rechaza con cod=1930 porque MontoGravadoI2 no concuerda con IndicadorFacturacion=1.
              const tarifaEfectiva = (['43', '44', '46', '47'].includes(realTipo)
                ? 0
                : realTipo === '41'
                  ? 0.18
                  : tarifaDec) as 0 | 0.16 | 0.18;

              const result = await emitirEcfPrueba({
                tipoEcf: realTipo,
                encf:    encfHardcoded,
                rncComprador:         requiereRnc          ? TEST_CONTRIBUYENTE.rnc         : undefined,
                razonSocialComprador: requiereRazonSocial  ? TEST_CONTRIBUYENTE.razonSocial : undefined,
                ncfModificado:        ncfReferencia,
                codigoModificacion:   codModif,
                razonModificacion:    razonModif,
                itemNombre: nombre,
                itemPrecio: realPrecio,
                itemTarifa: tarifaEfectiva,
                // Tipo 47 (Pagos al Exterior): DGII cod=294 — solo permite IndicadorBienoServicio=2 (Servicio)
                itemTipo:   realTipo === '47' ? 2 : itemTipoCode,
              });
              trackIdsLocal.push({ tipo: t.tipo, encf: result.encf, trackId: result.trackId, documentoId: result.documentoId });
              ok = i;
              counterLocal[t.tipo] = i;
              setCounts({ ...counterLocal });
              succeeded = true;
              break; // Éxito — salir del loop de reintentos
            } catch (err) {
              lastErr = err instanceof Error ? err : new Error(String(err));
              if (attempt < MAX_RETRIES) {
                // Pausa breve antes de reintentar con un nuevo NCF aleatorio
                await new Promise(r => setTimeout(r, 600));
              }
            }
          }

          if (!succeeded) {
            const msg = lastErr?.message ?? 'Error desconocido';
            setEmitError(`Tipo ${t.tipo} (tras ${MAX_RETRIES} intentos): ${msg}`);
            setStatuses(s => ({ ...s, [t.tipo]: 'rechazado' }));
            await guardarEstado({
              pruebas: { emitidas: counterLocal, trackIds: trackIdsLocal },
            }).catch(() => {});
            setCurrentType(null);
            return;
          }
        }

        // Emisión del tipo terminada → ahora DGII debe validar.
        // Status queda en 'proceso' hasta que el polling confirme Aceptado.
        setStatuses(s => ({ ...s, [t.tipo]: 'proceso' }));
        await guardarEstado({
          pruebas: { emitidas: counterLocal, trackIds: trackIdsLocal },
        }).catch(() => {});
      }

      setBatchDone(s => { const n = new Set(s); n.add(batchInfo.id); return n; });
    }

    setCurrentType(null);

    if (trackIdsLocal.length === 0) {
      // Todos los tipos ya estaban completos en el estado — no se emitió nada nuevo.
      // Las statuses ya se marcaron 'aceptado' en el skip de arriba. Avanzar directamente.
      goSub(2);
      return;
    }

    // Todos los e-CF enviados. Arranca el polling a DGII para validar los trackIds.
    // El usuario no puede hacer nada — auto-avanzaremos cuando DGII termine.
    setPendingTrackIds(trackIdsLocal);
    setPolling(true);
  }

  const STEPS = ['Datos', 'Envío', 'FC <250K', 'Confirmación'];

  // Suppress unused warning for maxSub (reserved for future step navigation)
  void maxSub;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* ── Stepper ── */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {STEPS.map((label, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <Box sx={{ height: 28, width: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, border: '2px solid', transition: 'all 0.15s', borderColor: i < sub ? '#0d9488' : i === sub ? '#0d9488' : '#e5e7eb', bgcolor: i < sub ? '#0d9488' : '#fff', color: i < sub ? '#fff' : i === sub ? '#0d9488' : '#9ca3af' }}>
                {i < sub ? <Check style={{ width: 12, height: 12 }}/> : i + 1}
              </Box>
              <Typography component="span" sx={{ fontSize: '10px', fontWeight: 500, whiteSpace: 'nowrap', color: i === sub ? '#0f766e' : i < sub ? '#14b8a6' : '#9ca3af' }}>
                {label}
              </Typography>
            </Box>
            {i < STEPS.length - 1 && (
              <Box sx={{ flex: 1, height: 2, mb: 2, mx: 1, borderRadius: '9999px', bgcolor: i < sub ? '#2dd4bf' : '#e5e7eb', transition: 'background-color 0.15s' }} />
            )}
          </Box>
        ))}
      </Box>

      {/* ── Step 0: Configuración y tabla de comprobantes ── */}
      {sub === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <InfoBox color="blue" title="¿Cómo funciona el Set de Pruebas?">
            EmiteDo genera y envía automáticamente todos los e-CF de prueba (10 tipos + RFCE)
            con los datos que completes a continuación. Solo la factura de consumo &lt; RD$250K
            se sube manualmente al portal al final.{' '}
            <DgiiScreenshot
              src="/dgii-guia/paso4-pruebas-simulacion.png"
              alt="Pantalla de Pruebas de Simulación en el portal DGII"
              caption="El portal DGII muestra un contador por tipo de comprobante. EmiteDo replica esta misma vista en el paso de envío."
              label="Ver pantalla en el portal DGII"
            />
          </InfoBox>

          {/* ── Config compacta ── */}
          <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: 'rgba(249,250,251,0.6)', p: 2 }}>
            <Typography sx={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1.5 }}>
              Configuración del ítem de prueba
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
              <Box>
                <Typography sx={{ fontSize: '0.75rem', mb: 0.75, display: 'block' }}>
                  Descripción <Typography component="span" sx={{ color: 'error.main' }}>*</Typography>
                </Typography>
                <TextField
                  value={nombre}
                  onChange={e => { setNombre(e.target.value); setFormErrors(v => ({...v, nombre: ''})); }}
                  placeholder={itemTipo === 'servicio' ? 'Ej: Consultoría de sistemas' : 'Ej: Computadora HP'}
                  size="small" fullWidth
                  error={!!formErrors.nombre}
                  helperText={formErrors.nombre}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.875rem' } }}
                />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.75rem', mb: 0.75, display: 'block' }}>Tipo de ítem</Typography>
                <FormControl size="small" fullWidth>
                  <Select value={itemTipo} onChange={e => setItemTipo(e.target.value)} sx={{ borderRadius: '8px', fontSize: '0.875rem' }}>
                    <MenuItem value="servicio">Servicio</MenuItem>
                    <MenuItem value="bien">Producto / Bien</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.75rem', mb: 0.75, display: 'block' }}>Tarifa ITBIS</Typography>
                <FormControl size="small" fullWidth>
                  <Select value={tarifa} onChange={e => setTarifa(e.target.value)} sx={{ borderRadius: '8px', fontSize: '0.875rem' }}>
                    <MenuItem value="18">18%</MenuItem>
                    <MenuItem value="16">16%</MenuItem>
                    <MenuItem value="0">0% — Exento</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.75rem', mb: 0.75, display: 'block' }}>
                  Precio base (RD$) <Typography component="span" sx={{ color: 'error.main' }}>*</Typography>
                </Typography>
                <TextField
                  type="number" slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                  value={precio}
                  onChange={e => { setPrecio(e.target.value); setFormErrors(v => ({...v, precio: ''})); }}
                  placeholder="0.00"
                  size="small" fullWidth
                  error={!!formErrors.precio}
                  helperText={formErrors.precio}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.875rem' } }}
                />
              </Box>
            </Box>
          </Box>

          <NavFooter onBack={onBack} onNext={startEmission} nextLabel="Iniciar pruebas" />
        </Box>
      )}

      {/* ── Step 1: Envío y progreso ── */}
      {sub === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Banner mientras EMITIMOS a DGII */}
          {currentType && !polling && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.5, borderRadius: '12px', border: '1px solid #bfdbfe', bgcolor: '#eff6ff' }}>
              <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite', flexShrink: 0, color: '#3b82f6' }} />
              <Typography sx={{ fontSize: '0.875rem', color: '#1e40af' }}>
                Enviando comprobantes tipo <strong>{currentType.replace(/[grb]/g, '')}</strong>…
              </Typography>
            </Box>
          )}

          {/* Banner mientras DGII VALIDA los trackIds — polling activo */}
          {polling && (
            <Box sx={{ borderRadius: '12px', border: '1px solid #fde68a', background: 'linear-gradient(135deg, #fffbeb, #fefce8)', p: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite', flexShrink: 0, color: '#d97706' }} />
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#78350f' }}>
                  DGII está validando tus comprobantes…
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.75rem', color: '#92400e', pl: 3 }}>
                {(() => {
                  const totalValidados = Object.values(validatedByTipo).reduce((a, b) => a + b, 0);
                  const totalRequeridos = PRUEBA_ECF_TYPES
                    .filter(t => t.required !== null)
                    .reduce((a, b) => a + (b.required ?? 0), 0);
                  return `Validados ${totalValidados} de ${totalRequeridos} · esto puede tomar 1–3 minutos. No cierres esta ventana.`;
                })()}
              </Typography>
            </Box>
          )}

          {/* Banner cuando todo está aceptado (un instante antes de auto-avanzar) */}
          {gridDone && !polling && !fc250Done && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.5, borderRadius: '12px', border: '1px solid #99f6e4', bgcolor: '#f0fdfa' }}>
              <CheckCircle style={{ width: 16, height: 16, flexShrink: 0, color: '#0d9488' }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#134e4a' }}>Pruebas validadas exitosamente</Typography>
            </Box>
          )}

          {/* Banner de error / rechazo DGII */}
          {emitError && (
            <Box sx={{ borderRadius: '12px', border: '1px solid #fca5a5', bgcolor: '#fef2f2', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {/* Encabezado */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Box sx={{ mt: 0.25, flexShrink: 0, borderRadius: '50%', bgcolor: '#fee2e2', p: 0.75 }}>
                  <AlertCircle style={{ width: 16, height: 16, color: '#dc2626' }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#7f1d1d' }}>
                    {emitError.startsWith('DGII rechazó')
                      ? 'La DGII rechazó los comprobantes de prueba'
                      : 'Ocurrió un error al enviar los comprobantes'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#b91c1c', mt: 0.25, lineHeight: 1.6 }}>
                    {emitError.startsWith('DGII rechazó')
                      ? 'Uno o más comprobantes fueron rechazados por validación de esquema. Haz clic en el botón para volver al inicio y reintentar.'
                      : 'No se pudo completar el envío. Verifica tu conexión o inténtalo de nuevo.'}
                  </Typography>
                </Box>
              </Box>

              {/* Detalle técnico colapsable (opcional) */}
              <details>
                <summary style={{ fontSize: '11px', color: '#ef4444', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ChevronRight style={{ width: 12, height: 12 }}/>
                  Ver detalle del error
                </summary>
                <Box component="pre" sx={{ mt: 1, fontSize: '10px', color: '#b91c1c', bgcolor: 'rgba(254,226,226,0.6)', borderRadius: '8px', p: 1, overflow: 'auto', maxHeight: 112, whiteSpace: 'pre-wrap', wordBreak: 'break-words' }}>
                  {emitError}
                </Box>
              </details>

              {/* CTA principal */}
              <Box
                component="button"
                onClick={() => {
                  import('@/lib/habilitacion/client').then(({ guardarEstado }) => {
                    guardarEstado({ pruebas: { trackIds: [] } }).catch(() => {});
                  });
                  reset();
                }}
                sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: '8px', bgcolor: '#dc2626', color: '#fff', fontSize: '0.875rem', fontWeight: 600, px: 2, py: 1, cursor: 'pointer', border: 'none', '&:hover': { bgcolor: '#b91c1c' }, transition: 'background-color 0.15s' }}
              >
                <RefreshCw style={{ width: 14, height: 14 }}/>
                Volver al inicio y reintentar
              </Box>
            </Box>
          )}

          {/* Grid + screenshot lado a lado */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, alignItems: 'flex-start' }}>

            {/* Izquierda: contadores compactos */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography sx={{ fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Estado del Set de Pruebas
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
                {PRUEBA_ECF_TYPES.filter(t => t.batch <= 3).map(t => {
                  const count  = counts[t.tipo] ?? 0;
                  const req    = t.required!;
                  const status = statuses[t.tipo] ?? 'idle';
                  const active = status === 'sending';
                  const done   = status === 'aceptado';
                  const label  = t.tipo === '32g' ? '32 — ≥250Mil'
                               : t.tipo === '32r' ? '32 RFCE'
                               : t.tipo;
                  return (
                    <Box key={t.tipo} sx={{ borderRadius: '8px', border: `1px solid ${done ? '#99f6e4' : active ? '#bfdbfe' : '#f3f4f6'}`, px: 1.5, py: 1, bgcolor: done ? '#f0fdfa' : active ? 'rgba(239,246,255,0.6)' : '#fff', transition: 'all 0.15s' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, mb: 0.25 }}>
                        <Typography component="span" sx={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace', lineHeight: 1, color: done ? '#0d9488' : active ? '#2563eb' : '#d1d5db' }}>
                          {count}/{req}
                        </Typography>
                        {done   && <Check   style={{ width: 14, height: 14, flexShrink: 0, color: '#14b8a6' }} />}
                        {active && <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite', flexShrink: 0, color: '#3b82f6' }} />}
                      </Box>
                      <Typography sx={{ fontSize: '10px', fontWeight: 500, lineHeight: 1.25, color: done ? '#0f766e' : active ? '#1d4ed8' : '#9ca3af' }}>
                        Tipo {label}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>

            {/* Derecha: screenshot inline pequeño */}
            <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', bgcolor: '#fff', flexShrink: 0 }}>
              <Box sx={{ px: 1.5, py: 1, bgcolor: '#f9fafb', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <ImageIcon style={{ width: 12, height: 12, color: '#9ca3af' }} />
                <Typography sx={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Así se ve en el portal DGII
                </Typography>
              </Box>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/dgii-guia/paso4-pruebas-simulacion.png" alt="Estado de pruebas en el portal DGII" style={{ width: '100%', height: 'auto' }} />
              <Typography sx={{ fontSize: '10px', color: '#6b7280', px: 1.5, py: 1, borderTop: '1px solid #f3f4f6', lineHeight: 1.4 }}>
                El portal DGII muestra el mismo progreso por tipo. Puedes verificar allí en tiempo real.
              </Typography>
            </Box>
          </Box>

          {/* ── Panel de descarga de XMLs generados ── */}
          {pendingTrackIds.length > 0 && (
            <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#fff' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, borderBottom: '1px solid #f3f4f6', bgcolor: '#f9fafb', borderRadius: '12px 12px 0 0' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Download style={{ width: 14, height: 14, color: '#6b7280' }} />
                  <Typography sx={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    XMLs generados — descargar para inspección
                  </Typography>
                </Box>
                <Typography component="span" sx={{ fontSize: '10px', color: '#9ca3af' }}>{pendingTrackIds.length} archivos</Typography>
              </Box>
              <Box sx={{ '& > *': { borderBottom: '1px solid rgba(249,250,251,1)' }, '& > *:last-child': { borderBottom: 0 } }}>
                {pendingTrackIds.map(doc => (
                  <Box
                    key={doc.encf}
                    component="button"
                    onClick={() => doc.documentoId && downloadXml(doc.documentoId, doc.encf)}
                    disabled={!doc.documentoId}
                    sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, textAlign: 'left', cursor: doc.documentoId ? 'pointer' : 'not-allowed', background: 'none', border: 'none', opacity: doc.documentoId ? 1 : 0.4, '&:hover': doc.documentoId ? { bgcolor: '#f9fafb' } : {}, transition: 'background-color 0.15s' }}
                  >
                    <Download style={{ width: 14, height: 14, flexShrink: 0, color: '#0d9488' }} />
                    <Typography component="span" sx={{ flex: 1, fontSize: '0.75rem', fontFamily: 'monospace', color: '#1f2937' }}>{doc.encf}.xml</Typography>
                    <Typography component="span" sx={{ fontSize: '10px', color: '#9ca3af', flexShrink: 0 }}>Tipo {doc.tipo.replace(/[grb]/g, '')}</Typography>
                    <Typography component="span" sx={{ fontSize: '10px', color: '#0d9488', fontWeight: 500, flexShrink: 0 }}>↓ Descargar</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {!currentType && !polling && (
            <NavFooter
              onBack={() => setSub(0)}
              onNext={() => goSub(2)}
              nextDisabled={!gridDone}
              nextLabel="Siguiente →"
            />
          )}
        </Box>
      )}

      {/* ── Sub 2: Factura de consumo <250K ── */}
      {sub === 2 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, alignItems: 'flex-start' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <InfoBox color="amber" title="Un paso más en el portal DGII">
                Descarga tu factura de consumo (&lt; RD$250 mil) y{' '}
                <strong>súbela al portal DGII</strong> en la sección{' '}
                &ldquo;Facturas de consumo &lt;250Mil&rdquo;.
              </InfoBox>

              <Button
                variant="outlined"
                disabled={downloading32b}
                onClick={handleDownload32b}
                sx={{ textTransform: 'none', borderRadius: '8px', fontSize: '0.875rem', width: '100%', gap: 1 }}
              >
                {downloading32b
                  ? <><CircularProgress size={16} sx={{ color: 'inherit' }} />Generando PDF…</>
                  : <><Download style={{ width: 16, height: 16 }}/>Descargar factura de consumo (&lt;RD$250K)</>}
              </Button>

              {download32bError && (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, borderRadius: '8px', bgcolor: '#fef2f2', border: '1px solid #fecaca', px: 1.5, py: 1.25 }}>
                  <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, marginTop: '1px', color: '#ef4444' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: '#b91c1c' }}>{download32bError}</Typography>
                  </Box>
                  <IconButton onClick={() => setDownload32bError(null)} size="small" sx={{ color: '#f87171', '&:hover': { color: '#dc2626' } }}>
                    <X style={{ width: 14, height: 14 }}/>
                  </IconButton>
                </Box>
              )}

              <InfoBox color="blue" title="Si la DGII la rechaza">
                Será necesario reiniciar todas las pruebas de simulación.{' '}
                <Box component="button" sx={{ textDecoration: 'underline', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', p: 0 }} onClick={() => { reset(); setSub(1); }}>
                  Reiniciar envío
                </Box>
              </InfoBox>
            </Box>

            <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <Box sx={{ px: 1.5, py: 1, bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <ImageIcon style={{ width: 12, height: 12, color: '#9ca3af' }} />
                <Typography sx={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Dónde subirla en el portal
                </Typography>
              </Box>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/dgii-guia/paso4-fc-menor-250k.png" alt="Sección Facturas de consumo menor a 250K en el portal DGII" style={{ width: '100%', height: 'auto' }} />
              <Typography sx={{ fontSize: '10px', color: '#6b7280', px: 1.5, py: 1, borderTop: '1px solid #f3f4f6', lineHeight: 1.4 }}>
                Baja hasta &ldquo;Facturas de consumo &lt;250Mil&rdquo;, selecciona el PDF y haz clic en ENVIAR.
              </Typography>
            </Box>
          </Box>

          <FormControlLabel
            control={<Checkbox checked={fc250Done} onChange={async e => { const v = e.target.checked; setFc250Done(v); const { guardarEstado } = await import('@/lib/habilitacion/client'); guardarEstado({ pruebas: { fc250Done: v } }).catch(() => {}); }} size="small" sx={{ color: '#9ca3af', '&.Mui-checked': { color: '#0d9488' }, mt: -0.25 }} />}
            label={<Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>Subí con éxito la factura de consumo al portal DGII</Typography>}
            sx={{ alignItems: 'flex-start', mx: 0 }}
          />

          <NavFooter
            onBack={() => setSub(1)}
            onNext={() => goSub(3)}
            nextDisabled={!fc250Done}
            nextLabel="Ver confirmación"
          />
        </Box>
      )}

      {/* ── Sub 3: Confirmación ── */}
      {sub === 3 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ borderRadius: '12px', border: '1px solid #99f6e4', bgcolor: '#f0fdfa', p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ height: 40, width: 40, borderRadius: '50%', bgcolor: '#ccfbf1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CheckCircle style={{ width: 20, height: 20, color: '#0d9488' }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#134e4a' }}>Pruebas de simulación completadas</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#0f766e', mt: 0.25 }}>
                  Todos los e-CF de prueba fueron aceptados por la DGII
                </Typography>
              </Box>
            </Box>
          </Box>

          <InfoBox color="blue" title="Próximo: Representación Impresa">
            Ahora DGII necesita validar los <strong>PDFs impresos</strong> de cada tipo de comprobante.
            Son 11 archivos (uno por tipo) que te entregamos en el siguiente paso.
          </InfoBox>

          <FormControlLabel
            control={<Checkbox checked={confirmed} onChange={async e => { const v = e.target.checked; setConfirmed(v); const { guardarEstado } = await import('@/lib/habilitacion/client'); guardarEstado({ pruebas: { confirmed: v } }).catch(() => {}); }} size="small" sx={{ color: '#9ca3af', '&.Mui-checked': { color: '#0d9488' }, mt: -0.25 }} />}
            label={<Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>Confirmo que el Set de Pruebas fue aprobado en el portal DGII</Typography>}
            sx={{ alignItems: 'flex-start', mx: 0 }}
          />

          <NavFooter onBack={() => setSub(2)} onNext={onComplete} nextDisabled={!confirmed} />
        </Box>
      )}
    </Box>
  );
}

// ─── Phase 2: Representaciones impresas (con espera DGII) ────────────────────

function PhaseImpresa({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [sub,             setSub]             = useState(0);
  const [downloaded,      setDownloaded]      = useState<Set<string>>(new Set());
  const [downloading,     setDownloading]     = useState<string | null>(null);
  const [downloadingAll,  setDownloadingAll]  = useState(false);
  const [uploadConfirmed, setUploadConfirmed] = useState(false);
  const [downloadError,   setDownloadError]   = useState<string | null>(null);

  /** Descarga el PDF de representación de un tipo concreto del servidor. */
  async function handleDownloadOne(tipo: string) {
    setDownloading(tipo);
    setDownloadError(null);
    try {
      const res = await fetch('/api/habilitacion/pdf-representacion?soloAprobados=true', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tipo }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Error ${res.status}`);
      }

      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = `representacion-${tipo}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloaded(prev => new Set([...prev, tipo]));
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Error descargando PDF');
    } finally {
      setDownloading(null);
    }
  }

  /** Descarga todos los PDFs de forma secuencial. */
  async function handleDownloadAll() {
    setDownloadingAll(true);
    setDownloadError(null);
    for (const pdf of PDFS) {
      if (!downloaded.has(pdf.tipo)) {
        await handleDownloadOne(pdf.tipo);
      }
    }
    setDownloadingAll(false);
  }

  const allDone = PDFS.every(p => downloaded.has(p.tipo));

  const STEPS = ['Descargar PDFs', 'Subida al portal', 'Validación DGII'];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* Stepper */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {STEPS.map((label, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <Box sx={{ height: 28, width: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, border: '2px solid', transition: 'all 0.15s', borderColor: i < sub ? '#0d9488' : i === sub ? '#0d9488' : '#e5e7eb', bgcolor: i < sub ? '#0d9488' : '#fff', color: i < sub ? '#fff' : i === sub ? '#0d9488' : '#9ca3af' }}>
                {i < sub ? <Check style={{ width: 12, height: 12 }}/> : i + 1}
              </Box>
              <Typography component="span" sx={{ fontSize: '10px', fontWeight: 500, whiteSpace: 'nowrap', color: i === sub ? '#0f766e' : i < sub ? '#14b8a6' : '#9ca3af' }}>
                {label}
              </Typography>
            </Box>
            {i < STEPS.length - 1 && (
              <Box sx={{ flex: 1, height: 2, mb: 2, mx: 1, borderRadius: '9999px', bgcolor: i < sub ? '#2dd4bf' : '#e5e7eb', transition: 'background-color 0.15s' }} />
            )}
          </Box>
        ))}
      </Box>

      {/* ── Sub 0: Descargar los 11 PDFs ── */}
      {sub === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <InfoBox color="amber" title="11 representaciones impresas requeridas">
            DGII necesita aprobar el PDF impreso de cada tipo de comprobante. EmiteDo los genera
            automáticamente con los QR correctos — solo descárgalos y súbelos al portal.
          </InfoBox>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Button onClick={handleDownloadAll} disabled={downloadingAll || !!downloading || allDone} variant="outlined"
              sx={{ textTransform: 'none', borderRadius: '8px', gap: 1 }}>
              {downloadingAll
                ? <><CircularProgress size={16} sx={{ color: 'inherit' }} />Descargando {downloaded.size + 1} de {PDFS.length}…</>
                : allDone
                ? <><CheckCircle style={{ width: 16, height: 16, color: '#14b8a6' }} />Todos descargados</>
                : <><Download style={{ width: 16, height: 16 }}/>Descargar todos (uno a uno)</>}
            </Button>
            <Typography component="span" sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#6b7280' }}>
              {downloaded.size}/{PDFS.length}
            </Typography>
          </Box>

          {downloadError && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, borderRadius: '8px', bgcolor: '#fef2f2', border: '1px solid #fecaca', px: 2, py: 1.5 }}>
              <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, marginTop: '1px', color: '#ef4444' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#b91c1c' }}>Error al descargar PDF</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: '#dc2626', mt: 0.25 }}>{downloadError}</Typography>
              </Box>
              <IconButton onClick={() => setDownloadError(null)} size="small" sx={{ color: '#f87171', '&:hover': { color: '#dc2626' } }}>
                <X style={{ width: 16, height: 16 }}/>
              </IconButton>
            </Box>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {PDFS.map(pdf => {
              const done = downloaded.has(pdf.tipo);
              const busy = downloading === pdf.tipo;
              return (
                <Box key={pdf.tipo} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderRadius: '12px', border: `1px solid ${done ? '#99f6e4' : '#e5e7eb'}`, bgcolor: done ? 'rgba(240,253,250,0.6)' : '#fff', transition: 'all 0.15s' }}>
                  <Box sx={{ height: 28, width: 28, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.75rem', fontWeight: 700, bgcolor: done ? '#ccfbf1' : '#f3f4f6', color: done ? '#0f766e' : '#6b7280' }}>
                    {pdf.tipo.replace(/[ab]/g, '')}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>{pdf.nombre}</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{pdf.tam}</Typography>
                  </Box>
                  <IconButton onClick={() => !done && !busy && handleDownloadOne(pdf.tipo)} disabled={done || busy}
                    size="small" sx={{ flexShrink: 0, borderRadius: '8px', color: done ? '#14b8a6' : busy ? '#d1d5db' : '#9ca3af', cursor: done ? 'default' : 'pointer', '&:hover': !done && !busy ? { color: '#0d9488', bgcolor: '#f0fdfa' } : {} }}>
                    {busy ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }}/> : done ? <CheckCircle style={{ width: 16, height: 16 }}/> : <Download style={{ width: 16, height: 16 }}/>}
                  </IconButton>
                </Box>
              );
            })}
          </Box>

          <NavFooter
            onBack={onBack}
            onNext={() => setSub(1)}
            nextDisabled={!allDone}
            nextLabel="Ya los descargué"
          />
        </Box>
      )}

      {/* ── Sub 1: Confirmar subida al portal ── */}
      {sub === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <InfoBox color="blue" title="Sube los 11 PDFs al portal DGII">
            En el portal DGII, ve a <strong>Paso 5: Representación Impresa</strong>. Verás 11 casillas,
            una por cada tipo. Sube cada PDF en su casilla correspondiente (el nombre del archivo
            indica el tipo) y haz clic en <strong>ENVIAR ARCHIVOS</strong>.
          </InfoBox>

          <DgiiScreenshot
            src="/dgii-guia/paso5-representacion-impresa.jpg"
            alt="Pantalla de Pruebas de Representación Impresa en el portal DGII"
            caption="Las 11 casillas en el portal DGII. Sube cada PDF en su casilla correspondiente."
            mode="inline"
          />

          <FormControlLabel
            control={<Checkbox checked={uploadConfirmed} onChange={e => setUploadConfirmed(e.target.checked)} size="small" sx={{ color: '#9ca3af', '&.Mui-checked': { color: '#0d9488' }, mt: -0.25 }} />}
            label={<Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>Subí los 11 PDFs al portal DGII y di clic en <strong>ENVIAR ARCHIVOS</strong></Typography>}
            sx={{ alignItems: 'flex-start', mx: 0, p: 2, borderRadius: '12px', border: '1px solid #e5e7eb', '&:hover': { borderColor: '#5eead4' }, transition: 'border-color 0.15s' }}
          />

          <NavFooter
            onBack={() => setSub(0)}
            onNext={() => setSub(2)}
            nextDisabled={!uploadConfirmed}
            nextLabel="Esperar validación"
          />
        </Box>
      )}

      {/* ── Sub 2: Espera validación DGII ── */}
      {sub === 2 && (
        <>
          <WaitForDgii
            title="DGII está validando tus representaciones impresas"
            description="DGII revisa cada PDF para verificar que los datos y el código QR estén correctos. Este es el paso con mayor plazo."
            estimated="2 a 5 días hábiles"
            simulateSeconds={10}
            successTitle="Representaciones impresas aprobadas"
            successDescription="DGII validó los 11 PDFs. Ya casi terminamos — solo faltan las URLs de producción y la declaración jurada."
            onComplete={onComplete}
          />
          <Box sx={{ fontSize: '0.75rem', color: '#d97706', mt: 1.5, display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: '1px' }}/>
            <Typography component="span" sx={{ fontSize: '0.75rem', color: '#d97706' }}>
              Si DGII rechaza alguna representación, recibirás un correo con los detalles. Vuelve a este paso,
              descarga nuevamente el PDF corregido y re-súbelo al portal.
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}

// ─── Phase 3: URLs de producción ─────────────────────────────────────────────

function PhaseUrls({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    fetch('/api/ecf/urls-dgii').then(r => r.json()).then(d => setWebhookBaseUrl(d.webhookBaseUrl ?? ''));
  }, []);

  const urls = {
    recepcion:    webhookBaseUrl || 'Cargando…',
    aprobacion:   webhookBaseUrl || 'Cargando…',
    autenticacion:webhookBaseUrl || 'Cargando…',
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <InfoBox color="blue" title="Cambio de ambiente: pruebas → producción">
        Hasta ahora trabajaste en el ambiente de <strong>pruebas</strong> de DGII. Para emitir e-CF reales,
        DGII te pide actualizar las 3 URLs del software al ambiente de <strong>producción</strong>.
        EmiteDo ya tiene las URLs listas — solo cópialas y pégalas en el portal.
      </InfoBox>

      <DgiiScreenshot
        src="/dgii-guia/paso12-url-produccion.png"
        alt="Pantalla de URL Servicios Producción en el portal DGII"
        caption="En el portal DGII, paso 12: URL Servicios Producción. Pega las 3 URLs de abajo y haz clic en CONFIRMAR URLs."
        mode="inline"
      />

      <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, bgcolor: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Globe style={{ width: 16, height: 16, color: '#9ca3af' }} />
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Endpoints de producción</Typography>
        </Box>
        <Box sx={{ px: 2 }}>
          <CopyRow label="URL de recepción"     value={urls.recepcion} />
          <CopyRow label="URL de aprobación"    value={urls.aprobacion} />
          <CopyRow label="URL de autenticación" value={urls.autenticacion} />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, borderRadius: '12px', border: '1px solid #e5e7eb', p: 2 }}>
        <Lock style={{ width: 16, height: 16, flexShrink: 0, color: '#14b8a6' }} />
        <Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>
          Todos los endpoints usan <strong>HTTPS / TLS 1.2+</strong> con certificado SSL válido.
        </Typography>
      </Box>

      <FormControlLabel
        control={<Checkbox checked={confirmed} onChange={e => setConfirmed(e.target.checked)} size="small" sx={{ color: '#9ca3af', '&.Mui-checked': { color: '#0d9488' }, mt: -0.25 }} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>Registré las 3 URLs en el portal DGII y di clic en CONFIRMAR URLs</Typography>}
        sx={{ alignItems: 'flex-start', mx: 0 }}
      />

      <NavFooter onBack={onBack} onNext={onComplete} nextDisabled={!confirmed} />
    </Box>
  );
}

// ─── Phase 4: Declaración Jurada + Verificación RNC ──────────────────────────

function PhaseDeclaracion({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sub,     setSub]     = useState(0);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [signing, setSigning] = useState(false);
  const [signed,  setSigned]  = useState(false);
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);

  async function handleSign() { setSigning(true); await sleep(2100); setSigning(false); setSigned(true); }
  async function handleSend() { setSending(true); await sleep(1700); setSending(false); setSent(true); }

  const STEPS = ['Firmar y enviar', 'Verificación RNC'];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* Stepper */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {STEPS.map((label, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <Box sx={{ height: 28, width: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, border: '2px solid', transition: 'all 0.15s', borderColor: i < sub ? '#0d9488' : i === sub ? '#0d9488' : '#e5e7eb', bgcolor: i < sub ? '#0d9488' : '#fff', color: i < sub ? '#fff' : i === sub ? '#0d9488' : '#9ca3af' }}>
                {i < sub ? <Check style={{ width: 12, height: 12 }}/> : i + 1}
              </Box>
              <Typography component="span" sx={{ fontSize: '10px', fontWeight: 500, whiteSpace: 'nowrap', color: i === sub ? '#0f766e' : i < sub ? '#14b8a6' : '#9ca3af' }}>
                {label}
              </Typography>
            </Box>
            {i < STEPS.length - 1 && (
              <Box sx={{ flex: 1, height: 2, mb: 2, mx: 1, borderRadius: '9999px', bgcolor: i < sub ? '#2dd4bf' : '#e5e7eb', transition: 'background-color 0.15s' }} />
            )}
          </Box>
        ))}
      </Box>

      {/* ── Sub 0: Firmar + enviar ── */}
      {sub === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <InfoBox color="blue" title="¿Qué es la Declaración Jurada?">
            Es el <strong>contrato legal</strong> por el que te comprometes a usar los e-CF correctamente.
            Bajo fe de juramento declaras que: (1) el proceso de certificación se hizo correctamente,
            (2) el representante está autorizado, y (3) tienes certificado digital válido.{' '}
            <DgiiScreenshot
              src="/dgii-guia/paso13-declaracion-jurada.jpg"
              alt="Texto completo de la declaración jurada en el portal DGII"
              caption="En el portal DGII, paso 13: aparece el texto legal completo y al final un botón GENERAR ARCHIVO."
              label="Ver texto legal completo"
            />
          </InfoBox>

          {/* Step 1 */}
          <Box sx={{ borderRadius: '12px', border: `1px solid ${xmlFile ? '#99f6e4' : '#e5e7eb'}`, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ height: 24, width: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, bgcolor: xmlFile ? '#0d9488' : '#e5e7eb', color: xmlFile ? '#fff' : '#4b5563' }}>
                  {xmlFile ? <Check style={{ width: 14, height: 14 }}/> : '1'}
                </Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Subir XML generado por la DGII</Typography>
              </Box>
              <DgiiScreenshot
                src="/dgii-guia/paso13-envio-xml-declaracion.png"
                alt="Envío del XML de declaración jurada firmado"
                caption="En el portal DGII, después del texto legal, haz clic en GENERAR ARCHIVO para descargar el XML."
                label="Ver pantalla"
              />
            </Box>

            {!xmlFile ? (
              <Box onClick={() => fileInputRef.current?.click()}
                sx={{ borderRadius: '12px', border: '2px dashed #e5e7eb', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 3, px: 2, textAlign: 'center', '&:hover': { borderColor: '#5eead4', bgcolor: '#f9fafb' }, transition: 'all 0.15s' }}>
                <Upload style={{ width: 28, height: 28, color: '#9ca3af' }} />
                <Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>XML de declaración jurada</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25 }}>Descargado del portal DGII · Formato .xml</Typography>
                </Box>
              </Box>
            ) : (
              <Box sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', bgcolor: '#f9fafb', px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <FileText style={{ width: 16, height: 16, flexShrink: 0, color: '#0d9488' }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{xmlFile.name}</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{fmtSize(xmlFile.size)}</Typography>
                </Box>
                <IconButton onClick={() => { setXmlFile(null); setSigned(false); setSent(false); }} size="small" sx={{ borderRadius: '50%', color: '#9ca3af', '&:hover': { bgcolor: '#e5e7eb' } }}>
                  <X style={{ width: 14, height: 14 }}/>
                </IconButton>
              </Box>
            )}
            <input ref={fileInputRef} type="file" accept=".xml" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) setXmlFile(f); e.target.value = ''; }} />
          </Box>

          {/* Step 2 */}
          <Box sx={{ borderRadius: '12px', border: `1px solid ${signed ? '#99f6e4' : !xmlFile ? '#f3f4f6' : '#e5e7eb'}`, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, opacity: !signed && !xmlFile ? 0.4 : 1, transition: 'all 0.15s' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ height: 24, width: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, bgcolor: signed ? '#0d9488' : '#e5e7eb', color: signed ? '#fff' : '#4b5563' }}>
                {signed ? <Check style={{ width: 14, height: 14 }}/> : '2'}
              </Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Firmar con certificado P12</Typography>
            </Box>
            {!signed ? (
              <Button onClick={handleSign} disabled={!xmlFile || signing} variant="contained" disableElevation
                sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, width: '100%', gap: 1 }}>
                {signing
                  ? <><CircularProgress size={16} sx={{ color: 'inherit' }} />Firmando declaración jurada…</>
                  : <><FileSignature style={{ width: 16, height: 16 }}/>Firmar declaración jurada</>}
              </Button>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', p: 1.5, color: '#134e4a' }}>
                  <CheckCircle style={{ width: 16, height: 16 }}/>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Firmado · RSA-SHA256</Typography>
                </Box>
                <Button variant="outlined" size="small" sx={{ flexShrink: 0, textTransform: 'none', borderRadius: '8px', gap: 0.75 }}>
                  <Download style={{ width: 14, height: 14 }}/> Descargar
                </Button>
              </Box>
            )}
          </Box>

          {/* Step 3 */}
          <Box sx={{ borderRadius: '12px', border: `1px solid ${sent ? '#99f6e4' : !signed ? '#f3f4f6' : '#e5e7eb'}`, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, opacity: !sent && !signed ? 0.4 : 1, transition: 'all 0.15s' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ height: 24, width: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, bgcolor: sent ? '#0d9488' : '#e5e7eb', color: sent ? '#fff' : '#4b5563' }}>
                {sent ? <Check style={{ width: 14, height: 14 }}/> : '3'}
              </Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Enviar al portal DGII</Typography>
            </Box>
            {!sent ? (
              <Button onClick={handleSend} disabled={!signed || sending} variant="contained" disableElevation
                sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, width: '100%', gap: 1 }}>
                {sending
                  ? <><CircularProgress size={16} sx={{ color: 'inherit' }} />Enviando a DGII…</>
                  : <><ExternalLink style={{ width: 16, height: 16 }}/>Enviar declaración jurada</>}
              </Button>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', p: 1.5, color: '#134e4a' }}>
                <CheckCircle style={{ width: 16, height: 16, flexShrink: 0 }}/>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Enviada y recibida por la DGII</Typography>
              </Box>
            )}
          </Box>

          <NavFooter
            onBack={onBack}
            onNext={() => setSub(1)}
            nextDisabled={!sent}
            nextLabel="Verificar RNC"
          />
        </Box>
      )}

      {/* ── Sub 1: Verificación RNC ── */}
      {sub === 1 && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Último paso antes de producción
            </Typography>
            <DgiiScreenshot
              src="/dgii-guia/paso14-verificacion-estatus.png"
              alt="Verificación del estatus del RNC en el portal DGII"
              caption="DGII valida automáticamente que tu RNC esté activo y al día con tus obligaciones fiscales."
              label="Ver pantalla"
            />
          </Box>
          <WaitForDgii
            title="DGII está verificando el estatus de tu RNC"
            description="Se valida que tu RNC esté activo, al día con las obligaciones, y que la relación representante ↔ empresa sea correcta."
            estimated="unos minutos"
            simulateSeconds={5}
            successTitle="RNC verificado"
            successDescription="Todo en orden. Tu habilitación está lista para ser finalizada."
            onComplete={onComplete}
          />
        </>
      )}
    </Box>
  );
}

// ─── Phase 5: Finalizado (Paso 15 DGII) ──────────────────────────────────────

function PhaseFinalizado({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      <Box sx={{ borderRadius: '16px', border: '1px solid #99f6e4', background: 'linear-gradient(135deg, #f0fdfa, #fff)', p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Box sx={{ height: 56, width: 56, borderRadius: '16px', bgcolor: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <PartyPopper style={{ width: 28, height: 28, color: '#fff' }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.1em', mb: 0.5 }}>Paso 15 · Finalizado</Typography>
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'text.primary' }}>¡Tu habilitación está completa!</Typography>
            <Typography sx={{ fontSize: '0.875rem', color: '#4b5563', mt: 1, lineHeight: 1.6 }}>
              Has completado exitosamente el proceso de certificación como Facturador Electrónico.
              Ya puedes emitir e-CF en producción desde EmiteDo.
            </Typography>
          </Box>
        </Box>
      </Box>

      <DgiiScreenshot
        src="/dgii-guia/paso15-finalizado.png"
        alt="Pantalla de finalización en el portal DGII"
        caption="Esta es la pantalla que ves en el portal DGII cuando completas el proceso. Te redirige a la Oficina Virtual (OFV)."
        mode="inline"
      />

      <InfoBox color="blue" title="¿Qué es la OFV y por qué importa?">
        La <strong>Oficina Virtual (OFV)</strong> es donde DGII te muestra los reportes, consultas y
        estatus de tus e-CF. <strong>No necesitas entrar ahí para emitir facturas</strong> — EmiteDo
        las envía automáticamente en producción. Úsala solo para consultar o ver reportes.
      </InfoBox>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        <Box component="a" href="https://www.dgii.gov.do/ofv/login.aspx" target="_blank" rel="noopener noreferrer"
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderRadius: '12px', border: '1px solid #e5e7eb', textDecoration: 'none', '&:hover': { borderColor: '#5eead4', bgcolor: 'rgba(240,253,250,0.5)' }, transition: 'all 0.15s' }}>
          <Box sx={{ height: 40, width: 40, borderRadius: '12px', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ExternalLink style={{ width: 16, height: 16, color: '#0d9488' }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Ir a la OFV</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Oficina Virtual de la DGII</Typography>
          </Box>
          <ArrowRight style={{ width: 16, height: 16, flexShrink: 0, color: '#9ca3af' }} />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderRadius: '12px', border: '1px solid #99f6e4', bgcolor: '#f0fdfa' }}>
          <Box sx={{ height: 40, width: 40, borderRadius: '12px', bgcolor: '#ccfbf1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap style={{ width: 16, height: 16, color: '#0d9488' }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#134e4a' }}>EmiteDo ya está en producción</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#0f766e' }}>Cada factura que emitas será real ante DGII</Typography>
          </Box>
        </Box>
      </Box>

      <FormControlLabel
        control={<Checkbox checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} size="small" sx={{ color: '#9ca3af', '&.Mui-checked': { color: '#0d9488' }, mt: -0.25 }} />}
        label={<Typography sx={{ fontSize: '0.875rem', color: '#374151' }}>Entiendo que desde ahora cada e-CF que emita en EmiteDo es <strong>real</strong> y se envía directamente a producción DGII</Typography>}
        sx={{ alignItems: 'flex-start', mx: 0, p: 2, borderRadius: '12px', border: '1px solid #e5e7eb' }}
      />

      <NavFooter
        onBack={onBack}
        onNext={onComplete}
        nextDisabled={!acknowledged}
        nextLabel="Finalizar habilitación"
      />
    </Box>
  );
}

// ─── Final: Celebración ──────────────────────────────────────────────────────

function PhaseListo() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, py: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 2 }}>
        <Box sx={{ height: 80, width: 80, borderRadius: '50%', bgcolor: '#ccfbf1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Rocket style={{ width: 40, height: 40, color: '#0d9488' }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: 'text.primary' }}>¡Habilitación completada!</Typography>
          <Typography sx={{ color: '#6b7280', mt: 1, maxWidth: 448, fontSize: '0.875rem' }}>
            Tu empresa está habilitada ante la DGII para emitir comprobantes fiscales electrónicos.
            Ya puedes emitir e-CF en producción.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        {[
          { icon: Building2,    label: 'Empresa',        desc: 'Datos fiscales' },
          { icon: KeyRound,     label: 'Certificado',    desc: 'P12 activo' },
          { icon: FlaskConical, label: 'Set de Pruebas', desc: 'Aprobado' },
          { icon: CheckCircle,  label: 'Producción',     desc: 'En línea' },
        ].map(item => (
          <Box key={item.label} sx={{ borderRadius: '12px', border: '1px solid #e5e7eb', p: 2, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ height: 36, width: 36, borderRadius: '50%', bgcolor: '#f0fdfa', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto' }}>
              <item.icon style={{ width: 16, height: 16, color: '#0d9488' }} />
            </Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.primary' }}>{item.label}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>{item.desc}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
        <Link href="/dashboard/facturas/nueva" style={{ flex: 1 }}>
          <Button variant="contained" disableElevation fullWidth sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, gap: 1 }}>
            <ArrowRight style={{ width: 16, height: 16 }}/> Emitir primera factura
          </Button>
        </Link>
        <Link href="/dashboard" style={{ flex: 1 }}>
          <Button variant="outlined" fullWidth sx={{ textTransform: 'none', borderRadius: '8px' }}>Ir al dashboard</Button>
        </Link>
      </Box>
    </Box>
  );
}

// ─── Intro modal ─────────────────────────────────────────────────────────────

const INTRO_KEY = 'emitedo_habilitacion_intro_seen';

type IntroMode = 'asistido' | 'manual';

function IntroModal({ onStart }: { onStart: () => void }) {
  function handleStart() {
    try { localStorage.setItem(INTRO_KEY, '1'); } catch {}
    onStart();
  }

  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <Box sx={{ bgcolor: '#fff', borderRadius: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', width: '100%', maxWidth: '48rem', overflow: 'hidden' }}>

        <Box sx={{ background: 'linear-gradient(to right, #0d9488, #14b8a6)', px: 5, py: 4 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#ccfbf1', textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1 }}>
            Comprobantes Fiscales Electrónicos · DGII
          </Typography>
          <Typography sx={{ fontSize: '1.875rem', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
            Activa tu facturación electrónica
          </Typography>
          <Typography sx={{ fontSize: '1rem', color: '#ccfbf1', mt: 1 }}>
            EmiteDo te guía paso a paso por el proceso de habilitación ante la DGII.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' } }}>
          <Box sx={{ flex: 1, px: 5, py: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Antes de comenzar, ten a mano
              </Typography>
              {[
                {
                  n: '1', text: 'Acceso al portal de la DGII',
                  help: 'El portal de la DGII (Oficina Virtual) es donde gestionas tu habilitación como emisor electrónico. Necesitas una cuenta activa con tu RNC registrado.',
                  link: 'https://www.dgii.gov.do/ofv/', linkText: 'Ir al portal DGII',
                },
                {
                  n: '2', text: 'Certificado digital P12',
                  help: 'El certificado digital (.p12 o .pfx) es emitido por entidades autorizadas por INDOTEL como Viafirma, Cámara de Comercio o DigiCert. Se usa para firmar tus comprobantes electrónicos.',
                  link: 'https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx', linkText: 'Ver documentación oficial',
                },
                {
                  n: '3', text: 'RNC activo y en regla con la DGII',
                  help: 'Tu RNC debe estar activo y sin deudas pendientes con la DGII. Puedes verificar tu estado de cuenta en el portal de consultas antes de iniciar.',
                  link: 'https://dgii.gov.do/herramientas/consultas/Paginas/RNC.aspx', linkText: 'Consultar RNC',
                },
              ].map(item => (
                <Box key={item.n} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ height: 28, width: 28, borderRadius: '50%', bgcolor: '#f0fdfa', border: '1px solid #99f6e4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, color: '#0d9488' }}>{item.n}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: '1rem', color: '#374151', flex: 1 }}>{item.text}</Typography>
                  <HelpPopover content={item.help} link={item.link} linkText={item.linkText} />
                </Box>
              ))}
            </Box>

            <Button onClick={handleStart} variant="contained" disableElevation size="large"
              sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, color: '#fff', fontWeight: 600, fontSize: '1rem', py: 1.5, width: '100%' }}>
              Comenzar →
            </Button>
          </Box>

          <Box sx={{ width: { sm: 240 }, bgcolor: '#f9fafb', borderLeft: '1px solid #f3f4f6', px: 4, py: 4, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2.5 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em' }}>¿Qué obtienes?</Typography>
            {[
              { icon: '💰', title: 'Créditos fiscales',       desc: 'Aplica créditos en ITBIS y otros impuestos.' },
              { icon: '⚡', title: 'Facturación en segundos', desc: 'Firma y envía e-CF a la DGII al instante.' },
              { icon: '🔒', title: 'Sin papel, sin riesgo',   desc: 'Todo firmado digitalmente y en la nube.' },
            ].map(b => (
              <Box key={b.title} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Typography component="span" sx={{ fontSize: '1.25rem', flexShrink: 0 }}>{b.icon}</Typography>
                <Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>{b.title}</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.25, lineHeight: 1.6 }}>{b.desc}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Elección inline (no modal) ──────────────────────────────────────────────

function StageEleccion({ onSelect, onBack }: { onSelect: (m: IntroMode) => void; onBack: () => void }) {
  const [selected, setSelected] = useState<IntroMode | null>(null);

  return (
    <Box sx={{ maxWidth: '42rem', mx: 'auto' }}>
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 56, width: 56, borderRadius: '16px', bgcolor: '#0d9488', mb: 2 }}>
          <CheckCircle style={{ width: 28, height: 28, color: '#fff' }} />
        </Box>
        <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: 'text.primary' }}>¡Datos listos!</Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', mt: 1 }}>
          Ahora elige cómo quieres completar la habilitación ante la DGII.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
        <Box
          component="button"
          onClick={() => setSelected('asistido')}
          sx={{ width: '100%', textAlign: 'left', borderRadius: '16px', border: `2px solid ${selected === 'asistido' ? '#14b8a6' : '#e5e7eb'}`, p: 2.5, cursor: 'pointer', background: 'none', bgcolor: selected === 'asistido' ? '#f0fdfa' : 'transparent', '&:hover': selected !== 'asistido' ? { borderColor: '#5eead4', bgcolor: '#f9fafb' } : {}, transition: 'all 0.15s' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <Box sx={{ height: 44, width: 44, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, bgcolor: selected === 'asistido' ? '#14b8a6' : '#ccfbf1', transition: 'background-color 0.15s' }}>
              <Zap style={{ width: 20, height: 20, color: selected === 'asistido' ? '#fff' : '#0d9488' }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.primary' }}>EmiteDo gestiona todo por mí</Typography>
                <Typography component="span" sx={{ fontSize: '11px', fontWeight: 700, bgcolor: '#ccfbf1', color: '#0f766e', px: 1, py: 0.25, borderRadius: '9999px' }}>
                  Recomendado
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Comparte tus credenciales del portal DGII y nos encargamos del proceso completo.
                Tú solo esperas la confirmación.
              </Typography>
            </Box>
            <Box sx={{ height: 20, width: 20, borderRadius: '50%', border: `2px solid ${selected === 'asistido' ? '#14b8a6' : '#d1d5db'}`, bgcolor: selected === 'asistido' ? '#14b8a6' : 'transparent', flexShrink: 0, mt: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
              {selected === 'asistido' && <Check style={{ width: 12, height: 12, color: '#fff' }} />}
            </Box>
          </Box>
        </Box>

        <Box
          component="button"
          onClick={() => setSelected('manual')}
          sx={{ width: '100%', textAlign: 'left', borderRadius: '16px', border: `2px solid ${selected === 'manual' ? '#14b8a6' : '#e5e7eb'}`, p: 2.5, cursor: 'pointer', background: 'none', bgcolor: selected === 'manual' ? '#f0fdfa' : 'transparent', '&:hover': selected !== 'manual' ? { borderColor: '#5eead4', bgcolor: '#f9fafb' } : {}, transition: 'all 0.15s' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <Box sx={{ height: 44, width: 44, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, bgcolor: selected === 'manual' ? '#14b8a6' : '#f3f4f6', transition: 'background-color 0.15s' }}>
              <FileText style={{ width: 20, height: 20, color: selected === 'manual' ? '#fff' : '#6b7280' }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.primary', mb: 0.5 }}>Lo gestiono yo paso a paso</Typography>
              <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Te guiamos por cada fase con instrucciones claras. Tú ejecutas los pasos
                en el portal DGII a tu ritmo.
              </Typography>
            </Box>
            <Box sx={{ height: 20, width: 20, borderRadius: '50%', border: `2px solid ${selected === 'manual' ? '#14b8a6' : '#d1d5db'}`, bgcolor: selected === 'manual' ? '#14b8a6' : 'transparent', flexShrink: 0, mt: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
              {selected === 'manual' && <Check style={{ width: 12, height: 12, color: '#fff' }} />}
            </Box>
          </Box>
        </Box>
      </Box>

      <NavFooter
        onBack={onBack}
        onNext={() => selected && onSelect(selected)}
        nextDisabled={!selected}
        nextLabel="Continuar"
      />
    </Box>
  );
}

// ─── Credenciales inline (no modal) ──────────────────────────────────────────

function StageCredencial({
  rnc,
  onConfirm,
  onSkip,
  onBack,
}: {
  rnc: string;
  onConfirm: (password: string) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [telefono,  setTelefono]  = useState('');
  const [loading,   setLoading]   = useState(false);

  async function handleConfirm() {
    if (!password || !telefono) return;
    setLoading(true);
    await sleep(1600);
    setLoading(false);
    onConfirm(password);
  }

  return (
    <Box sx={{ maxWidth: '28rem', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 56, width: 56, borderRadius: '16px', bgcolor: '#0d9488', mb: 1, mx: 'auto' }}>
          <Zap style={{ width: 28, height: 28, color: '#fff' }} />
        </Box>
        <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: 'text.primary' }}>Acceso al portal DGII</Typography>
        <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.6 }}>
          Necesitamos acceder <strong>una sola vez</strong> al portal DGII para completar
          la habilitación por ti. No guardamos tus credenciales.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75, display: 'block' }}>
            RNC / Cédula
          </Typography>
          <TextField value={rnc} slotProps={{ htmlInput: { readOnly: true } }} size="small" fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#f9fafb', fontFamily: 'monospace' }, '& .MuiInputBase-input': { color: '#6b7280' } }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75, display: 'block' }}>
            Contraseña del portal DGII
          </Typography>
          <TextField
            type={showPass ? 'text' : 'password'}
            placeholder="Tu contraseña del portal"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            size="small" fullWidth autoFocus
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            slotProps={{ input: { endAdornment: (
                <InputAdornment position="end">
                  <IconButton type="button" onClick={() => setShowPass(v => !v)} edge="end" size="small" sx={{ color: '#9ca3af', '&:hover': { color: '#4b5563' } }}>
                    {showPass ? <EyeOff style={{ width: 16, height: 16 }}/> : <Eye style={{ width: 16, height: 16 }}/>}
                  </IconButton>
                </InputAdornment>
              ) } as object }}
          />
        </Box>

        <Box sx={{ borderRadius: '16px', border: '1px solid #fde68a', bgcolor: '#fffbeb', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
            <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, marginTop: '1px', color: '#f59e0b' }} />
            <Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400e' }}>La DGII puede pedir un código de verificación</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#b45309', mt: 0.25, lineHeight: 1.6 }}>
                Algunos portales envían un token por SMS o llamada durante el proceso.
                Deja un número donde podamos contactarte de inmediato si ocurre.
              </Typography>
            </Box>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75, display: 'block' }}>
              WhatsApp / Teléfono de contacto <Typography component="span" sx={{ color: 'error.main' }}>*</Typography>
            </Typography>
            <TextField
              type="tel"
              placeholder="Ej: +1 809 555 0000"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              size="small" fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#fff', '& fieldset': { borderColor: '#fde68a' } }, '& .MuiOutlinedInput-root:hover fieldset': { borderColor: '#fbbf24' } }}
            />
            <Typography sx={{ fontSize: '0.75rem', color: '#d97706', mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography component="span" sx={{ fontSize: '1rem', lineHeight: 1 }}>💬</Typography>
              Te contactaremos por WhatsApp si necesitamos el código
            </Typography>
          </Box>
        </Box>
      </Box>

      <Button
        onClick={handleConfirm}
        disabled={!password || !telefono || loading}
        variant="contained" disableElevation size="large"
        sx={{ textTransform: 'none', borderRadius: '8px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, '&:disabled': { opacity: 0.4 }, fontWeight: 600, width: '100%' }}
      >
        {loading
          ? <><CircularProgress size={16} sx={{ color: 'inherit', mr: 1 }} />Verificando acceso…</>
          : 'Continuar'}
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, bgcolor: '#f9fafb', borderRadius: '12px', p: 2, border: '1px solid #f3f4f6' }}>
        <Shield style={{ width: 16, height: 16, flexShrink: 0, marginTop: '1px', color: '#14b8a6' }} />
        <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.6 }}>
          Tus credenciales se usan <strong>una sola vez</strong> y se eliminan de nuestros
          sistemas de inmediato tras completar el proceso. Conexión cifrada TLS 1.3.
        </Typography>
      </Box>

      <Box component="button" onClick={onSkip} sx={{ width: '100%', fontSize: '0.875rem', color: '#9ca3af', textAlign: 'center', textDecoration: 'underline', textUnderlineOffset: '2px', cursor: 'pointer', background: 'none', border: 'none', '&:hover': { color: '#4b5563' } }}>
        Prefiero hacer el proceso manualmente →
      </Box>

      <NavFooter onBack={onBack} />
    </Box>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type AppStage = 'requisito' | 'eleccion' | 'credencial' | 'wizard';

export default function HabilitacionPage() {
  const [showIntro,          setShowIntro]          = useState(false);
  const [stage,              setStage]              = useState<AppStage>('requisito');
  const [mode,               setMode]               = useState<IntroMode>('manual');
  const [phase,              setPhase]              = useState(0);
  const [completed,          setCompleted]          = useState<Set<number>>(new Set());
  const [rnc,                setRnc]                = useState('');
  const [showCancelConfirm,  setShowCancelConfirm]  = useState(false);
  const [canceling,          setCanceling]          = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(INTRO_KEY)) setShowIntro(true);
    } catch { setShowIntro(true); }
  }, []);

  useEffect(() => {
    fetch('/api/equipo/perfil').then(r => r.json()).then(d => setRnc(d.rnc ?? ''));
  }, []);

  // Cargar fase + completado desde servidor (persistencia cross-session)
  useEffect(() => {
    import('@/lib/habilitacion/client').then(({ cargarEstado }) => {
      cargarEstado().then(({ state, completado }) => {
        if (typeof state.fase === 'number') setPhase(state.fase);
        const done = new Set<number>();
        // Reconstruir: cualquier fase < state.fase se considera completada
        if (typeof state.fase === 'number') {
          for (let i = 0; i < state.fase; i++) done.add(i);
        }
        if (completado) for (let i = 0; i < 6; i++) done.add(i);
        setCompleted(done);
        // Si hay progreso guardado (fase ≥ 1) o proceso completado → saltar PASO PREVIO
        if (completado || typeof state.fase === 'number') setStage('wizard');
      }).catch(() => { /* silent */ });
    });
  }, []);

  const isDone = completed.size === PHASES.length;

  function handleModeSelected(m: IntroMode) {
    setMode(m);
    setStage(m === 'asistido' ? 'credencial' : 'wizard');
  }

  function completePhase(id: number) {
    setCompleted(prev => new Set([...prev, id]));
    const nextPhase = id + 1;
    setPhase(nextPhase);
    // Persistir fase alcanzada (fire-and-forget)
    import('@/lib/habilitacion/client').then(({ guardarEstado }) => {
      guardarEstado({ fase: nextPhase }).catch(() => {});
    });
    // Si completó la última fase → marcar habilitación finalizada
    if (nextPhase >= PHASES.length) {
      fetch('/api/habilitacion/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ finalizado: { acknowledged: true } }),
      }).catch(() => {});
    }
  }

  function handleJump(p: number) {
    const maxReached = Math.max(phase, ...Array.from(completed), 0);
    if (p <= maxReached) setPhase(p);
  }

  async function handleCancelarProceso() {
    setCanceling(true);
    try {
      const { reiniciarEstado } = await import('@/lib/habilitacion/client');
      await reiniciarEstado();
    } catch { /* silent — igual reseteamos la UI */ }
    setCanceling(false);
    setPhase(0);
    setCompleted(new Set());
    setShowCancelConfirm(false);
    setStage('eleccion');
  }

  const subtitles: Record<AppStage, string> = {
    requisito: 'Configura tu empresa y certificado primero',
    eleccion:  'Elige cómo quieres completar la habilitación',
    credencial:'Ingresa tus credenciales del portal DGII',
    wizard:    'Proceso de certificación ante la DGII · 6 fases',
  };

  return (
    <>
      {showIntro && (
        <IntroModal onStart={() => setShowIntro(false)} />
      )}

      <Box sx={{ minHeight: '100%', bgcolor: '#f9fafb' }}>
        {/* Header */}
        <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid #e5e7eb', px: 3, py: 2 }}>
          <Box sx={{ maxWidth: '72rem', mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: 'text.primary' }}>Habilitación e-CF</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', mt: 0.25 }}>{subtitles[stage]}</Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Botón cancelar — solo visible en el wizard con progreso y sin completar */}
              {stage === 'wizard' && !isDone && (
                <Box sx={{ position: 'relative' }}>
                  <Box component="button"
                    onClick={() => setShowCancelConfirm(v => !v)}
                    sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s', '&:hover': { color: '#b91c1c' } }}
                  >
                    Cancelar proceso
                  </Box>

                  {showCancelConfirm && (
                    <>
                      {/* Backdrop */}
                      <Box
                        sx={{ position: 'fixed', inset: 0, zIndex: 40 }}
                        onClick={() => setShowCancelConfirm(false)}
                      />
                      <Box sx={{ position: 'absolute', right: 0, top: 32, zIndex: 50, width: 304, bgcolor: '#fff', border: '1px solid #fecaca', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                          <AlertTriangle style={{ width: 16, height: 16, flexShrink: 0, color: '#ef4444', marginTop: 2 }} />
                          <Box>
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                              ¿Eliminar todo el progreso?
                            </Typography>
                            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.5 }}>
                              Se borrará todo el avance guardado del proceso de habilitación. Los
                              e-CF ya enviados a la DGII no se pueden deshacer.
                            </Typography>
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Box component="button"
                            onClick={() => setShowCancelConfirm(false)}
                            sx={{ flex: 1, fontSize: '0.875rem', py: 0.75, borderRadius: '8px', border: '1px solid #e5e7eb', bgcolor: 'transparent', color: '#374151', cursor: 'pointer', '&:hover': { bgcolor: '#f9fafb' } }}
                          >
                            No, mantener
                          </Box>
                          <Box component="button"
                            onClick={handleCancelarProceso}
                            disabled={canceling}
                            sx={{ flex: 1, fontSize: '0.875rem', py: 0.75, borderRadius: '8px', bgcolor: '#dc2626', color: '#fff', border: 'none', cursor: canceling ? 'default' : 'pointer', opacity: canceling ? 0.5 : 1, fontWeight: 500, '&:hover': { bgcolor: '#b91c1c' } }}
                          >
                            {canceling ? 'Eliminando…' : 'Sí, eliminar todo'}
                          </Box>
                        </Box>
                      </Box>
                    </>
                  )}
                </Box>
              )}

              <Link href="/dashboard" style={{ fontSize: '0.875rem', color: '#9ca3af', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#4b5563')}
                onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
              >
                Cerrar ×
              </Link>
            </Box>
          </Box>
        </Box>

        <Box sx={{ maxWidth: '72rem', mx: 'auto', px: { xs: 2, sm: 3 }, py: 5 }}>

          {/* ── Empresa + Certificado ── */}
          {stage === 'requisito' && (
            <Box sx={{ maxWidth: '48rem', mx: 'auto' }}>
              <Box sx={{ mb: 3 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
                  Paso previo
                </Typography>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'text.primary' }}>Tu empresa y certificado digital</Typography>
                <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af', mt: 0.5 }}>
                  Completa tus datos fiscales y carga tu certificado P12 antes de iniciar el proceso.
                </Typography>
              </Box>
              <Box sx={{ bgcolor: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', p: 3 }}>
                <PhaseEmpresa onComplete={() => setStage('eleccion')} />
              </Box>
            </Box>
          )}

          {/* ── Elección de modalidad ── */}
          {stage === 'eleccion' && (
            <StageEleccion
              onSelect={handleModeSelected}
              onBack={() => setStage('requisito')}
            />
          )}

          {/* ── Credenciales (modo asistido) ── */}
          {stage === 'credencial' && (
            <StageCredencial
              rnc={rnc}
              onConfirm={_pwd => {
                void _pwd;
                setStage('wizard');
              }}
              onSkip={() => { setMode('manual'); setStage('wizard'); }}
              onBack={() => setStage('eleccion')}
            />
          )}

          {/* ── Wizard 6 fases ── */}
          {stage === 'wizard' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!isDone && <EtapasHero />}

              <Box sx={{ display: 'flex', gap: 4 }}>
                <Sidebar phase={isDone ? PHASES.length : phase} completed={completed} onJump={handleJump} />
                <Box sx={{ flex: 1, bgcolor: '#fff', borderRadius: '16px', border: '1px solid #e5e7eb', p: 3, minHeight: 540 }}>
                  {!isDone ? (
                    <>
                      <Box sx={{ mb: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', flexShrink: 0 }}>Fase {phase + 1} de {PHASES.length}</Typography>
                          <Box sx={{ flex: 1, bgcolor: '#f3f4f6', borderRadius: '999px', height: 6 }}>
                            <Box sx={{ bgcolor: '#14b8a6', height: 6, borderRadius: '999px', transition: 'width 0.5s', width: `${(completed.size / PHASES.length) * 100}%` }} />
                          </Box>
                          <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', flexShrink: 0 }}>{Math.round((completed.size / PHASES.length) * 100)}%</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'text.primary' }}>{PHASE_TITLES[phase]}</Typography>
                          {mode === 'asistido' && (
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', fontWeight: 600, bgcolor: '#ccfbf1', color: '#0f766e', px: 1, py: 0.25, borderRadius: '999px' }}>
                              <Zap style={{ width: 12, height: 12 }}/> Asistido
                            </Box>
                          )}
                        </Box>
                      </Box>

                      {phase === 0 && <PhasePostulacion onComplete={() => completePhase(0)} onBack={() => setStage('eleccion')} />}
                      {phase === 1 && <PhasePruebas      onComplete={() => completePhase(1)} onBack={() => setPhase(0)} />}
                      {phase === 2 && <PhaseImpresa      onComplete={() => completePhase(2)} onBack={() => setPhase(1)} />}
                      {phase === 3 && <PhaseUrls         onComplete={() => completePhase(3)} onBack={() => setPhase(2)} />}
                      {phase === 4 && <PhaseDeclaracion  onComplete={() => completePhase(4)} onBack={() => setPhase(3)} />}
                      {phase === 5 && <PhaseFinalizado   onComplete={() => completePhase(5)} onBack={() => setPhase(4)} />}
                    </>
                  ) : (
                    <PhaseListo />
                  )}
                </Box>
              </Box>
            </Box>
          )}

        </Box>
      </Box>
    </>
  );
}

// Suppress unused import warnings for icons kept for potential future phases
void Hash; void StatusPill;
