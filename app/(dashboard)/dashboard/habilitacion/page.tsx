'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Check, Building2, KeyRound, Hash, FileText, Rocket, Loader2,
  CloudUpload, FileKey, X, Eye, EyeOff, CheckCircle, AlertTriangle,
  AlertCircle,
  Copy, ExternalLink, Shield, ArrowRight, ChevronRight,
  Download, Printer, Globe, ScrollText, FlaskConical,
  FileSignature, Upload, Zap, Lock, RefreshCw,
  Image as ImageIcon, Mail, Clock, PartyPopper,
  Database, FileCheck, ScanLine, Link2, PlayCircle, Inbox, ThumbsUp, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

// 15 fases del wizard (excluye los 2 pre-requisitos: empresa + certificado).
// Nombres/iconos de los pasos aún no definidos se ajustan uno por uno.
const PHASES = [
  { id: 0,  label: 'Postulación DGII',         icon: FileText,     sub: ['Datos del portal', 'Firma digital', 'Envío al portal'] },
  { id: 1,  label: 'Pruebas de Datos e-CF',    icon: FlaskConical, sub: ['Subir Excel', 'Procesamiento'] },
  { id: 2,  label: 'Aprobaciones Comerciales', icon: FileCheck,    sub: ['Subir Excel', 'Procesamiento'] },
  { id: 3,  label: 'Pruebas Simulación e-CF',  icon: Database,     sub: ['Iniciar', 'Procesamiento'] },
  { id: 4,  label: 'Pruebas de Simulación Representación Impresa', icon: Printer, sub: ['Descargar PDFs'] },
  { id: 5,  label: 'Validación Representación Impresa', icon: ScanLine, sub: ['Espera DGII'] },
  { id: 6,  label: 'URL Servicios Prueba',     icon: Link2,        sub: ['Registrar URLs'] },
  { id: 7,  label: 'Inicio Prueba Recepción e-CF',              icon: PlayCircle, sub: ['Portal DGII'] },
  { id: 8,  label: 'Recepción e-CF',                            icon: Inbox,      sub: ['Portal DGII'] },
  { id: 9,  label: 'Inicio Prueba Recepción Aprobación Comercial', icon: PlayCircle, sub: ['Portal DGII'] },
  { id: 10, label: 'Recepción Aprobación Comercial',            icon: ThumbsUp,   sub: ['Portal DGII'] },
  { id: 11, label: 'URLs Producción',          icon: Globe,        sub: ['Registrar URLs'] },
  { id: 12, label: 'Declaración Jurada',       icon: ScrollText,   sub: ['Firmar y enviar', 'Verificación RNC'] },
  { id: 13, label: 'Verificación Estatus',     icon: ShieldCheck,  sub: ['Espera DGII'] },
  { id: 14, label: '¡Finalizado!',             icon: PartyPopper,  sub: ['Entrar a OFV'] },
];

const PHASE_TITLES = [
  'Postulación en el portal DGII',
  'Pruebas de Datos e-CF',
  'Aprobaciones Comerciales',
  'Pruebas Simulación e-CF',
  'Pruebas de Simulación Representación Impresa',
  'Validación Representación Impresa',
  'URL Servicios Prueba',
  'Inicio Prueba Recepción e-CF',
  'Recepción e-CF',
  'Inicio Prueba Recepción Aprobación Comercial',
  'Recepción Aprobación Comercial',
  'URLs de producción',
  'Declaración jurada',
  'Verificación Estatus',
  '¡Habilitación completada!',
];

const EMITEDO = {
  tipoSoftware:    'EXTERNO',
  nombreSoftware:  'Zero ECF API',
  version:         '1',
  rncProveedor:    '133307391',
  nombreProveedor: 'Yisrael Technology SRL',
};

// La webhookBaseUrl viene de ecf-api en tiempo real — se carga en el componente.

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
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900 truncate">{value}</p>
      </div>
      <button
        onClick={() => { navigator.clipboard.writeText(value).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),1500); }}
        className="ml-3 shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-teal-600 transition-colors"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-teal-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// Campo estilo portal DGII — label + asterisco arriba, valor en input con copy button dentro.
// Si `isUrl=true` muestra "https://" como prefijo visual gris (no se copia).
function DgiiField({ label, value, span, required = true, isUrl = false, disabled = false }: {
  label: string; value: string; span?: 'full' | '2'; required?: boolean; isUrl?: boolean;
  /** Valor fijo de configuración (no varía por contribuyente/team) — se
   *  muestra con look de input deshabilitado en vez de campo activo. */
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const spanCls = span === 'full' ? 'col-span-full' : span === '2' ? 'col-span-2' : '';
  return (
    <div className={spanCls}>
      <label className="block text-sm text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className={`flex items-center border rounded-md overflow-hidden ${
        disabled
          ? 'border-gray-200 bg-gray-50'
          : 'border-gray-300 bg-white focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-400'
      }`}>
        {isUrl && (
          <span className="shrink-0 px-3 py-2 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 select-none">
            https://
          </span>
        )}
        <span className={`flex-1 px-3 py-2 text-sm truncate min-w-0 ${disabled ? 'text-gray-500' : 'text-gray-900'}`}>{value}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(value).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),1500); }}
          className="shrink-0 px-3 py-2 border-l border-gray-200 bg-gray-50 hover:bg-teal-50 text-gray-400 hover:text-teal-600 transition-colors"
          title="Copiar"
        >
          {copied ? <Check className="h-4 w-4 text-teal-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// Alias legacy — no eliminar, lo usan otras secciones
function CopyField({ label, value, span }: { label: string; value: string; span?: 'full' | '2' }) {
  return <DgiiField label={label} value={value} span={span} required={false} />;
}

function InfoBox({ color, title, children }: { color: 'blue'|'amber'|'teal'|'red'; title: string; children: React.ReactNode }) {
  const cls = {
    blue:  'border-blue-200 bg-blue-50 text-blue-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    teal:  'border-teal-200 bg-teal-50 text-teal-800',
    red:   'border-red-200 bg-red-50 text-red-800',
  }[color];
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      {title && <p className="text-sm font-semibold mb-1">{title}</p>}
      <div className="text-xs opacity-90">{children}</div>
    </div>
  );
}

function NavFooter({
  onBack, onNext, nextLabel = 'Continuar', nextDisabled = false, nextLoading = false,
}: {
  onBack?: () => void; onNext?: () => void;
  nextLabel?: string; nextDisabled?: boolean; nextLoading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-100">
      {onBack
        ? <Button variant="outline" onClick={onBack}>← Atrás</Button>
        : <div />}
      {onNext && (
        <Button onClick={onNext} disabled={nextDisabled || nextLoading}
          className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 px-8 gap-1.5">
          {nextLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {nextLabel} {!nextLoading && <ChevronRight className="h-4 w-4" />}
        </Button>
      )}
    </div>
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
    <div ref={ref} className="relative inline-flex items-center shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Más información"
        className="h-5 w-5 rounded-full border border-gray-300 bg-white text-gray-400 hover:border-teal-400 hover:text-teal-600 flex items-center justify-center text-[11px] font-bold leading-none transition-colors"
      >
        ?
      </button>
      {open && (
        <div className="absolute z-[70] w-64 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 space-y-2.5
          left-7 top-1/2 -translate-y-1/2
          max-[480px]:left-auto max-[480px]:right-0 max-[480px]:top-7 max-[480px]:translate-y-0">
          <p className="text-xs text-gray-600 leading-relaxed">{content}</p>
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-semibold">
              <ExternalLink className="h-3 w-3" />{linkText ?? 'Ver en DGII'}
            </a>
          )}
        </div>
      )}
    </div>
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
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <ImageIcon className="h-3.5 w-3.5 text-gray-400" />
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Así se ve en el portal DGII</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full h-auto" />
        {caption && <p className="text-xs text-gray-600 px-4 py-3 border-t border-gray-100 bg-gray-50/60">{caption}</p>}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 hover:underline underline-offset-2"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-teal-50 flex items-center justify-center">
                  <ImageIcon className="h-4 w-4 text-teal-600" />
                </div>
                <p className="text-sm font-semibold text-gray-800">Portal DGII</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={alt} className="w-full h-auto" />
              {caption && (
                <p className="text-sm text-gray-600 px-5 py-4 border-t border-gray-100 leading-relaxed">
                  {caption}
                </p>
              )}
            </div>
          </div>
        </div>
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
      <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
            <CheckCircle className="h-5 w-5 text-teal-600" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">{successTitle}</p>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">{successDescription}</p>
          </div>
        </div>
        <Button onClick={onComplete} className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
          Continuar <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
        </div>
        <div>
          <p className="text-base font-bold text-gray-900">{title}</p>
          <p className="text-sm text-gray-600 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Consultando estado en portal DGII…
          </span>
          <span className="text-gray-500 font-mono">{Math.floor(progress)}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-blue-100 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="rounded-xl bg-white border border-blue-100 p-4 flex items-start gap-3">
        <Mail className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Plazo típico: {estimated}
          </p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Puedes cerrar Zero — te avisaremos por correo y WhatsApp cuando DGII responda.
            El wizard te llevará automáticamente a la siguiente fase.
          </p>
        </div>
      </div>

      {allowSkip && (
        <button
          onClick={() => { setProgress(100); setDone(true); }}
          className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
        >
          [Demo] Saltar espera
        </button>
      )}
    </div>
  );
}

// ─── EtapasHero — overview colapsable de las 3 etapas DGII ───────────────────

function EtapasHero() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-teal-50 flex items-center justify-center">
            <ImageIcon className="h-4 w-4 text-teal-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-800">Las 3 etapas oficiales de la DGII</p>
            <p className="text-[11px] text-gray-400">Solicitud → Set de Pruebas → Certificación</p>
          </div>
        </div>
        <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-gray-100 p-5 flex items-center justify-center bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dgii-guia/3-etapas-overview.png"
            alt="Diagrama de las 3 etapas: Solicitud, Set de Pruebas, Certificación"
            className="max-w-full h-auto"
          />
        </div>
      )}
    </div>
  );
}

// ─── StatusPill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: EcfSendStatus }) {
  if (status === 'idle') return null;
  const map: Partial<Record<EcfSendStatus, { cls: string; label: string }>> = {
    sending:     { cls: 'bg-blue-100 text-blue-700',   label: 'Enviando…' },
    aceptado:    { cls: 'bg-teal-100 text-teal-700',   label: 'Aceptado' },
    rechazado:   { cls: 'bg-red-100 text-red-700',     label: 'Rechazado' },
    condicional: { cls: 'bg-amber-100 text-amber-700', label: 'Acep. condicional' },
    proceso:     { cls: 'bg-gray-100 text-gray-600',   label: 'En proceso' },
  };
  const c = map[status];
  if (!c) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.cls}`}>
      {status === 'sending'  && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
      {status === 'aceptado' && <Check   className="h-2.5 w-2.5" />}
      {c.label}
    </span>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

// Filas de fases (círculo + línea conectora + label) — compartidas entre el
// nav de desktop (Sidebar) y el panel expandible de mobile, para que se vean
// exactamente igual en ambos y la línea quede alineada en los dos lugares.
function PhaseListItems({ phase, completed, onJump, onSelect }: {
  phase: number; completed: Set<number>; onJump: (p: number) => void; onSelect?: () => void;
}) {
  const maxReached = Math.max(phase, ...Array.from(completed), 0);
  return (
    <>
      {PHASES.map((p, i) => {
        const isDone    = completed.has(p.id);
        const isCurrent = p.id === phase;
        const isLocked  = p.id > maxReached;
        return (
          <div key={p.id} className="relative">
            {i < PHASES.length - 1 && (
              // left = padding del botón (px-2 = 8px) + mitad del círculo (30px / 2 = 15px).
              // top = borde inferior real del círculo (py-2 8px + mt-0.5 2px + 30px alto = 40px);
              // con un valor menor la línea queda dibujada por encima, cruzando el círculo.
              <div className={`absolute left-[23px] top-10 w-0.5 h-[calc(100%-4px)]
                ${isDone ? 'bg-teal-400' : 'bg-gray-200'}`} />
            )}
            <button
              onClick={() => { if (isLocked) return; onJump(p.id); onSelect?.(); }}
              disabled={isLocked}
              className={`w-full flex items-start gap-3 px-2 py-2 rounded-xl text-left transition-colors mb-1
                ${isCurrent ? 'bg-teal-50' : isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}
            >
              <div className={`h-[30px] w-[30px] rounded-full flex items-center justify-center shrink-0 border-2 mt-0.5 transition-all
                ${isDone    ? 'bg-teal-600 border-teal-600 text-white'
                : isCurrent ? 'bg-white border-teal-600 text-teal-600'
                : 'bg-white border-gray-200 text-gray-400'}`}>
                {isDone ? <Check className="h-3.5 w-3.5" /> : <span className="text-xs font-bold">{p.id + 1}</span>}
              </div>
              <div className="pt-0.5 min-w-0">
                <p className={`text-sm font-semibold leading-tight
                  ${isCurrent ? 'text-gray-900' : isDone ? 'text-teal-700' : 'text-gray-400'}`}>
                  {p.label}
                </p>
                {isCurrent && (
                  <div className="mt-1.5 space-y-0.5">
                    {p.sub.map(s => (
                      <p key={s} className="text-xs text-teal-600 leading-snug">· {s}</p>
                    ))}
                  </div>
                )}
              </div>
            </button>
          </div>
        );
      })}
    </>
  );
}

function Sidebar({ phase, completed, onJump }: { phase: number; completed: Set<number>; onJump: (p: number) => void }) {
  return (
    <nav className="hidden md:flex flex-col w-64 shrink-0 pt-2 select-none">
      <PhaseListItems phase={phase} completed={completed} onJump={onJump} />
    </nav>
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
    <div className="flex items-center justify-center h-72">
      <Loader2 className="h-7 w-7 animate-spin text-teal-500" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Datos empresa */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Datos fiscales</h3>
          <div className="rounded-2xl border border-gray-200 p-5 space-y-4">
            <div>
              <Label className="text-xs mb-1.5 block text-gray-400">RNC</Label>
              <Input value={perfil.rnc ?? ''} disabled className="bg-gray-50 text-gray-500 text-sm" />
              <p className="text-xs text-gray-400 mt-1">
                Para cambiar el RNC ve a{' '}
                <Link href="/dashboard/configuracion" className="text-teal-600 hover:underline">Configuración</Link>
              </p>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Razón social <span className="text-red-500">*</span></Label>
              <Input value={razonSocial}
                onChange={e => { setRazonSocial(e.target.value); setErrors(v => ({...v, razonSocial:''})); }}
                placeholder="Mi Empresa SRL"
                className={errors.razonSocial ? 'border-red-400' : ''} />
              {errors.razonSocial && <p className="text-xs text-red-500 mt-1">{errors.razonSocial}</p>}
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Correo de facturación <span className="text-red-500">*</span></Label>
              <Input type="email" value={emailFact}
                onChange={e => { setEmailFact(e.target.value); setErrors(v => ({...v, email:''})); }}
                placeholder="facturacion@empresa.com"
                className={errors.email ? 'border-red-400' : ''} />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Calle y número <span className="text-red-500">*</span></Label>
              <Input value={direccion}
                onChange={e => { setDireccion(e.target.value); setErrors(v => ({...v, direccion:''})); }}
                placeholder="Ej: Calle El Conde #45, Apto 2B"
                className={errors.direccion ? 'border-red-400' : ''} />
              {errors.direccion && <p className="text-xs text-red-500 mt-1">{errors.direccion}</p>}
            </div>
            <ProvinciaMunicipioSelect
              provincia={provincia}
              municipio={municipio}
              onProvinciaChange={v => { setProvincia(v); setErrors(e => ({...e, provincia:'', municipio:''})); }}
              onMunicipioChange={v => { setMunicipio(v); setErrors(e => ({...e, municipio:''})); }}
              required
              errors={errors}
            />
          </div>
        </div>

        {/* Certificado */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Certificado digital P12</h3>
          <div className="rounded-2xl border border-gray-200 p-5 space-y-4">
            <p className="text-xs text-gray-500">
              Emitido por INDOTEL a través de Viafirma, Cámara de Comercio RD o DigiCert.
            </p>

            {certListo ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-teal-500 shrink-0" />
                  <p className="text-sm font-semibold text-teal-800">Certificado activo</p>
                </div>
                {certInfo?.titular && <p className="text-xs text-teal-700">{certInfo.titular}</p>}
                {certInfo?.vencimiento && (
                  <p className="text-xs text-teal-600">Vence: {certInfo.vencimiento}</p>
                )}
                <button className="text-xs text-teal-600 underline underline-offset-2"
                  onClick={() => setCertInfo({ tieneCertificado: false })}>
                  Reemplazar certificado
                </button>
              </div>
            ) : (
              <>
                {!file ? (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`rounded-xl border-2 border-dashed cursor-pointer flex flex-col items-center gap-2 py-8 px-4 text-center transition-colors
                      ${dragging ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'}`}
                  >
                    <CloudUpload className={`h-8 w-8 ${dragging ? 'text-teal-500' : 'text-gray-400'}`} />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Arrastra tu certificado aquí</p>
                      <button type="button" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="text-xs text-teal-600 hover:underline mt-0.5">
                        o selecciona el archivo .p12 / .pfx
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
                    <FileKey className="h-4 w-4 text-teal-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-400">{fmtSize(file.size)}</p>
                    </div>
                    <button onClick={() => { setFile(null); setCertError(null); }}
                      className="p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <input ref={fileInputRef} type="file" accept=".p12,.pfx" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

                <div>
                  <Label className="text-xs mb-1.5 block">Clave del certificado <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Input type={showPass ? 'text' : 'password'} placeholder="Contraseña"
                      value={password} onChange={e => { setPassword(e.target.value); setCertError(null); }}
                      className="pr-10" />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {certError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-700">{certError}</p>
                  </div>
                )}

                <Button onClick={handleUploadCert} disabled={!file || !password || uploadingCert}
                  className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40" size="sm">
                  {uploadingCert
                    ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Guardando…</>
                    : <><KeyRound className="h-3.5 w-3.5 mr-2" />Guardar certificado</>}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <NavFooter
        onNext={async () => { if (!perfilSaved) await handleSavePerfil(); onComplete(); }}
        nextDisabled={!canContinue}
        nextLoading={savingPerfil}
        nextLabel="Guardar y continuar"
      />
      {!canContinue && (
        <p className="text-xs text-gray-400 text-right -mt-2">
          {!perfilCompleto && '• Completa los datos de tu empresa '}
          {!certListo && '• Sube tu certificado P12'}
        </p>
      )}
    </div>
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
    fetch('/api/habilitacion/contexto').then(r => r.json()).then(d => {
      setWebhookBaseUrl(d.webhookBaseUrl ?? '');
    });
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
        if (typeof state.subPaso === 'number') setSub(state.subPaso);
      }).catch(() => { /* silent */ });
    });
  }, []);

  // Cambia de sub-paso y persiste — así recargar la página retoma el mismo
  // sub-paso exacto en el que quedó el usuario, no solo la fase.
  function goToSub(n: number) {
    setSub(n);
    import('@/lib/habilitacion/client').then(({ guardarEstado }) => {
      guardarEstado({ subPaso: n }).catch(() => {});
    });
  }

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

  const STEPS = ['Datos del portal', 'Firma digital', 'Envío al portal'];

  return (
    <div className="space-y-5">

      {/* Stepper */}
      <div className="flex items-center">
        {STEPS.map((label, i) => (
          <div key={i} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                ${i < sub  ? 'bg-teal-600 border-teal-600 text-white'
                : i === sub ? 'bg-white border-teal-600 text-teal-600'
                :             'bg-white border-gray-200 text-gray-400'}`}>
                {i < sub ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap
                ${i === sub ? 'text-teal-700' : i < sub ? 'text-teal-500' : 'text-gray-400'}`}>
                {label.replace(/^\d+\.\s/, '')}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 mx-2 rounded transition-colors
                ${i < sub ? 'bg-teal-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Sub 0: Datos del portal ── */}
      {sub === 0 && (
        <div className="space-y-5">

          {/* 1 — CTA principal: abrir portal */}
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-teal-900">Abre el portal DGII y crea tu postulación</p>
              <p className="text-xs text-teal-700 mt-0.5">
                Sección <strong>Emisor Electrónico → CREAR POSTULACIÓN</strong>.
                Copia los datos de abajo y haz clic en <strong>"Generar archivo"</strong>.
              </p>
            </div>
            <a
              href="https://ecf.dgii.gov.do/testecf/contribuyentes"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors"
            >
              Abrir portal <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* 2 — Formulario estilo portal DGII */}
          <div className="space-y-6">

            {/* Software */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">⚙️ Datos del software de facturación.</p>
                  <p className="text-xs text-gray-500 mt-0.5">Los campos se ven iguales en el sitio de la DGII:</p>
                </div>
                <DgiiScreenshot
                  src="/dgii-guia/paso1-datos-software.png"
                  alt="Formulario de datos del software en el portal DGII"
                  caption="Pega los tres URLs (recepción, aprobación comercial, autenticación) exactamente como aparecen abajo."
                  label="Ver dónde pegar"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <DgiiField label="Tipo de software"            value={EMITEDO.tipoSoftware}   required={false} disabled />
                <DgiiField label="Nombre del software"         value={EMITEDO.nombreSoftware} disabled />
                <DgiiField label="Versión del software"        value={EMITEDO.version}        disabled />
                <DgiiField label="URL de recepción"            value={urls.recepcion}     span="full" isUrl />
                <DgiiField label="URL de aprobación comercial" value={urls.aprobacion}    span="full" isUrl />
                <DgiiField label="URL de autenticación"        value={urls.autenticacion} span="full" isUrl />
              </div>
            </div>

            {/* Proveedor */}
            <div>
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-800">👤 Datos del proveedor electrónico.</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <DgiiField label="RNC / Cédula"   value={EMITEDO.rncProveedor} disabled />
                <DgiiField label="Razón social"    value={EMITEDO.nombreProveedor} span="2" disabled />
                <DgiiField label="Nombre comercial" value={EMITEDO.nombreSoftware} span="full" required={false} disabled />
              </div>
            </div>

          </div>

          <NavFooter onBack={onBack} onNext={() => goToSub(1)} nextLabel="Ya generé el XML" />
        </div>
      )}

      {/* ── Sub 1: Firma XML ── */}
      {sub === 1 && (
        <div className="space-y-4">
          <InfoBox color="blue" title="Carga el Formulario de Postulación">
            En el portal DGII hiciste clic en <strong>"Generar archivo"</strong> y descargaste
            el Formulario de Postulación. Cárgalo aquí — Zero le aplica la Firma Digital automáticamente.
          </InfoBox>

          {/* Paso 1: Cargar Formulario de Postulación */}
          <div className={`rounded-xl border p-5 space-y-4 transition-all
            ${xmlFile ? 'border-teal-200' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                ${xmlFile ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {xmlFile ? <Check className="h-3.5 w-3.5" /> : '1'}
              </div>
              <p className="text-sm font-semibold text-gray-800">Cargar el Formulario de Postulación</p>
            </div>

            {!xmlFile ? (
              <div
                onClick={() => xmlInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed border-gray-200 hover:border-teal-300 hover:bg-gray-50 cursor-pointer flex flex-col items-center gap-2 py-7 px-4 text-center transition-colors"
              >
                <Upload className="h-7 w-7 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Formulario de Postulación (.xml)</p>
                  <p className="text-xs text-gray-400 mt-0.5">El archivo que descargaste del portal DGII · Máx. 2 MB</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
                <FileText className="h-4 w-4 text-teal-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{xmlFile.name}</p>
                  <p className="text-xs text-gray-400">{fmtSize(xmlFile.size)}</p>
                </div>
                {!signed && (
                  <button onClick={() => setXmlFile(null)}
                    className="p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <input ref={xmlInputRef} type="file" accept=".xml" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setXmlFile(f); e.target.value = ''; }} />
          </div>

          {/* Paso 2: Aplicar Firma Digital */}
          <div className={`rounded-xl border p-5 space-y-4 transition-all
            ${signed ? 'border-teal-200' : !xmlFile ? 'border-gray-100 opacity-40' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                ${signed ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {signed ? <Check className="h-3.5 w-3.5" /> : '2'}
              </div>
              <p className="text-sm font-semibold text-gray-800">Aplicar Firma Digital</p>
            </div>
            {!signed ? (
              <Button onClick={handleFirmar} disabled={!xmlFile || signing}
                className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
                {signing
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Aplicando Firma Digital…</>
                  : <><FileSignature className="h-4 w-4" />Aplicar Firma Digital</>}
              </Button>
            ) : (
              <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg p-3 text-teal-800">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <p className="text-sm font-medium">Firma Digital aplicada correctamente</p>
              </div>
            )}
            {signError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="text-xs">{signError}</p>
              </div>
            )}
          </div>

          {/* Paso 3: Descargar Formulario firmado */}
          <div className={`rounded-xl border p-5 space-y-4 transition-all
            ${downloaded ? 'border-teal-200' : !signed ? 'border-gray-100 opacity-40' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                ${downloaded ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {downloaded ? <Check className="h-3.5 w-3.5" /> : '3'}
              </div>
              <p className="text-sm font-semibold text-gray-800">Descargar Formulario firmado</p>
            </div>
            <Button
              variant="outline"
              disabled={!signed || !xmlFirmado}
              onClick={handleDescargar}
              className="w-full gap-2"
            >
              <Download className="h-4 w-4" /> Descargar Formulario firmado
            </Button>
          </div>

          <NavFooter
            onBack={() => goToSub(0)}
            onNext={() => goToSub(2)}
            nextDisabled={!downloaded}
            nextLabel="Ya lo descargué"
          />
        </div>
      )}

      {/* ── Sub 2: Subir al portal DGII ── */}
      {sub === 2 && (
        <div className="space-y-5">
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

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <p className="font-medium mb-0.5">Tras enviar el archivo:</p>
            <p className="text-blue-700">
              DGII te responderá por <strong>Buzón de Oficina Virtual</strong> en <strong>1 a 3 días hábiles</strong>.
              Si la postulación es aprobada se habilita el Set de Pruebas; si es rechazada, DGII te indica qué corregir.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={uploadConfirmed}
              onChange={e => handleConfirmarSubida(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm text-gray-700">
              Realicé el Envío de archivo de declaración jurada firmado en el portal DGII
            </span>
          </label>

          <NavFooter
            onBack={() => goToSub(1)}
            onNext={onComplete}
            nextDisabled={!uploadConfirmed}
            nextLabel="Continuar a Pruebas de Datos e-CF"
          />
        </div>
      )}
    </div>
  );
}

// ─── Phase 1: Pruebas de Datos e-CF ───────────────────────────────────────────
// Set de Pruebas DGII: se sube el Excel oficial, el contribuyente se resuelve
// por RNCEmisor dentro del archivo (no hace falta pasarlo). Reusa las rutas
// team-scoped /api/habilitacion/set-pruebas/*. Réplica funcional completa de
// Step2Body en app/admin/empresas/[id]/_habilitacion-stepper.tsx.

interface SetPruebasCase {
  eNcf?: string;
  tipoECF?: string;
  formato?: string;
  status?: string;
  estadoDgii?: string;
  error?: string;
  mensajesDgii?: string[];
}

interface SetPruebasRun {
  importId: string;
  status: 'PENDIENTE' | 'PROCESANDO' | 'COMPLETO' | 'FALLIDO' | string;
  total?: number;
  ok?: number;
  failed?: number;
  skipped?: number;
  errorMessage?: string;
  rows?: SetPruebasCase[];
}

function PhasePruebas({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file,       setFile]       = useState<File | null>(null);
  const [skipEncfs,  setSkipEncfs]  = useState('');
  const [uploading,  setUploading]  = useState(false);
  const [run,        setRun]        = useState<SetPruebasRun | null>(null);
  const [polling,    setPolling]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  // Excel ya importado antes (ej. intento anterior interrumpido por un error de red)
  const [dupRunId,   setDupRunId]   = useState<string | null>(null);
  const [deleting,   setDeleting]   = useState(false);
  const [reemitting, setReemitting] = useState(false);
  const [showSkipEncfs,   setShowSkipEncfs]   = useState(false);
  const [alertSent,       setAlertSent]       = useState(false);
  const [confirmedUpload, setConfirmedUpload] = useState(false);
  // Marca cuando el usuario ya inició una acción propia (subir/reiniciar) —
  // evita que el fetch de "retomar corrida persistida" (async, puede resolver
  // tarde) pise ese estado con datos de una corrida vieja.
  const userActedRef = useRef(false);

  const persistRun = useCallback(async (runId: string, status: string) => {
    const { guardarEstado } = await import('@/lib/habilitacion/client');
    await guardarEstado({ pruebas: { setPruebasRunId: runId, setPruebasStatus: status } }).catch(e => {
      console.error('[set-pruebas] no se pudo persistir el estado del run', runId, e);
    });
  }, []);

  const fetchRun = useCallback(async (runId: string, opts?: { skipIfActed?: boolean }) => {
    try {
      const res = await fetch(`/api/habilitacion/set-pruebas/runs/${runId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error consultando la corrida');
      if (opts?.skipIfActed && userActedRef.current) return null;
      setRun(data as SetPruebasRun);
      await persistRun(runId, data.status);
      return data.status as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error consultando la corrida');
      return null;
    }
  }, [persistRun]);

  // Retomar corrida persistida al recargar la página
  useEffect(() => {
    import('@/lib/habilitacion/client').then(({ cargarEstado }) => {
      cargarEstado().then(({ state }) => {
        const runId = state.pruebas?.setPruebasRunId;
        if (runId && !userActedRef.current) fetchRun(runId, { skipIfActed: true });
      }).catch(() => { /* silent */ });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-poll mientras la corrida no llegó a un estado terminal.
  // OJO: el status recién creada la corrida puede venir undefined (no es
  // "PENDIENTE" ni "PROCESANDO" literal) — por eso se poll por defecto y solo
  // se detiene al ver un estado terminal explícito, nunca al revés.
  useEffect(() => {
    if (!run?.importId) { setPolling(false); return; }
    if (run.status === 'COMPLETO' || run.status === 'FALLIDO') { setPolling(false); return; }
    setPolling(true);
    const timer = setTimeout(() => fetchRun(run.importId), 5000);
    return () => clearTimeout(timer);
  }, [run?.importId, run?.status, fetchRun]);

  function handleFile(f: File) {
    if (!f.name.match(/\.xlsx$/i)) { setError('Debe ser un archivo .xlsx'); return; }
    if (f.size > 20_000_000)        { setError('Máximo 20 MB'); return; }
    setFile(f);
    setError(null);
  }

  async function findDuplicateRun() {
    try {
      const res = await fetch('/api/habilitacion/set-pruebas/runs');
      const data = await res.json().catch(() => ({}));
      const runs: Array<{ importId: string; sourceFilename?: string }> = data.runs ?? [];
      // Match por nombre de archivo; si no, la corrida más reciente (probable intento anterior)
      const match = runs.find(r => r.sourceFilename === file?.name) ?? runs[0];
      if (match) setDupRunId(match.importId);
    } catch {
      // silencioso — el botón de borrar/re-emitir simplemente no aparecerá
    }
  }

  async function handleDeleteDuplicate() {
    if (!dupRunId) return;
    if (!confirm('¿Borrar la corrida previa (con purga de emisiones) para re-subir el Excel?')) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/habilitacion/set-pruebas/runs/${dupRunId}?purgeEmisiones=true`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al borrar la corrida previa');
      setDupRunId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al borrar la corrida previa');
    } finally {
      setDeleting(false);
    }
  }

  // Re-emite todos los casos de una corrida (la duplicada, o la activa) SIN
  // borrarla ni re-subir el Excel — útil cuando el intento anterior falló por
  // red a mitad de camino.
  async function reemitirRun(runId: string) {
    userActedRef.current = true;
    setReemitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/habilitacion/set-pruebas/runs/${runId}/emitir-todos`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al re-emitir la corrida');
      setDupRunId(null);
      setFile(null);
      setRun({ importId: runId, ...data });
      await persistRun(runId, data.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al re-emitir la corrida');
    } finally {
      setReemitting(false);
    }
  }

  function handleForgetRun() {
    if (!confirm('¿Olvidar esta corrida solo aquí? (no se borra en ecf-api)')) return;
    userActedRef.current = true;
    setRun(null);
    setError(null);
    persistRun('', '').catch(() => {});
  }

  async function handleDeleteRun() {
    if (!run?.importId) return;
    if (!confirm('¿BORRAR la corrida en ecf-api? Elimina casos, comparaciones y purga emisiones (re-correr limpio). Irreversible.')) return;
    userActedRef.current = true;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/habilitacion/set-pruebas/runs/${run.importId}?purgeEmisiones=true`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al borrar la corrida');
      setRun(null);
      await persistRun('', '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al borrar la corrida');
    } finally {
      setDeleting(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    userActedRef.current = true;
    setUploading(true);
    setError(null);
    setDupRunId(null);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      if (skipEncfs.trim()) fd.append('skipEncfs', skipEncfs.trim());
      const res = await fetch('/api/habilitacion/set-pruebas/runs', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Excel ya importado antes → buscar esa corrida para ofrecer borrar/re-emitir
        if ((data.error ?? '').toLowerCase().includes('importado')) {
          await findDuplicateRun();
        }
        throw new Error(data.error ?? 'Error al subir el Excel');
      }
      setRun({ importId: data.importId, status: data.status });
      setFile(null);
      await persistRun(data.importId, data.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir el Excel');
    } finally {
      setUploading(false);
    }
  }

  // Derivados
  const runId = run?.importId ?? null;
  const isComplete = run?.status === 'COMPLETO' || run?.status === 'FALLIDO';
  const failedCases = run?.rows?.filter(r =>
    r.estadoDgii === 'RECHAZADO' ||
    r.estadoDgii === 'ERROR' ||
    (r.status === 'FAILED' && !r.estadoDgii),
  ) ?? [];
  const failedEncfs = failedCases.map(c => c.eNcf).filter(Boolean) as string[];
  const hasErrors = isComplete && (run?.status === 'FALLIDO' || failedCases.length > 0);
  const isWaiting = uploading || (!!runId && !isComplete);

  // Alerta a Slack (una sola vez) cuando la corrida termina con casos fallidos
  useEffect(() => {
    if (!hasErrors || alertSent || !runId) return;
    setAlertSent(true);
    fetch('/api/habilitacion/set-pruebas/alertar-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId,
        detalle: `${failedCases.length} caso(s) fallido(s): ${failedEncfs.join(', ') || 'sin e-NCF'}`,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasErrors, alertSent, runId]);

  function handleReiniciar() {
    setConfirmedUpload(false);
    setAlertSent(false);
    if (run?.importId) handleDeleteRun();
    else handleForgetRun();
  }

  // ── Sub-paso: subir Excel (solo cuando no hay corrida activa) ──
  if (!runId && !uploading) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-blue-900 leading-relaxed">
            <p>
              Etapa en la que se comprueba la capacidad de su sistema para generar
              Comprobantes Fiscales Electrónicos (e-CF), con datos suministrados por DGII.
            </p>
            <ul className="list-disc ml-5 mt-1.5 space-y-1">
              <li>
                Descarga el <strong>Excel (Set de pruebas)</strong> del portal DGII, súbelo aquí y el
                sistema emite los casos automáticamente con el cert del contribuyente (resuelto por{' '}
                <code className="bg-blue-100 px-1 rounded font-mono text-xs">RNCEmisor</code> del Excel).
              </li>
              <li>
                Las FC <strong>&lt; RD$250,000</strong> NO se envían por API: se descargan en ZIP y se
                suben manual al portal DGII.
              </li>
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800">Subir Excel del Set de Pruebas</p>

          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-gray-200 hover:border-teal-300 hover:bg-gray-50 cursor-pointer flex flex-col items-center gap-2 py-7 px-4 text-center transition-colors"
            >
              <Upload className="h-7 w-7 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-700">Excel del Set de Pruebas (.xlsx)</p>
                <p className="text-xs text-gray-400 mt-0.5">Ambiente: CerteCF · Excel .xlsx, máx 20 MB</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
              <FileText className="h-4 w-4 text-teal-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                <p className="text-xs text-gray-400">{fmtSize(file.size)}</p>
              </div>
              <button onClick={() => setFile(null)}
                className="p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSkipEncfs}
              onChange={e => setShowSkipEncfs(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-xs text-gray-600">Excluir e-NCFs específicos</span>
          </label>

          {showSkipEncfs && (
            <div>
              <Label className="text-xs mb-1.5 block">Excluir e-NCFs (opcional)</Label>
              <Input
                value={skipEncfs}
                onChange={e => setSkipEncfs(e.target.value)}
                placeholder="E320000000012,E320000000015"
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                CSV de e-NCF a saltar. Útil para re-subir el Excel omitiendo los que ya fallaron.
              </p>
            </div>
          )}

          {error && !dupRunId && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {dupRunId ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
              <p className="text-xs text-amber-800">
                Ese Excel (o uno con el mismo contenido) ya fue subido antes — probablemente de un
                intento anterior que no terminó. Corrida existente: <code className="font-mono">{dupRunId}</code>.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={() => reemitirRun(dupRunId)} disabled={reemitting || deleting}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 gap-2" size="sm">
                  {reemitting
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Re-emitiendo…</>
                    : <><RefreshCw className="h-3.5 w-3.5" />Continuar esa corrida</>}
                </Button>
                <Button onClick={handleDeleteDuplicate} disabled={reemitting || deleting}
                  variant="outline" className="flex-1 gap-2" size="sm">
                  {deleting
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Borrando…</>
                    : <><X className="h-3.5 w-3.5" />Borrar y re-subir</>}
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={handleUpload} disabled={!file || uploading}
              className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
              {uploading
                ? <><Loader2 className="h-4 w-4 animate-spin" />Procesando…</>
                : <><Upload className="h-4 w-4" />Procesar Set de Pruebas</>}
            </Button>
          )}
        </div>

        <NavFooter onBack={onBack} onNext={onComplete} nextDisabled />
      </div>
    );
  }

  // ── Sub-paso: pantalla de espera (mientras DGII procesa) ──
  if (isWaiting) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-100 bg-white p-14 flex flex-col items-center text-center gap-4">
          <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
            <Clock className="h-8 w-8 text-emerald-500" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">En proceso</p>
            <p className="text-sm text-gray-500 mt-1.5 max-w-md">
              Estamos esperando que la DGII procese tus pruebas de simulación correctamente.
              Puede tomar unos minutos.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <NavFooter onBack={onBack} onNext={onComplete} nextDisabled />
      </div>
    );
  }

  // ── Sub-paso: resultado con errores ──
  if (hasErrors) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-100 bg-white p-14 flex flex-col items-center text-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-50 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-gray-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">Hubo un error en las pruebas</p>
            <p className="text-sm text-gray-500 mt-1.5 max-w-md">
              Comunícate con nuestro equipo de soporte:{' '}
              <a href="mailto:alexander.ferreras@yisraeltech.com" className="font-semibold underline text-gray-700">
                alexander.ferreras@yisraeltech.com
              </a>
            </p>
          </div>
          <Button onClick={handleReiniciar} disabled={deleting} variant="outline" className="gap-2">
            {deleting
              ? <><Loader2 className="h-4 w-4 animate-spin" />Reiniciando…</>
              : <><RefreshCw className="h-4 w-4" />Intentar de nuevo</>}
          </Button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <NavFooter onBack={onBack} onNext={onComplete} nextDisabled />
      </div>
    );
  }

  // ── Sub-paso: resultado exitoso ──
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 flex flex-col items-center text-center gap-3">
        <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle className="h-7 w-7 text-emerald-600" />
        </div>
        <div>
          <p className="text-base font-semibold text-emerald-800">Envío exitoso — verifica en el portal DGII</p>
          <p className="text-sm text-emerald-700 mt-1.5 max-w-md">
            Para continuar descarga las facturas de consumo (&lt; RD$250,000) y súbelas al portal DGII.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-5 space-y-3">
        <a
          href={`/api/habilitacion/set-pruebas/runs/${runId}/manual-upload/zip`}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2"
        >
          <Download className="h-4 w-4" /> Descargar ZIP Facturas &lt; RD$250K
        </a>
        <p className="text-xs text-gray-500 text-center">
          Descomprime y sube cada XML al portal DGII en <strong>"Facturas de consumo &lt; 250Mil"</strong>.
        </p>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
        <p className="text-sm text-blue-800">
          Si la DGII rechaza las facturas subidas será necesario reiniciar las pruebas.
        </p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmedUpload}
            onChange={e => setConfirmedUpload(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-sm text-blue-900">
            Confirmo que subí las facturas al portal DGII
          </span>
        </label>
      </div>

      <button onClick={handleReiniciar} disabled={deleting} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 disabled:opacity-50">
        {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Reiniciar pruebas
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <NavFooter onBack={onBack} onNext={onComplete} nextDisabled={!confirmedUpload} nextLabel="Continuar" />
    </div>
  );
}

// ─── Phase 2: Representaciones impresas (con espera DGII) ────────────────────

interface AprobResultRow {
  eNcf?: string;
  error?: string;
  estadoDgii?: string;
  estadoEnvio?: string;
  trackId?: string;
}

interface AprobResult {
  total: number;
  ok: number;
  failed: number;
  rows?: AprobResultRow[];
}

function PhaseImpresa({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file,       setFile]       = useState<File | null>(null);
  const [secShiftEncfs, setSecShiftEncfs] = useState('');
  const [showSecShift,  setShowSecShift]  = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [result,     setResult]     = useState<AprobResult | null>(null);

  function handleFile(f: File) {
    if (!f.name.match(/\.xlsx$/i)) { setError('Debe ser un archivo .xlsx'); return; }
    if (f.size > 20_000_000)        { setError('Máximo 20 MB'); return; }
    setFile(f);
    setError(null);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      if (secShiftEncfs.trim()) fd.append('secShiftEncfs', secShiftEncfs.trim());
      const res = await fetch('/api/habilitacion/set-pruebas/aprobaciones', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al procesar las aprobaciones');
      setResult(data as AprobResult);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar las aprobaciones');
    } finally {
      setUploading(false);
    }
  }

  function handleReiniciar() {
    setResult(null);
    setError(null);
  }

  const failedRows = (result?.rows ?? []).filter(r =>
    !!r.error || r.estadoDgii === 'RECHAZADO' || r.estadoDgii === 'ERROR' ||
    (r.estadoEnvio && !/acept/i.test(r.estadoEnvio)),
  );
  const hasErrors = !!result && failedRows.length > 0;
  const isSuccess = !!result && !hasErrors;

  // ── Sub-paso: pantalla de espera (mientras se procesa la subida) ──
  if (uploading) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-100 bg-white p-14 flex flex-col items-center text-center gap-4">
          <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
            <Clock className="h-8 w-8 text-emerald-500" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">En proceso</p>
            <p className="text-sm text-gray-500 mt-1.5 max-w-md">
              La DGII se encuentra procesando tus Aprobaciones Comerciales. Este proceso puede
              tomar unos minutos, no cierres ni recargues esta página.
            </p>
          </div>
        </div>

        <NavFooter onBack={onBack} onNext={onComplete} nextDisabled />
      </div>
    );
  }

  // ── Sub-paso: resultado con errores ──
  if (hasErrors) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-100 bg-white p-14 flex flex-col items-center text-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-50 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-gray-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">Hubo un error en las pruebas</p>
            <p className="text-sm text-gray-500 mt-1.5 max-w-md">
              Comunícate con nuestro equipo de soporte:{' '}
              <a href="mailto:alexander.ferreras@yisraeltech.com" className="font-semibold underline text-gray-700">
                alexander.ferreras@yisraeltech.com
              </a>
            </p>
          </div>
          <Button onClick={handleReiniciar} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Intentar de nuevo
          </Button>
        </div>

        <NavFooter onBack={onBack} onNext={onComplete} nextDisabled />
      </div>
    );
  }

  // ── Sub-paso: resultado exitoso ──
  if (isSuccess) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 flex flex-col items-center text-center gap-3">
          <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle className="h-7 w-7 text-emerald-600" />
          </div>
          <div>
            <p className="text-base font-semibold text-emerald-800">Envío exitoso — verifica en el portal DGII</p>
            <p className="text-sm text-emerald-700 mt-1.5 max-w-md">
              {result?.ok}/{result?.total} aprobaciones aceptadas por la DGII.
            </p>
          </div>
        </div>

        <button onClick={handleReiniciar} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <RefreshCw className="h-3 w-3" /> Reiniciar pruebas
        </button>

        <NavFooter onBack={onBack} onNext={onComplete} nextLabel="Continuar" />
      </div>
    );
  }

  // ── Sub-paso: subir Excel de Aprobaciones Comerciales ──
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="flex-1 text-sm text-blue-900 leading-relaxed">
          <p>
            Etapa en la que se comprueba la capacidad de su sistema para generar
            Aprobaciones Comerciales (ACECF), con datos suministrados por DGII.
          </p>
          <ul className="list-disc ml-5 mt-1.5 space-y-1">
            <li>Descarga <strong>"Aprobaciones Comerciales"</strong> del portal DGII (archivo distinto al del paso anterior) y súbelo aquí.</li>
            <li>Cada ACECF se firma con el cert del <strong>RNCComprador</strong> (derivado del Excel) y se envía a DGII. Proceso síncrono.</li>
            <li>Para certificar deben enviarse satisfactoriamente <strong>todas</strong> las aprobaciones generadas.</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-800">Subir Excel de Aprobaciones Comerciales</p>

        {!file ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-gray-200 hover:border-teal-300 hover:bg-gray-50 cursor-pointer flex flex-col items-center gap-2 py-7 px-4 text-center transition-colors"
          >
            <Upload className="h-7 w-7 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Excel de Aprobaciones Comerciales (.xlsx)</p>
              <p className="text-xs text-gray-400 mt-0.5">Hoja ACEECF_Generadas · Excel .xlsx, máx 20 MB</p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
            <FileText className="h-4 w-4 text-teal-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-400">{fmtSize(file.size)}</p>
            </div>
            <button onClick={() => setFile(null)}
              className="p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showSecShift}
            onChange={e => setShowSecShift(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-xs text-gray-600">Shift selectivo de fecha</span>
        </label>

        {showSecShift && (
        <div>
          <Label className="text-xs mb-1.5 block">Shift selectivo de fecha (opcional)</Label>
          <Input
            value={secShiftEncfs}
            onChange={e => setSecShiftEncfs(e.target.value)}
            placeholder="E450000000010,E330000000001"
            className="font-mono text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            CSV de e-NCF — ajusta FechaHoraAprobacionComercial si DGII lo pide al re-enviar.
          </p>
        </div>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <Button onClick={handleUpload} disabled={!file || uploading}
          className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
          <Upload className="h-4 w-4" />Procesar Aprobaciones
        </Button>
      </div>

      <NavFooter onBack={onBack} onNext={onComplete} nextDisabled />
    </div>
  );
}

// ─── Phase: Pruebas de Simulación e-CF (idéntico a /admin Step4Body) ─────────
// Genera 29 e-CF sintéticos (sin Excel) y los envía a DGII. cp-scoped.

// Shape real de /contribuyentes/{cp}/pruebas-simulacion/* — DISTINTO del de
// /set-pruebas/*: usa `runId` (start usa `importId`), `estado` por fila (no
// `estadoDgii`/`status`), y `byEstado` en vez de ok/failed. Confirmado por
// probing directo a ecf-api (ver scripts/probe-simulacion-run.ts).
interface SimulacionRow {
  tipoECF?: string;
  formato?: string;
  paso?: number;
  estado?: string;
  eNcf?: string;
  trackId?: string | null;
  emisionId?: string;
  mensajesDgii?: Array<{ valor?: string; codigo?: number }> | null;
}

interface SimulacionRun {
  importId?: string;
  runId?:    string;
  total?:    number;
  byEstado?: Record<string, number>;
  skipped?:  number;
  errors?:   unknown[];
  rows?:     SimulacionRow[];
}

function PhaseSimulacion({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [ncfStart, setNcfStart] = useState(500);
  const [starting, setStarting] = useState(false);
  const [run,      setRun]      = useState<SimulacionRun | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  // Evita que el fetch de "retomar corrida persistida" (async) pise el
  // estado si el usuario ya inició (iniciar/reiniciar) mientras resolvía.
  const userActedRef = useRef(false);

  const persistRun = useCallback(async (runId: string, status: string) => {
    const { guardarEstado } = await import('@/lib/habilitacion/client');
    await guardarEstado({ simulacion: { runId, status } }).catch(e => {
      console.error('[simulacion] no se pudo persistir el estado del run', runId, e);
    });
  }, []);

  const fetchRun = useCallback(async (runId: string, opts?: { skipIfActed?: boolean }) => {
    try {
      const res = await fetch(`/api/habilitacion/simulacion/runs/${runId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error consultando la simulación');
      if (opts?.skipIfActed && userActedRef.current) return null;
      setRun(data as SimulacionRun);
      const pend = data.byEstado?.PENDIENTE ?? 0;
      const status = pend > 0 ? 'PROCESANDO' : 'COMPLETO';
      await persistRun(runId, status);
      return status;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error consultando la simulación');
      return null;
    }
  }, [persistRun]);

  // Retomar corrida persistida al recargar la página
  useEffect(() => {
    import('@/lib/habilitacion/client').then(({ cargarEstado }) => {
      cargarEstado().then(({ state }) => {
        const runId = state.simulacion?.runId;
        if (runId && !userActedRef.current) fetchRun(runId, { skipIfActed: true });
      }).catch(() => { /* silent */ });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeRunId = run ? (run.runId ?? run.importId ?? null) : null;
  // Las FC <RD$250,000 no se envían por API (se suben manual al portal DGII)
  // — su fila "ECF" duplicada nunca recibe trackId y queda PENDIENTE para
  // siempre en ecf-api. No deben bloquear la finalización de la corrida.
  const pendientes = run?.rows?.filter(r => r.estado === 'PENDIENTE' && r.trackId != null).length ?? 0;
  const hasResultado = !!run && ((run.rows?.length ?? 0) > 0 || Object.keys(run.byEstado ?? {}).length > 0);

  // Auto-poll mientras queden filas PENDIENTE (DGII sigue procesando).
  useEffect(() => {
    if (!activeRunId) return;
    if (hasResultado && pendientes === 0) return;
    const timer = setTimeout(() => fetchRun(activeRunId), 5000);
    return () => clearTimeout(timer);
  }, [activeRunId, hasResultado, pendientes, fetchRun]);

  async function handleStart() {
    userActedRef.current = true;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/habilitacion/simulacion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ncfStart }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al iniciar la simulación');
      setRun(data as SimulacionRun);
      const id = data.runId ?? data.importId;
      if (id) await persistRun(id, (data.byEstado?.PENDIENTE ?? 0) > 0 ? 'PROCESANDO' : 'COMPLETO');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al iniciar la simulación');
    } finally {
      setStarting(false);
    }
  }

  async function handleReiniciar() {
    userActedRef.current = true;
    setError(null);
    setStarting(true);
    try {
      const res = await fetch('/api/habilitacion/simulacion/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ncfBump: 100 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al reiniciar');
      setRun(data as SimulacionRun);
      const id = data.runId ?? data.importId;
      if (id) await persistRun(id, (data.byEstado?.PENDIENTE ?? 0) > 0 ? 'PROCESANDO' : 'COMPLETO');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al reiniciar');
    } finally {
      setStarting(false);
    }
  }

  const runId = activeRunId;
  const isComplete = !!runId && hasResultado && pendientes === 0;
  const isWaiting  = starting || (!!runId && !isComplete);
  const rows = run?.rows ?? [];
  const failedCases = rows.filter(r => r.estado === 'RECHAZADO' || r.estado === 'ERROR');
  const hasErrors = isComplete && (failedCases.length > 0 || (run?.errors?.length ?? 0) > 0);

  // ── Sub-paso: pantalla de espera ──
  if (isWaiting) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-100 bg-white p-14 flex flex-col items-center text-center gap-4">
          <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
            <Clock className="h-8 w-8 text-emerald-500" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">En proceso</p>
            <p className="text-sm text-gray-500 mt-1.5 max-w-md">
              Estamos esperando que la DGII procese tus pruebas de simulación correctamente.
              Puede tomar unos minutos.
            </p>
          </div>
        </div>

        <NavFooter onBack={onBack} onNext={onComplete} nextDisabled />
      </div>
    );
  }

  // ── Sub-paso: resultado con errores ──
  if (hasErrors) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-100 bg-white p-14 flex flex-col items-center text-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-50 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-gray-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">Hubo un error en las pruebas</p>
            <p className="text-sm text-gray-500 mt-1.5 max-w-md">
              Comunícate con nuestro equipo de soporte:{' '}
              <a href="mailto:alexander.ferreras@yisraeltech.com" className="font-semibold underline text-gray-700">
                alexander.ferreras@yisraeltech.com
              </a>
            </p>
          </div>
          <Button onClick={handleReiniciar} disabled={starting} variant="outline" className="gap-2">
            {starting
              ? <><Loader2 className="h-4 w-4 animate-spin" />Reiniciando…</>
              : <><RefreshCw className="h-4 w-4" />Intentar de nuevo</>}
          </Button>
        </div>

        <NavFooter onBack={onBack} onNext={onComplete} nextDisabled />
      </div>
    );
  }

  // ── Sub-paso: resultado exitoso ──
  if (isComplete) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-gray-100 bg-white p-14 flex flex-col items-center text-center gap-4">
          <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">Envío exitoso — verifica en el portal DGII</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 p-5 space-y-3">
          <a
            href={`/api/habilitacion/set-pruebas/runs/${runId}/manual-upload/zip`}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Descargar ZIP Facturas &lt; RD$250K
          </a>
          <p className="text-xs text-gray-500 text-center">
            Descomprime y sube cada XML al portal DGII en <strong>"Facturas de consumo &lt; 250Mil"</strong>.
          </p>
        </div>

        <button onClick={handleReiniciar} disabled={starting} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <RefreshCw className="h-3 w-3" /> Reiniciar pruebas
        </button>

        <NavFooter onBack={onBack} onNext={onComplete} nextLabel="Continuar" />
      </div>
    );
  }

  // ── Sub-paso: iniciar simulación ──
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="flex-1 text-sm text-blue-900 leading-relaxed">
          <p>
            Pruebas de Simulación: el sistema genera <strong>29 e-CF sintéticos</strong> y
            los envía a DGII con el cert del contribuyente. No requiere Excel.
          </p>
          <ul className="list-disc ml-5 mt-1.5 space-y-1">
            <li>Cada tipo usa un rango de NCF 1–10,000,000; los NCF rechazados no se reutilizan.</li>
            <li>Las FC <strong>&lt; RD$250,000</strong> se descargan en ZIP y se suben manual al portal DGII.</li>
            <li>Si DGII rechaza, usa <strong>Re-iniciar</strong> para correr con NCFs frescos (+100).</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-800">Iniciar simulación</p>

        <div>
          <Label className="text-xs mb-1.5 block">NCF inicial</Label>
          <Input
            type="number"
            value={ncfStart}
            onChange={e => setNcfStart(parseInt(e.target.value, 10) || 500)}
            min={1}
            className="font-mono text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">Usa un valor alto/fresco (500+) para no chocar con eNCF ya quemados.</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <Button onClick={handleStart} disabled={starting}
          className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
          {starting
            ? <><Loader2 className="h-4 w-4 animate-spin" />Iniciando…</>
            : <><FlaskConical className="h-4 w-4" />Iniciar simulación (29 casos)</>}
        </Button>
      </div>

      <NavFooter onBack={onBack} onNext={onComplete} nextDisabled />
    </div>
  );
}

// ─── Phase: Pruebas de Simulación Representación Impresa (idéntico a /admin Step5Body) ───
// Subida MANUAL al portal DGII. El API solo entrega los PDF (con QR correcto).
// Reusa el runId persistido del paso de Simulación (Paso 4).

function PhaseRepresentacionSimulacion({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [runId,   setRunId]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/habilitacion/client').then(({ cargarEstado }) => {
      cargarEstado()
        .then(({ state }) => { if (!cancelled) setRunId(state.simulacion?.runId ?? null); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, []);

  if (!loading && !runId) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold mb-0.5">Completa el paso 4 primero</p>
            <p>Las representaciones impresas (PDF) salen de los e-CF emitidos en la Simulación (paso 4).</p>
          </div>
        </div>
        <NavFooter onBack={onBack} onNext={onComplete} nextDisabled />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="flex-1 text-sm text-blue-900 leading-relaxed">
          <p>
            Genera y envía las Representaciones Impresas (PDF) de los e-CF del paso 4.
            La subida es <strong>manual en el portal DGII</strong> — el sistema solo entrega los PDF con el QR correcto.
          </p>
          <ul className="list-disc ml-5 mt-1.5 space-y-1">
            <li>Descarga el paquete, descomprime y sube un PDF de cada tipo en el portal (Paso 5 → ENVIAR ARCHIVOS).</li>
            <li>La suma de archivos no puede superar <strong>10MB</strong>.</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-800">Descargar representaciones (PDF)</p>
        <a
          href={`/api/habilitacion/set-pruebas/runs/${runId}/package?pdfOnly=true`}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2"
        >
          <Download className="h-4 w-4" /> Descargar PDFs
        </a>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs text-gray-600 leading-relaxed">
          El paquete incluye el PDF de los tipos <strong>31, 32 (≥RD$250mil y &lt;RD$250mil), 33, 34,
          41, 43, 44, 45, 46 y 47</strong>. Asegúrate de subir cada tipo en la sección que corresponda
          del portal DGII, según lo que especifique la DGII, para evitar errores.
        </p>
      </div>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">
          Es responsabilidad del contribuyente que la representación impresa cumpla con la Ley 32-23
          y la documentación técnica del Formato de e-CF.
        </p>
      </div>

      <NavFooter onBack={onBack} onNext={onComplete} />
    </div>
  );
}

// ─── Phase: URL Servicios Prueba (idéntico a /admin UrlServiciosBody, produccion=false) ───

function PhaseUrlServiciosPrueba({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('');

  useEffect(() => {
    fetch('/api/ecf/urls-dgii').then(r => r.json()).then(d => setWebhookBaseUrl(d.webhookBaseUrl ?? ''));
  }, []);

  const value = webhookBaseUrl || 'Cargando…';

  return (
    <div className="space-y-5">
      <InfoBox color="blue" title="URLs para el ambiente de pruebas">
        Etapa en la que deben ser validadas y/o actualizadas las URL de los servicios de
        Recepción, Aprobación Comercial y Autenticación. Pega la misma URL en cada campo del
        portal DGII — el portal añade el sufijo (<code>/fe/recepcion/api/ecf</code>, etc.) automáticamente.
      </InfoBox>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">
          <Link2 className="h-4 w-4 text-gray-400" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">URLs para confirmación</p>
        </div>
        <div className="px-4 divide-y divide-gray-50">
          <CopyRow label="Servicio de Autenticación"        value={value} />
          <CopyRow label="Servicio de Recepción"             value={value} />
          <CopyRow label="Servicio de Aprobación Comercial"  value={value} />
        </div>
      </div>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">
          Tras pegar las URLs en el portal DGII, haz clic en <strong>"Confirmar URLs"</strong> ahí,
          luego continúa aquí.
        </p>
      </div>

      <NavFooter onBack={onBack} onNext={onComplete} />
    </div>
  );
}

// ─── Phase: Validación Representación Impresa (idéntico a /admin PasoPasivoBody id=6) ───
// Paso pasivo — DGII valida los PDFs subidos en el paso anterior. Sin acción en el sistema.

function PhaseValidacionRepresentacionImpresa({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-14 flex flex-col items-center text-center gap-4">
        <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
          <ScanLine className="h-8 w-8 text-blue-500" />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900">Validación de la Representación Impresa</p>
          <p className="text-sm text-gray-500 mt-1.5 max-w-md">
            DGII valida las representaciones impresas (PDF) subidas en el paso anterior. No requiere
            acción en el sistema — espera la confirmación en el portal DGII.
          </p>
        </div>
      </div>

      <NavFooter onBack={onBack} onNext={onComplete} />
    </div>
  );
}

// ─── Phases 8-11: acción en portal DGII + DGII valida (idéntico a /admin PortalStepBody) ───
// Pasivos — no hay backend propio que llamar, solo instrucciones + link al portal.

const PORTAL_STEP_INFO: Record<number, { icon: React.ComponentType<{ className?: string }>; intro: string; accion: string; valida: string }> = {
  8: {
    icon: PlayCircle,
    intro: 'Inicio de la prueba de Recepción de e-CF. DGII enviará e-CF de prueba a tu Servicio de Recepción.',
    accion: 'En el portal DGII haz clic en "Enviar prueba de recepción e-CF".',
    valida: 'DGII enviará los comprobantes a tu webhook de recepción registrado en el paso anterior.',
  },
  9: {
    icon: Mail,
    intro: 'Recepción de e-CF. DGII valida que tu servicio recibió y respondió correctamente los e-CF de prueba.',
    accion: 'No requiere acción en el sistema — el flujo ocurre entre DGII y tu Servicio de Recepción.',
    valida: 'DGII valida las respuestas que devolvió tu servicio. Verifica el estatus en el portal.',
  },
  10: {
    icon: PlayCircle,
    intro: 'Inicio de la prueba de Recepción de Aprobación Comercial.',
    accion: 'En el portal DGII haz clic en "Enviar prueba de aprobaciones comerciales".',
    valida: 'DGII enviará las aprobaciones comerciales de prueba a tu webhook registrado.',
  },
  11: {
    icon: CheckCircle,
    intro: 'Recepción de Aprobación Comercial. DGII valida que tu servicio procesó las aprobaciones recibidas.',
    accion: 'No requiere acción en el sistema — el flujo ocurre entre DGII y tu Servicio de Aprobación Comercial.',
    valida: 'DGII valida el procesamiento. Verifica el estatus en el portal DGII.',
  },
};

function PhasePortalStep({ stepId, onComplete, onBack }: { stepId: number; onComplete: () => void; onBack: () => void }) {
  const [ambiente, setAmbiente] = useState<string | null>(null);
  const info = PORTAL_STEP_INFO[stepId];
  const Icon = info.icon;

  useEffect(() => {
    fetch('/api/habilitacion/contexto').then(r => r.json()).then(d => setAmbiente(d.ambiente ?? null)).catch(() => {});
  }, []);

  const portalUrl = ambiente === 'Produccion'
    ? 'https://ecf.dgii.gov.do/ecf/contribuyentes'
    : ambiente === 'CerteCF'
      ? 'https://ecf.dgii.gov.do/certecf/contribuyentes'
      : 'https://ecf.dgii.gov.do/testecf/contribuyentes';

  return (
    <div className="space-y-5">
      <InfoBox color="blue" title="">{info.intro}</InfoBox>

      <div className="space-y-3">
        <div className="flex items-start gap-2.5">
          <span className="shrink-0 h-6 w-6 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">1</span>
          <p className="text-sm text-gray-700 flex-1">{info.accion}</p>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="shrink-0 h-6 w-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center">2</span>
          <p className="text-sm text-gray-600 flex-1">{info.valida}</p>
        </div>
      </div>

      <a
        href={portalUrl}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg"
      >
        <Icon className="h-4 w-4" /> Abrir portal DGII <ExternalLink className="h-3.5 w-3.5" />
      </a>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">
          Cuando DGII confirme este paso en el portal, continúa aquí.
        </p>
      </div>

      <NavFooter onBack={onBack} onNext={onComplete} />
    </div>
  );
}

// ─── Phase: Verificación Estatus (idéntico a /admin PasoPasivoBody id=14) ───

function PhaseVerificacionEstatus({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white p-14 flex flex-col items-center text-center gap-4">
        <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
          <ShieldCheck className="h-8 w-8 text-blue-500" />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900">Verificación de Estatus</p>
          <p className="text-sm text-gray-500 mt-1.5 max-w-md">
            DGII verifica el estatus final de la habilitación. No requiere acción en el sistema —
            el resultado se refleja en el portal DGII.
          </p>
        </div>
      </div>

      <NavFooter onBack={onBack} onNext={onComplete} />
    </div>
  );
}

// ─── Phase 3: URLs de producción ─────────────────────────────────────────────

function PhaseUrls({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    fetch('/api/habilitacion/contexto').then(r => r.json()).then(d => setWebhookBaseUrl(d.webhookBaseUrl ?? ''));
  }, []);

  const urls = {
    recepcion:    webhookBaseUrl || 'Cargando…',
    aprobacion:   webhookBaseUrl || 'Cargando…',
    autenticacion:webhookBaseUrl || 'Cargando…',
  };

  return (
    <div className="space-y-5">
      <InfoBox color="blue" title="Cambio de ambiente: pruebas → producción">
        Hasta ahora trabajaste en el ambiente de <strong>pruebas</strong> de DGII. Para emitir e-CF reales,
        DGII te pide actualizar las 3 URLs del software al ambiente de <strong>producción</strong>.
        Zero ya tiene las URLs listas — solo cópialas y pégalas en el portal.
      </InfoBox>

      <DgiiScreenshot
        src="/dgii-guia/paso12-url-produccion.png"
        alt="Pantalla de URL Servicios Producción en el portal DGII"
        caption="En el portal DGII, paso 12: URL Servicios Producción. Pega las 3 URLs de abajo y haz clic en CONFIRMAR URLs."
        mode="inline"
      />

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-2">
          <Globe className="h-4 w-4 text-gray-400" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Endpoints de producción</p>
        </div>
        <div className="px-4 divide-y divide-gray-50">
          <CopyRow label="URL de recepción"     value={urls.recepcion} />
          <CopyRow label="URL de aprobación"    value={urls.aprobacion} />
          <CopyRow label="URL de autenticación" value={urls.autenticacion} />
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 p-4">
        <Lock className="h-4 w-4 text-teal-500 shrink-0" />
        <p className="text-sm text-gray-700">
          Todos los endpoints usan <strong>HTTPS / TLS 1.2+</strong> con certificado SSL válido.
        </p>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600" />
        <span className="text-sm text-gray-700">
          Registré las 3 URLs en el portal DGII y di clic en CONFIRMAR URLs
        </span>
      </label>

      <NavFooter onBack={onBack} onNext={onComplete} nextDisabled={!confirmed} />
    </div>
  );
}

// ─── Phase 4: Declaración Jurada + Verificación RNC ──────────────────────────

function PhaseDeclaracion({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sub,       setSub]       = useState(0);
  const [xmlFile,   setXmlFile]   = useState<File | null>(null);
  const [signing,   setSigning]   = useState(false);
  const [signed,    setSigned]    = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [enviado,   setEnviado]   = useState(false);

  // XML firmado (base64) devuelto por el backend — se usa para descargar
  const [xmlFirmado, setXmlFirmado] = useState<{ base64: string; name: string } | null>(null);

  useEffect(() => {
    import('@/lib/habilitacion/client').then(({ cargarEstado }) => {
      cargarEstado().then(({ state }) => {
        if (state.declaracionJurada?.enviado) setEnviado(true);
        if (state.declaracionJurada?.xmlFirmadoDataUrl) {
          setXmlFirmado({
            base64: state.declaracionJurada.xmlFirmadoDataUrl,
            name:   state.declaracionJurada.xmlFirmadoName ?? 'declaracion-jurada-firmada.xml',
          });
          setSigned(true);
        }
        if (typeof state.subPaso === 'number') setSub(state.subPaso);
      }).catch(() => { /* silent */ });
    });
  }, []);

  function goToSub(n: number) {
    setSub(n);
    import('@/lib/habilitacion/client').then(({ guardarEstado }) => {
      guardarEstado({ subPaso: n }).catch(() => {});
    });
  }

  async function handleFirmar() {
    if (!xmlFile) return;
    setSignError(null);
    setSigning(true);
    try {
      const { firmarXml, guardarEstado } = await import('@/lib/habilitacion/client');
      const result = await firmarXml({ xmlFile, proposito: 'declaracion-jurada' });
      setXmlFirmado({ base64: result.xmlFirmadoBase64, name: result.xmlFirmadoNombre });
      setSigned(true);
      await guardarEstado({
        declaracionJurada: {
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
    const { descargarBase64 } = await import('@/lib/habilitacion/client');
    descargarBase64(xmlFirmado.base64, xmlFirmado.name);
  }

  async function handleConfirmarEnvio(v: boolean) {
    setEnviado(v);
    const { guardarEstado } = await import('@/lib/habilitacion/client');
    await guardarEstado({ declaracionJurada: { enviado: v } });
  }

  const STEPS = ['Firmar y enviar', 'Verificación RNC'];

  return (
    <div className="space-y-5">

      {/* Stepper */}
      <div className="flex items-center">
        {STEPS.map((label, i) => (
          <div key={i} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                ${i < sub  ? 'bg-teal-600 border-teal-600 text-white'
                : i === sub ? 'bg-white border-teal-600 text-teal-600'
                :             'bg-white border-gray-200 text-gray-400'}`}>
                {i < sub ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap
                ${i === sub ? 'text-teal-700' : i < sub ? 'text-teal-500' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 mx-2 rounded transition-colors
                ${i < sub ? 'bg-teal-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Sub 0: Firmar + enviar ── */}
      {sub === 0 && (
        <div className="space-y-4">
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
          <div className={`rounded-xl border p-5 space-y-4 ${xmlFile ? 'border-teal-200' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                  ${xmlFile ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  {xmlFile ? <Check className="h-3.5 w-3.5" /> : '1'}
                </div>
                <p className="text-sm font-semibold text-gray-800">Subir XML generado por la DGII</p>
              </div>
              <DgiiScreenshot
                src="/dgii-guia/paso13-envio-xml-declaracion.png"
                alt="Envío del XML de declaración jurada firmado"
                caption="En el portal DGII, después del texto legal, haz clic en GENERAR ARCHIVO para descargar el XML."
                label="Ver pantalla"
              />
            </div>

            {!xmlFile ? (
              <div onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed border-gray-200 hover:border-teal-300 hover:bg-gray-50 cursor-pointer flex flex-col items-center gap-2 py-6 px-4 text-center transition-colors">
                <Upload className="h-7 w-7 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">XML de declaración jurada</p>
                  <p className="text-xs text-gray-400 mt-0.5">Descargado del portal DGII · Formato .xml</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
                <FileText className="h-4 w-4 text-teal-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{xmlFile.name}</p>
                  <p className="text-xs text-gray-400">{fmtSize(xmlFile.size)}</p>
                </div>
                <button onClick={() => { setXmlFile(null); setSigned(false); setXmlFirmado(null); }}
                  className="p-1 rounded-full hover:bg-gray-200 text-gray-400">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".xml" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setXmlFile(f); e.target.value = ''; }} />
          </div>

          {/* Step 2 */}
          <div className={`rounded-xl border p-5 space-y-4 transition-all ${signed ? 'border-teal-200' : !xmlFile ? 'border-gray-100 opacity-40' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                ${signed ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {signed ? <Check className="h-3.5 w-3.5" /> : '2'}
              </div>
              <p className="text-sm font-semibold text-gray-800">Firmar con certificado P12</p>
            </div>
            {!signed ? (
              <Button onClick={handleFirmar} disabled={!xmlFile || signing} className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
                {signing
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Firmando declaración jurada…</>
                  : <><FileSignature className="h-4 w-4" />Firmar declaración jurada</>}
              </Button>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg p-3 text-teal-800">
                  <CheckCircle className="h-4 w-4" />
                  <p className="text-sm font-medium">Firmado · RSA-SHA256</p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={handleDescargar} disabled={!xmlFirmado}>
                  <Download className="h-3.5 w-3.5" /> Descargar
                </Button>
              </div>
            )}
            {signError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">{signError}</p>
              </div>
            )}
          </div>

          {/* Step 3 */}
          <div className={`rounded-xl border p-5 space-y-4 transition-all ${enviado ? 'border-teal-200' : !signed ? 'border-gray-100 opacity-40' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                ${enviado ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {enviado ? <Check className="h-3.5 w-3.5" /> : '3'}
              </div>
              <p className="text-sm font-semibold text-gray-800">Enviar al portal DGII</p>
            </div>
            <label className={`flex items-start gap-3 cursor-pointer ${!signed ? 'pointer-events-none' : ''}`}>
              <input
                type="checkbox"
                checked={enviado}
                disabled={!signed}
                onChange={e => handleConfirmarEnvio(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-700">
                Subí el XML firmado en el portal DGII ("Enviar archivo")
              </span>
            </label>
          </div>

          <NavFooter
            onBack={onBack}
            onNext={() => goToSub(1)}
            nextDisabled={!enviado}
            nextLabel="Verificar RNC"
          />
        </div>
      )}

      {/* ── Sub 1: Verificación RNC ── */}
      {sub === 1 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Último paso antes de producción
            </p>
            <DgiiScreenshot
              src="/dgii-guia/paso14-verificacion-estatus.png"
              alt="Verificación del estatus del RNC en el portal DGII"
              caption="DGII valida automáticamente que tu RNC esté activo y al día con tus obligaciones fiscales."
              label="Ver pantalla"
            />
          </div>
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
    </div>
  );
}

// ─── Phase 5: Finalizado (Paso 15 DGII) ──────────────────────────────────────

function PhaseFinalizado({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="space-y-5">

      <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-6">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-2xl bg-teal-600 flex items-center justify-center shrink-0 shadow-sm">
            <PartyPopper className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-1">Paso 15 · Finalizado</p>
            <h3 className="text-xl font-bold text-gray-900">¡Tu habilitación está completa!</h3>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              Has completado exitosamente el proceso de certificación como Facturador Electrónico.
              Ya puedes emitir e-CF en producción desde Zero.
            </p>
          </div>
        </div>
      </div>

      <DgiiScreenshot
        src="/dgii-guia/paso15-finalizado.png"
        alt="Pantalla de finalización en el portal DGII"
        caption="Esta es la pantalla que ves en el portal DGII cuando completas el proceso. Te redirige a la Oficina Virtual (OFV)."
        mode="inline"
      />

      <InfoBox color="blue" title="¿Qué es la OFV y por qué importa?">
        La <strong>Oficina Virtual (OFV)</strong> es donde DGII te muestra los reportes, consultas y
        estatus de tus e-CF. <strong>No necesitas entrar ahí para emitir facturas</strong> — Zero
        las envía automáticamente en producción. Úsala solo para consultar o ver reportes.
      </InfoBox>

      <div className="grid sm:grid-cols-2 gap-3">
        <a
          href="https://www.dgii.gov.do/ofv/login.aspx"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition-colors group"
        >
          <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
            <ExternalLink className="h-4 w-4 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Ir a la OFV</p>
            <p className="text-xs text-gray-500 truncate">Oficina Virtual de la DGII</p>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0" />
        </a>

        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-teal-200 bg-teal-50">
          <div className="h-10 w-10 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-teal-900">Zero ya está en producción</p>
            <p className="text-xs text-teal-700">Cada factura que emitas será real ante DGII</p>
          </div>
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border border-gray-200">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={e => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600"
        />
        <span className="text-sm text-gray-700">
          Entiendo que desde ahora cada e-CF que emita en Zero es <strong>real</strong> y se envía
          directamente a producción DGII
        </span>
      </label>

      <NavFooter
        onBack={onBack}
        onNext={onComplete}
        nextDisabled={!acknowledged}
        nextLabel="Finalizar habilitación"
      />
    </div>
  );
}

// ─── Final: Celebración ──────────────────────────────────────────────────────

function PhaseListo() {
  return (
    <div className="space-y-8 py-4">
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="h-20 w-20 rounded-full bg-teal-100 flex items-center justify-center">
          <Rocket className="h-10 w-10 text-teal-600" />
        </div>
        <div>
          <h3 className="text-2xl font-bold text-gray-900">¡Habilitación completada!</h3>
          <p className="text-gray-500 mt-2 max-w-md text-sm">
            Tu empresa está habilitada ante la DGII para emitir comprobantes fiscales electrónicos.
            Ya puedes emitir e-CF en producción.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Building2,   label: 'Empresa',       desc: 'Datos fiscales' },
          { icon: KeyRound,    label: 'Certificado',   desc: 'P12 activo' },
          { icon: FlaskConical,label: 'Set de Pruebas',desc: 'Aprobado' },
          { icon: CheckCircle, label: 'Producción',    desc: 'En línea' },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-gray-200 p-4 text-center space-y-2">
            <div className="h-9 w-9 rounded-full bg-teal-50 flex items-center justify-center mx-auto">
              <item.icon className="h-4 w-4 text-teal-600" />
            </div>
            <p className="text-xs font-semibold text-gray-900">{item.label}</p>
            <p className="text-xs text-gray-400">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/dashboard/facturas/nueva" className="flex-1">
          <Button className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
            <ArrowRight className="h-4 w-4" /> Emitir primera factura
          </Button>
        </Link>
        <Link href="/dashboard" className="flex-1">
          <Button variant="outline" className="w-full">Ir al dashboard</Button>
        </Link>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden">

        <div className="bg-gradient-to-r from-teal-600 to-teal-500 px-10 py-8">
          <p className="text-xs font-semibold text-teal-100 uppercase tracking-widest mb-2">
            Comprobantes Fiscales Electrónicos · DGII
          </p>
          <h2 className="text-3xl font-bold text-white leading-snug">
            Activa tu facturación electrónica
          </h2>
          <p className="text-base text-teal-100 mt-2">
            Zero te guía paso a paso por el proceso de habilitación ante la DGII.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row">
          <div className="flex-1 px-10 py-8 space-y-6">
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                Antes de comenzar, ten a mano
              </p>
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
                <div key={item.n} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-teal-600">{item.n}</span>
                  </div>
                  <p className="text-base text-gray-700 flex-1">{item.text}</p>
                  <HelpPopover content={item.help} link={item.link} linkText={item.linkText} />
                </div>
              ))}
            </div>

            <Button onClick={handleStart} size="lg"
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold text-base py-3">
              Comenzar →
            </Button>
          </div>

          <div className="sm:w-60 bg-gray-50 border-l border-gray-100 px-8 py-8 space-y-5 flex flex-col justify-center">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">¿Qué obtienes?</p>
            {[
              { icon: '💰', title: 'Créditos fiscales',       desc: 'Aplica créditos en ITBIS y otros impuestos.' },
              { icon: '⚡', title: 'Facturación en segundos', desc: 'Firma y envía e-CF a la DGII al instante.' },
              { icon: '🔒', title: 'Sin papel, sin riesgo',   desc: 'Todo firmado digitalmente y en la nube.' },
            ].map(b => (
              <div key={b.title} className="flex items-start gap-3">
                <span className="text-xl shrink-0">{b.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{b.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Elección inline (no modal) ──────────────────────────────────────────────

function StageEleccion({ onSelect, onBack }: { onSelect: (m: IntroMode) => void; onBack: () => void }) {
  const [selected, setSelected] = useState<IntroMode | null>(null);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-teal-600 mb-4">
          <CheckCircle className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">¡Datos listos!</h2>
        <p className="text-sm text-gray-400 mt-2">
          Ahora elige cómo quieres completar la habilitación ante la DGII.
        </p>
      </div>

      <div className="space-y-3 mb-6">
        <button
          onClick={() => setSelected('asistido')}
          className={`w-full text-left rounded-2xl border-2 p-5 transition-all group
            ${selected === 'asistido' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'}`}
        >
          <div className="flex items-start gap-4">
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors
              ${selected === 'asistido' ? 'bg-teal-500' : 'bg-teal-100 group-hover:bg-teal-200'}`}>
              <Zap className={`h-5 w-5 ${selected === 'asistido' ? 'text-white' : 'text-teal-600'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-base font-bold text-gray-900">Zero gestiona todo por mí</p>
                <span className="text-[11px] font-bold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                  Recomendado
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Comparte tus credenciales del portal DGII y nos encargamos del proceso completo.
                Tú solo esperas la confirmación.
              </p>
            </div>
            <div className={`h-5 w-5 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center transition-colors
              ${selected === 'asistido' ? 'border-teal-500 bg-teal-500' : 'border-gray-300'}`}>
              {selected === 'asistido' && <Check className="h-3 w-3 text-white" />}
            </div>
          </div>
        </button>

        <button
          onClick={() => setSelected('manual')}
          className={`w-full text-left rounded-2xl border-2 p-5 transition-all group
            ${selected === 'manual' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'}`}
        >
          <div className="flex items-start gap-4">
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors
              ${selected === 'manual' ? 'bg-teal-500' : 'bg-gray-100 group-hover:bg-gray-200'}`}>
              <FileText className={`h-5 w-5 ${selected === 'manual' ? 'text-white' : 'text-gray-500'}`} />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-gray-900 mb-1">Lo gestiono yo paso a paso</p>
              <p className="text-sm text-gray-500">
                Te guiamos por cada fase con instrucciones claras. Tú ejecutas los pasos
                en el portal DGII a tu ritmo.
              </p>
            </div>
            <div className={`h-5 w-5 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center transition-colors
              ${selected === 'manual' ? 'border-teal-500 bg-teal-500' : 'border-gray-300'}`}>
              {selected === 'manual' && <Check className="h-3 w-3 text-white" />}
            </div>
          </div>
        </button>
      </div>

      <NavFooter
        onBack={onBack}
        onNext={() => selected && onSelect(selected)}
        nextDisabled={!selected}
        nextLabel="Continuar"
      />
    </div>
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
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-teal-600 mb-2">
          <Zap className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Acceso al portal DGII</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Necesitamos acceder <strong>una sola vez</strong> al portal DGII para completar
          la habilitación por ti. No guardamos tus credenciales.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
            RNC / Cédula
          </Label>
          <Input value={rnc} readOnly className="bg-gray-50 text-gray-500 font-mono" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
            Contraseña del portal DGII
          </Label>
          <div className="relative">
            <Input
              type={showPass ? 'text' : 'password'}
              placeholder="Tu contraseña del portal"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              className="pr-10"
              autoFocus
            />
            <button type="button" onClick={() => setShowPass(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">La DGII puede pedir un código de verificación</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                Algunos portales envían un token por SMS o llamada durante el proceso.
                Deja un número donde podamos contactarte de inmediato si ocurre.
              </p>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5 block">
              WhatsApp / Teléfono de contacto <span className="text-red-500">*</span>
            </Label>
            <Input
              type="tel"
              placeholder="Ej: +1 809 555 0000"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              className="bg-white border-amber-200 focus:border-amber-400 focus:ring-amber-300"
            />
            <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
              <span className="text-base leading-none">💬</span>
              Te contactaremos por WhatsApp si necesitamos el código
            </p>
          </div>
        </div>
      </div>

      <Button
        onClick={handleConfirm}
        disabled={!password || !telefono || loading}
        size="lg"
        className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40 font-semibold"
      >
        {loading
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando acceso…</>
          : 'Continuar'}
      </Button>

      <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl p-4 border border-gray-100">
        <Shield className="h-4 w-4 text-teal-500 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-500 leading-relaxed">
          Tus credenciales se usan <strong>una sola vez</strong> y se eliminan de nuestros
          sistemas de inmediato tras completar el proceso. Conexión cifrada TLS 1.3.
        </p>
      </div>

      <button onClick={onSkip} className="w-full text-sm text-gray-400 hover:text-gray-600 text-center underline underline-offset-2">
        Prefiero hacer el proceso manualmente →
      </button>

      <NavFooter onBack={onBack} />
    </div>
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
  const [showMobileNav,      setShowMobileNav]      = useState(false);

  useEffect(() => {
    fetch('/api/equipo/perfil').then(r => r.json()).then(d => setRnc(d.rnc ?? ''));
  }, []);

  // Cargar fase + completado desde servidor (persistencia cross-session).
  // El modal de intro (showIntro) se decide DENTRO de este load, no en un
  // efecto aparte basado solo en localStorage — si ya hay progreso o el
  // proceso está completo, nunca debe aparecer, sin importar si este
  // navegador/dispositivo ya vio el intro antes.
  useEffect(() => {
    import('@/lib/habilitacion/client').then(({ cargarEstado }) => {
      cargarEstado().then(({ state, completado }) => {
        // fase puede llegar a PHASES.length (15): es el centinela de "wizard
        // terminado, mostrar resumen" — no se recorta a 14, o clickear un
        // paso anterior desde el resumen nunca podría volver a mostrarlo.
        if (typeof state.fase === 'number') setPhase(state.fase);
        const done = new Set<number>();
        // Reconstruir: cualquier fase < state.fase se considera completada
        if (typeof state.fase === 'number') {
          for (let i = 0; i < state.fase; i++) done.add(i);
        }
        if (completado) for (let i = 0; i < PHASES.length; i++) done.add(i);
        setCompleted(done);
        const tieneProgreso = completado || typeof state.fase === 'number';
        // Si hay progreso guardado (fase ≥ 1) o proceso completado → saltar PASO PREVIO
        if (tieneProgreso) {
          setStage('wizard');
        } else {
          try { if (!localStorage.getItem(INTRO_KEY)) setShowIntro(true); }
          catch { setShowIntro(true); }
        }
      }).catch(() => {
        // Si falla la carga del estado, no podemos saber si hay progreso —
        // fallback al criterio anterior (solo localStorage) para no dejar al
        // usuario sin intro para siempre por un error de red pasajero.
        try { if (!localStorage.getItem(INTRO_KEY)) setShowIntro(true); }
        catch { setShowIntro(true); }
      });
    });
  }, []);

  const isDone = completed.size === PHASES.length;
  // Distinto de isDone (que una vez true queda true para siempre, usado para
  // ocultar el CTA de cancelar/el hero). viewingSummary es solo si estamos
  // parados en el resumen final (fase 15) vs. revisando una fase pasada
  // (0-14) desde el sidebar tras terminar — así el click en un paso anterior
  // sí puede volver a mostrar su contenido en vez de quedar pegado al resumen.
  const viewingSummary = phase >= PHASES.length;

  function handleModeSelected(m: IntroMode) {
    setMode(m);
    setStage(m === 'asistido' ? 'credencial' : 'wizard');
  }

  function completePhase(id: number) {
    setCompleted(prev => new Set([...prev, id]));
    const nextPhase = id + 1;
    setPhase(nextPhase);
    // Persistir fase alcanzada + resetear el sub-paso (la fase nueva arranca
    // desde su primer sub-paso, no debe heredar el de la fase anterior).
    import('@/lib/habilitacion/client').then(({ guardarEstado }) => {
      guardarEstado({ fase: nextPhase, subPaso: 0 }).catch(() => {});
    });
    // Postulación (fase 0) completada → pasar de TesteCF a CerteCF antes de
    // entrar a Pruebas de Datos e-CF. Fire-and-forget: si falla, no bloquea
    // el avance (el usuario puede reintentar el cambio de ambiente después).
    if (id === 0) {
      fetch('/api/habilitacion/ambiente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ambiente: 'CerteCF' }),
      }).catch(() => {});
    }
    // Declaración Jurada (fase 12) completada → pasar de CerteCF a Producción.
    if (id === 12) {
      fetch('/api/habilitacion/ambiente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ambiente: 'Produccion' }),
      }).catch(() => {});
    }
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
    wizard:    `Proceso de certificación ante la DGII · ${PHASES.length} fases`,
  };

  return (
    <>
      {showIntro && (
        <IntroModal onStart={() => setShowIntro(false)} />
      )}

      <div className="min-h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Activar facturación electrónica</h1>
              <p className="text-xs text-gray-400 mt-0.5">{subtitles[stage]}</p>
            </div>

            <div className="flex items-center gap-4">
              {/* Botón cancelar — solo visible en el wizard con progreso y sin completar */}
              {stage === 'wizard' && !isDone && (
                <div className="relative">
                  <button
                    onClick={() => setShowCancelConfirm(v => !v)}
                    className="text-sm font-medium text-red-500 hover:text-red-700 transition-colors"
                  >
                    Cancelar proceso
                  </button>

                  {showCancelConfirm && (
                    <>
                      {/* Backdrop para cerrar al hacer click afuera */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowCancelConfirm(false)}
                      />
                      <div className="absolute right-0 top-8 z-50 w-76 bg-white border border-red-200 rounded-xl shadow-xl p-4 space-y-3">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              ¿Eliminar todo el progreso?
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Se borrará todo el avance guardado del proceso de habilitación. Los
                              e-CF ya enviados a la DGII no se pueden deshacer.
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowCancelConfirm(false)}
                            className="flex-1 text-sm py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors"
                          >
                            No, mantener
                          </button>
                          <button
                            onClick={handleCancelarProceso}
                            disabled={canceling}
                            className="flex-1 text-sm py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
                          >
                            {canceling ? 'Eliminando…' : 'Sí, eliminar todo'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                Cerrar ×
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">

          {/* ── Empresa + Certificado ── */}
          {stage === 'requisito' && (
            <div className="max-w-3xl mx-auto">
              <div className="mb-6">
                <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mb-1">
                  Paso previo
                </p>
                <h2 className="text-xl font-bold text-gray-900">Tu empresa y certificado digital</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Completa tus datos fiscales y carga tu certificado P12 antes de iniciar el proceso.
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <PhaseEmpresa onComplete={() => setStage('eleccion')} />
              </div>
            </div>
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

          {/* ── Wizard 15 fases ── */}
          {stage === 'wizard' && (
            <div className="space-y-4">
              {!isDone && <EtapasHero />}

              <div className="flex gap-8">
                <Sidebar phase={phase} completed={completed} onJump={handleJump} />
                <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-6 min-h-[540px]">
                  {!viewingSummary ? (
                    <>
                      <div className="mb-6">
                        {isDone && (
                          <button
                            type="button"
                            onClick={() => setPhase(PHASES.length)}
                            className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700 mb-3"
                          >
                            <ChevronRight className="h-3 w-3 rotate-180" /> Volver al resumen
                          </button>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                          <button
                            type="button"
                            onClick={() => setShowMobileNav(v => !v)}
                            className="md:pointer-events-none shrink-0 flex items-center gap-1 text-gray-400"
                          >
                            Fase {phase + 1} de {PHASES.length}
                            <ChevronRight className={`md:hidden h-3 w-3 transition-transform ${showMobileNav ? 'rotate-90' : ''}`} />
                          </button>
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div className="bg-teal-500 h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${(completed.size / PHASES.length) * 100}%` }} />
                          </div>
                          <span className="shrink-0">{Math.round((completed.size / PHASES.length) * 100)}%</span>
                        </div>
                        {showMobileNav && (
                          <div className="md:hidden mb-4 rounded-xl border border-gray-200 p-2 select-none">
                            <PhaseListItems
                              phase={phase}
                              completed={completed}
                              onJump={handleJump}
                              onSelect={() => setShowMobileNav(false)}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-gray-900">{PHASE_TITLES[phase]}</h2>
                          {mode === 'asistido' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                              <Zap className="h-3 w-3" /> Asistido
                            </span>
                          )}
                        </div>
                      </div>

                      {phase === 0  && <PhasePostulacion onComplete={() => completePhase(0)}  onBack={() => setStage('eleccion')} />}
                      {phase === 1  && <PhasePruebas      onComplete={() => completePhase(1)}  onBack={() => setPhase(0)} />}
                      {phase === 2  && <PhaseImpresa      onComplete={() => completePhase(2)}  onBack={() => setPhase(1)} />}
                      {phase === 3  && <PhaseSimulacion   onComplete={() => completePhase(3)}  onBack={() => setPhase(2)} />}
                      {phase === 4  && <PhaseRepresentacionSimulacion onComplete={() => completePhase(4)} onBack={() => setPhase(3)} />}
                      {phase === 5  && <PhaseValidacionRepresentacionImpresa onComplete={() => completePhase(5)} onBack={() => setPhase(4)} />}
                      {phase === 6  && <PhaseUrlServiciosPrueba onComplete={() => completePhase(6)} onBack={() => setPhase(5)} />}
                      {phase === 7  && <PhasePortalStep stepId={8}  onComplete={() => completePhase(7)}  onBack={() => setPhase(6)} />}
                      {phase === 8  && <PhasePortalStep stepId={9}  onComplete={() => completePhase(8)}  onBack={() => setPhase(7)} />}
                      {phase === 9  && <PhasePortalStep stepId={10} onComplete={() => completePhase(9)}  onBack={() => setPhase(8)} />}
                      {phase === 10 && <PhasePortalStep stepId={11} onComplete={() => completePhase(10)} onBack={() => setPhase(9)} />}
                      {phase === 11 && <PhaseUrls         onComplete={() => completePhase(11)} onBack={() => setPhase(10)} />}
                      {phase === 12 && <PhaseDeclaracion  onComplete={() => completePhase(12)} onBack={() => setPhase(11)} />}
                      {phase === 13 && <PhaseVerificacionEstatus onComplete={() => completePhase(13)} onBack={() => setPhase(12)} />}
                      {phase === 14 && <PhaseFinalizado   onComplete={() => completePhase(14)} onBack={() => setPhase(13)} />}
                    </>
                  ) : (
                    <PhaseListo />
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

// Suppress unused import warnings for icons kept for potential future phases
void Hash; void StatusPill;
