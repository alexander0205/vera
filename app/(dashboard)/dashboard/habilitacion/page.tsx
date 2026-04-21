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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Perfil {
  rnc?: string; razonSocial?: string; nombreComercial?: string;
  direccion?: string; provincia?: string; municipio?: string;
  telefono?: string; emailFacturacion?: string;
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
  nombreSoftware:  'EmiteDo',
  version:         '1',
  rncProveedor:    '132596161',
  nombreProveedor: 'Yisrael Technology LLC',
};

const URLS_BASE = {
  recepcion:    'https://api.emitedo.com/dgii/{rnc}/recepcion',
  aprobacion:   'https://api.emitedo.com/dgii/{rnc}/aprobacion',
  autenticacion:'https://api.emitedo.com/dgii/{rnc}/autenticacion',
};

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

// ─── República Dominicana — provincias y municipios ──────────────────────────

const DR_PROVINCIAS = [
  'Azua','Bahoruco','Barahona','Dajabón','Distrito Nacional',
  'Duarte','El Seibo','Elías Piña','Espaillat','Hato Mayor',
  'Hermanas Mirabal','Independencia','La Altagracia','La Romana',
  'La Vega','María Trinidad Sánchez','Monseñor Nouel','Monte Cristi',
  'Monte Plata','Pedernales','Peravia','Puerto Plata','Samaná',
  'San Cristóbal','San José de Ocoa','San Juan','San Pedro de Macorís',
  'Sánchez Ramírez','Santiago','Santiago Rodríguez','Santo Domingo','Valverde',
];

const DR_MUNICIPIOS: Record<string, string[]> = {
  'Azua':                   ['Azua','Las Charcas','Las Yayas de Viajama','Padre Las Casas','Peralta','Sabana Yegua','Pueblo Viejo','Tábara Arriba','Guayabal','Estebanía'],
  'Bahoruco':               ['Neiba','Galván','Los Ríos','Tamayo','Vicente Noble','El Palmar'],
  'Barahona':               ['Barahona','Cabral','El Peñón','Enriquillo','Fundación','Jaquimeyes','La Ciénaga','Las Salinas','Paraíso','Polo'],
  'Dajabón':                ['Dajabón','El Pino','Loma de Cabrera','Partido','Restauración'],
  'Distrito Nacional':      ['Santo Domingo de Guzmán'],
  'Duarte':                 ['San Francisco de Macorís','Arenoso','Castillo','Eugenio María de Hostos','Las Guáranas','Pimentel','Villa Riva'],
  'El Seibo':               ['Santa Cruz de El Seibo','Miches'],
  'Elías Piña':             ['Comendador','Bánica','El Llano','Hondo Valle','Pedro Santana','La Descubierta'],
  'Espaillat':              ['Moca','Cayetano Germosén','Gaspar Hernández','Jamao al Norte'],
  'Hato Mayor':             ['Hato Mayor del Rey','El Valle','Sabana de la Mar'],
  'Hermanas Mirabal':       ['Salcedo','Tenares','Villa Tapia'],
  'Independencia':          ['Jimaní','Cristóbal','Duvergé','La Descubierta','Mella','Postrer Río'],
  'La Altagracia':          ['Higüey','San Rafael del Yuma'],
  'La Romana':              ['La Romana','Guaymate','Villa Hermosa'],
  'La Vega':                ['La Concepción de La Vega','Constanza','Jarabacoa','Jima Abajo'],
  'María Trinidad Sánchez': ['Nagua','Cabrera','El Factor','Río San Juan'],
  'Monseñor Nouel':         ['Bonao','Maimón','Piedra Blanca'],
  'Monte Cristi':           ['Monte Cristi','Castañuelas','Guayubín','Las Matas de Santa Cruz','Pepillo Salcedo','Villa Vásquez'],
  'Monte Plata':            ['Monte Plata','Bayaguana','Peralvillo','Rancho Arriba','Sabana Grande de Boyá','Yamasá'],
  'Pedernales':             ['Pedernales','Oviedo'],
  'Peravia':                ['Baní','Nizao'],
  'Puerto Plata':           ['Puerto Plata','Altamira','Guananico','Imbert','Los Hidalgos','Luperón','Sosúa','Villa Isabela','Villa Montellano'],
  'Samaná':                 ['Santa Bárbara de Samaná','Las Terrenas','Sánchez'],
  'San Cristóbal':          ['San Cristóbal','Bajos de Haina','Cambita Garabitos','Los Cacaos','Sabana Grande de Palenque','San Gregorio de Nigua','Yaguate'],
  'San José de Ocoa':       ['San José de Ocoa','Rancho Arriba','Sabana Larga'],
  'San Juan':               ['San Juan de la Maguana','Bohechío','El Cercado','Juan de Herrera','Las Matas de Farfán','Vallejuelo'],
  'San Pedro de Macorís':   ['San Pedro de Macorís','Consuelo','Guayacanes','Los Llanos','Quisqueya','Ramón Santana'],
  'Sánchez Ramírez':        ['Cotuí','Cevicos','Fantino','La Mata'],
  'Santiago':               ['Santiago de los Caballeros','Bisonó','Jánico','Licey al Medio','Puñal','Sabana Iglesia','San José de Las Matas','Tamboril','Villa González'],
  'Santiago Rodríguez':     ['Sabaneta','Los Almácigos','Monción'],
  'Santo Domingo':          ['Santo Domingo Este','Santo Domingo Norte','Santo Domingo Oeste','Boca Chica','Los Alcarrizos','Pedro Brand','San Antonio de Guerra'],
  'Valverde':               ['Mao','Esperanza','Laguna Salada'],
};

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

const PRUEBA_ECF_TYPES: PruebaType[] = [
  { tipo: '31',  nombre: 'Factura de Crédito Fiscal',         required: 4,    batch: 1 },
  { tipo: '32g', nombre: 'Factura de Consumo (≥RD$250,000)',  required: 2,    batch: 1 },
  { tipo: '41',  nombre: 'Compras',                            required: 2,    batch: 1 },
  { tipo: '43',  nombre: 'Gastos Menores',                     required: 2,    batch: 1 },
  { tipo: '44',  nombre: 'Regímenes Especiales',               required: 2,    batch: 1 },
  { tipo: '45',  nombre: 'Gubernamental',                      required: 2,    batch: 1 },
  { tipo: '46',  nombre: 'Exportaciones',                      required: 2,    batch: 1 },
  { tipo: '47',  nombre: 'Pagos al Exterior',                  required: 2,    batch: 1 },
  { tipo: '33',  nombre: 'Nota de Débito',                     required: 1,    batch: 2 },
  { tipo: '34',  nombre: 'Nota de Crédito',                    required: 2,    batch: 2 },
  { tipo: '32r', nombre: 'Tipo 32 RFCE — Resumen FC',          required: 4,    batch: 3 },
  { tipo: '32b', nombre: 'Factura de Consumo (<RD$250,000)',   required: null, batch: 4 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const fmtSize = (b: number) => b < 1024 ? `${b} B` : `${(b / 1024).toFixed(0)} KB`;

function withRnc(url: string, rnc: string) {
  return url.replace('{rnc}', rnc || 'TU_RNC');
}

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

// ─── AutocompleteInput ────────────────────────────────────────────────────────

function AutocompleteInput({
  value, onChange, options, placeholder, disabled,
}: {
  value: string; onChange: (v: string) => void;
  options: string[]; placeholder?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const filtered = options.filter(o =>
    o.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 30);

  function select(opt: string) {
    onChange(opt); setQuery(opt); setOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <Input
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (!disabled) setOpen(true); }}
        className={disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}
      />
      {open && filtered.length > 0 && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={e => { e.preventDefault(); select(opt); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              {opt}
            </button>
          ))}
        </div>
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
            Puedes cerrar EmiteDo — te avisaremos por correo y WhatsApp cuando DGII responda.
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

function Sidebar({ phase, completed, onJump }: { phase: number; completed: Set<number>; onJump: (p: number) => void }) {
  const maxReached = Math.max(phase, ...Array.from(completed), 0);
  return (
    <nav className="hidden md:flex flex-col w-56 shrink-0 pt-2 select-none">
      {PHASES.map((p, i) => {
        const isDone    = completed.has(p.id);
        const isCurrent = p.id === phase;
        const isLocked  = p.id > maxReached;
        return (
          <div key={p.id} className="relative">
            {i < PHASES.length - 1 && (
              <div className={`absolute left-[15px] top-8 w-0.5 h-[calc(100%-4px)]
                ${isDone ? 'bg-teal-400' : 'bg-gray-200'}`} />
            )}
            <button
              onClick={() => !isLocked && onJump(p.id)}
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
                <p className={`text-sm font-semibold leading-tight truncate
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Provincia <span className="text-red-500">*</span></Label>
                <AutocompleteInput
                  value={provincia}
                  options={DR_PROVINCIAS}
                  placeholder="Buscar provincia…"
                  onChange={v => {
                    setProvincia(v);
                    setMunicipio('');
                    setErrors(e => ({...e, provincia:'', municipio:''}));
                  }}
                />
                {errors.provincia && <p className="text-xs text-red-500 mt-1">{errors.provincia}</p>}
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Municipio <span className="text-red-500">*</span></Label>
                <AutocompleteInput
                  value={municipio}
                  options={DR_MUNICIPIOS[provincia] ?? []}
                  placeholder={provincia ? 'Buscar municipio…' : 'Selecciona provincia'}
                  disabled={!provincia}
                  onChange={v => { setMunicipio(v); setErrors(e => ({...e, municipio:''})); }}
                />
                {errors.municipio && <p className="text-xs text-red-500 mt-1">{errors.municipio}</p>}
              </div>
            </div>
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

  const [rnc,             setRnc]             = useState('');
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
    fetch('/api/equipo/perfil').then(r => r.json()).then(d => setRnc(d.rnc ?? ''));
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
    recepcion:    withRnc(URLS_BASE.recepcion,     rnc),
    aprobacion:   withRnc(URLS_BASE.aprobacion,    rnc),
    autenticacion:withRnc(URLS_BASE.autenticacion, rnc),
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

          {/* 2 — Datos a copiar */}
          <div className="grid lg:grid-cols-2 gap-4">

            {/* Software */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Datos del software</p>
                <DgiiScreenshot
                  src="/dgii-guia/paso1-datos-software.png"
                  alt="Formulario de datos del software en el portal DGII"
                  caption="Pega los tres URLs (recepción, aprobación comercial, autenticación) exactamente como aparecen abajo."
                  label="Ver dónde pegar"
                />
              </div>
              <div className="px-4 divide-y divide-gray-50">
                <CopyRow label="Tipo de software"     value={EMITEDO.tipoSoftware} />
                <CopyRow label="Nombre del software"  value={EMITEDO.nombreSoftware} />
                <CopyRow label="Versión"              value={EMITEDO.version} />
                <CopyRow label="URL de recepción"     value={urls.recepcion} />
                <CopyRow label="URL de aprobación"    value={urls.aprobacion} />
                <CopyRow label="URL de autenticación" value={urls.autenticacion} />
              </div>
            </div>

            {/* Proveedor */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Datos del proveedor</p>
              </div>
              <div className="px-4 divide-y divide-gray-50">
                <CopyRow label="RNC del proveedor" value={EMITEDO.rncProveedor} />
                <CopyRow label="Razón social"       value={EMITEDO.nombreProveedor} />
              </div>
            </div>
          </div>


          <NavFooter onBack={onBack} onNext={() => setSub(1)} nextLabel="Ya generé el XML" />
        </div>
      )}

      {/* ── Sub 1: Firma XML ── */}
      {sub === 1 && (
        <div className="space-y-4">
          <InfoBox color="blue" title="Carga el Formulario de Postulación">
            En el portal DGII hiciste clic en <strong>"Generar archivo"</strong> y descargaste
            el Formulario de Postulación. Cárgalo aquí — EmiteDo le aplica la Firma Digital automáticamente.
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
            onBack={() => setSub(0)}
            onNext={() => setSub(2)}
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
            onBack={() => setSub(1)}
            onNext={() => setSub(3)}
            nextDisabled={!uploadConfirmed}
            nextLabel="Esperar validación"
          />
        </div>
      )}

      {/* ── Sub 3: Esperar confirmación de DGII ──
           DGII no expone un endpoint público para consultar estado de postulación.
           La respuesta llega por Buzón de Oficina Virtual (correo DGII).
           El usuario debe confirmar manualmente cuando reciba el correo. */}
      {sub === 3 && (
        <div className="space-y-5">

          {/* Cabecera con icono de correo */}
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 space-y-3">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Mail className="h-6 w-6 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-gray-900">
                  Espera la respuesta de DGII
                </h3>
                <p className="text-sm text-gray-700 mt-1">
                  Enviaste tu Formulario de Postulación firmado al portal DGII.
                  Ahora DGII lo está validando en sus servidores.
                </p>
              </div>
            </div>
          </div>

          {/* Cómo te responde DGII */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <p className="text-sm font-semibold text-gray-800">Tiempo estimado: 1 a 3 días hábiles</p>
            </div>

            <div className="space-y-2.5">
              <p className="text-sm text-gray-700">
                DGII te notificará el resultado por <strong>Buzón de Oficina Virtual</strong>.
                No cierres sesión en EmiteDO — tu progreso ya está guardado.
              </p>
              <ul className="space-y-1.5 text-sm text-gray-600 pl-4 list-disc">
                <li>Si tu postulación es <strong className="text-teal-700">aprobada</strong>, DGII habilita el Set de Pruebas en el Portal de Certificación.</li>
                <li>Si es <strong className="text-red-600">rechazada</strong>, DGII te indica qué datos corregir.</li>
              </ul>
            </div>

            <a
              href="https://dgii.gov.do/ofv/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 underline-offset-2 hover:underline"
            >
              Abrir Oficina Virtual DGII
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Confirmación manual */}
          <div className="rounded-xl border-2 border-teal-200 bg-teal-50/50 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-teal-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  ¿Ya recibiste el correo de aprobación de DGII?
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Solo cuando DGII confirme que tu postulación fue aprobada, puedes continuar con el Set de Pruebas.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={onComplete}
                className="flex-1 bg-teal-600 hover:bg-teal-700 gap-2"
              >
                <Check className="h-4 w-4" />
                DGII ya aprobó mi postulación
              </Button>
              <Button
                variant="outline"
                onClick={() => setSub(2)}
                className="sm:flex-none border-gray-300 text-gray-700 hover:bg-gray-50 gap-2"
              >
                <AlertCircle className="h-4 w-4" />
                DGII me rechazó
              </Button>
            </div>
          </div>

          <div className="flex justify-start">
            <button
              onClick={() => setSub(2)}
              className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              ← Volver
            </button>
          </div>
        </div>
      )}
    </div>
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
  const [pendingTrackIds,  setPendingTrackIds]  = useState<{ tipo: string; encf: string; trackId: string }[]>([]);
  const [validatedByTipo,  setValidatedByTipo]  = useState<Record<string, number>>({});

  // FC <250Mil
  const [fc250Done,        setFc250Done]        = useState(false);
  const [downloading32b,   setDownloading32b]   = useState(false);
  const [download32bError, setDownload32bError] = useState<string | null>(null);

  const [confirmed, setConfirmed] = useState(false);

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
    const trackIdsLocal: { tipo: string; encf: string; trackId: string }[] = [];

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
        const requiereRnc = ['31','33','34','41','44','45'].includes(realTipo);

        // Tipos 33 (nota débito) y 34 (nota crédito) requieren referencia a un e-CF
        // previo. Como el Batch 1 emite los tipo 31 primero, siempre existe
        // E310000001000 como referencia segura.
        const esNota        = realTipo === '33' || realTipo === '34';
        const ncfReferencia = esNota ? 'E310000001000' : undefined;
        const codModif      = realTipo === '33' ? '1'            // 33 → 1 = Cambia código
                            : realTipo === '34' ? '1'            // 34 → 1 = Anulación
                            : undefined;
        const razonModif    = esNota ? 'Prueba de certificación DGII' : undefined;

        let ok = counterLocal[t.tipo] ?? 0;
        for (let i = ok + 1; i <= t.required!; i++) {
          try {
            // NCF aleatorio en rango alto — nunca choca con producción ni con
            // intentos previos, sin necesidad de llevar contador de fallidos.
            const encfHardcoded = buildEncfPruebaRandom(realTipo);

            const result = await emitirEcfPrueba({
              tipoEcf: realTipo,
              encf: encfHardcoded,
              rncComprador:         requiereRnc ? '131988032' : undefined,
              razonSocialComprador: requiereRnc ? 'Cliente Certificación DGII' : undefined,
              ncfModificado:        ncfReferencia,
              codigoModificacion:   codModif,
              razonModificacion:    razonModif,
              itemNombre: nombre,
              itemPrecio: realPrecio,
              itemTarifa: tarifaDec,
              itemTipo:   itemTipoCode,
            });
            trackIdsLocal.push({ tipo: t.tipo, encf: result.encf, trackId: result.trackId });
            ok = i;
            counterLocal[t.tipo] = i;
            setCounts({ ...counterLocal });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setEmitError(`Tipo ${t.tipo}: ${msg}`);
            setStatuses(s => ({ ...s, [t.tipo]: 'rechazado' }));
            // Persistir lo que se logró + el NCF consumido (para que el reintento use el siguiente)
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
    <div className="space-y-5">

      {/* ── Stepper ── */}
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

      {/* ── Step 0: Configuración y tabla de comprobantes ── */}
      {sub === 0 && (
        <div className="space-y-4">
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
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Configuración del ítem de prueba
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-xs mb-1.5 block">
                  Descripción <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={nombre}
                  onChange={e => { setNombre(e.target.value); setFormErrors(v => ({...v, nombre: ''})); }}
                  placeholder={itemTipo === 'servicio' ? 'Ej: Consultoría de sistemas' : 'Ej: Computadora HP'}
                  className={`text-sm ${formErrors.nombre ? 'border-red-400' : ''}`}
                />
                {formErrors.nombre && <p className="text-xs text-red-500 mt-1">{formErrors.nombre}</p>}
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Tipo de ítem</Label>
                <select
                  value={itemTipo}
                  onChange={e => setItemTipo(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="servicio">Servicio</option>
                  <option value="bien">Producto / Bien</option>
                </select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Tarifa ITBIS</Label>
                <select
                  value={tarifa}
                  onChange={e => setTarifa(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="18">18%</option>
                  <option value="16">16%</option>
                  <option value="0">0% — Exento</option>
                </select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">
                  Precio base (RD$) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={precio}
                  onChange={e => { setPrecio(e.target.value); setFormErrors(v => ({...v, precio: ''})); }}
                  placeholder="0.00"
                  className={`font-mono text-sm ${formErrors.precio ? 'border-red-400' : ''}`}
                />
                {formErrors.precio && <p className="text-xs text-red-500 mt-1">{formErrors.precio}</p>}
              </div>
            </div>
          </div>

          <NavFooter onBack={onBack} onNext={startEmission} nextLabel="Iniciar pruebas" />
        </div>
      )}

      {/* ── Step 1: Envío y progreso ── */}
      {sub === 1 && (
        <div className="space-y-4">

          {/* Banner mientras EMITIMOS a DGII */}
          {currentType && !polling && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-blue-200 bg-blue-50">
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
              <p className="text-sm text-blue-800">
                Enviando comprobantes tipo <span className="font-bold">{currentType.replace(/[grb]/g, '')}</span>…
              </p>
            </div>
          )}

          {/* Banner mientras DGII VALIDA los trackIds — polling activo */}
          {polling && (
            <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 space-y-1.5">
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 text-amber-600 animate-spin shrink-0" />
                <p className="text-sm font-semibold text-amber-900">
                  DGII está validando tus comprobantes…
                </p>
              </div>
              <p className="text-xs text-amber-800 pl-6">
                {(() => {
                  const totalValidados = Object.values(validatedByTipo).reduce((a, b) => a + b, 0);
                  const totalRequeridos = PRUEBA_ECF_TYPES
                    .filter(t => t.required !== null)
                    .reduce((a, b) => a + (b.required ?? 0), 0);
                  return `Validados ${totalValidados} de ${totalRequeridos} · esto puede tomar 1–3 minutos. No cierres esta ventana.`;
                })()}
              </p>
            </div>
          )}

          {/* Banner cuando todo está aceptado (un instante antes de auto-avanzar) */}
          {gridDone && !polling && !fc250Done && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-teal-200 bg-teal-50">
              <CheckCircle className="h-4 w-4 text-teal-600 shrink-0" />
              <p className="text-sm font-semibold text-teal-900">Pruebas validadas exitosamente</p>
            </div>
          )}

          {/* Banner de error / rechazo DGII */}
          {emitError && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-3">
              {/* Encabezado */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0 rounded-full bg-red-100 p-1.5">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-900">
                    {emitError.startsWith('DGII rechazó')
                      ? 'La DGII rechazó los comprobantes de prueba'
                      : 'Ocurrió un error al enviar los comprobantes'}
                  </p>
                  <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                    {emitError.startsWith('DGII rechazó')
                      ? 'Uno o más comprobantes fueron rechazados por validación de esquema. Haz clic en el botón para volver al inicio y reintentar.'
                      : 'No se pudo completar el envío. Verifica tu conexión o inténtalo de nuevo.'}
                  </p>
                </div>
              </div>

              {/* Detalle técnico colapsable (opcional) */}
              <details className="group">
                <summary className="text-[11px] text-red-500 cursor-pointer select-none list-none flex items-center gap-1 hover:text-red-700">
                  <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                  Ver detalle del error
                </summary>
                <pre className="mt-2 text-[10px] text-red-700 bg-red-100/60 rounded-lg p-2 overflow-auto max-h-28 whitespace-pre-wrap break-words">
                  {emitError}
                </pre>
              </details>

              {/* CTA principal */}
              <button
                onClick={() => {
                  // Limpiar trackIds persistidos para que al recargar no reanude el polling fallido
                  import('@/lib/habilitacion/client').then(({ guardarEstado }) => {
                    guardarEstado({ pruebas: { trackIds: [] } }).catch(() => {});
                  });
                  reset();
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-sm font-semibold px-4 py-2 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Volver al inicio y reintentar
              </button>
            </div>
          )}

          {/* Grid + screenshot lado a lado */}
          <div className="grid lg:grid-cols-2 gap-4 items-start">

            {/* Izquierda: contadores compactos */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Estado del Set de Pruebas
              </p>
              <div className="grid grid-cols-2 gap-1.5">
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
                    <div key={t.tipo} className={`rounded-lg border px-3 py-2 transition-all
                      ${done   ? 'border-teal-200 bg-teal-50'
                      : active ? 'border-blue-200 bg-blue-50/60'
                      :          'border-gray-100 bg-white'}`}>
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-base font-bold font-mono leading-none
                          ${done ? 'text-teal-600' : active ? 'text-blue-600' : 'text-gray-300'}`}>
                          {count}/{req}
                        </span>
                        {done   && <Check   className="h-3.5 w-3.5 text-teal-500 shrink-0" />}
                        {active && <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />}
                      </div>
                      <p className={`text-[10px] font-medium leading-tight
                        ${done ? 'text-teal-700' : active ? 'text-blue-700' : 'text-gray-400'}`}>
                        Tipo {label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Derecha: screenshot inline pequeño */}
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shrink-0">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                <ImageIcon className="h-3 w-3 text-gray-400" />
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Así se ve en el portal DGII
                </p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dgii-guia/paso4-pruebas-simulacion.png"
                alt="Estado de pruebas en el portal DGII"
                className="w-full h-auto"
              />
              <p className="text-[10px] text-gray-500 px-3 py-2 border-t border-gray-100 leading-snug">
                El portal DGII muestra el mismo progreso por tipo. Puedes verificar allí en tiempo real.
              </p>
            </div>
          </div>

          {/* Navegación: se bloquea durante emisión y polling — solo aparece
              cuando todo está aceptado (auto-avance ya se dispara, pero dejamos
              el botón por si el usuario quiere hacerlo manual). */}
          {!currentType && !polling && (
            <NavFooter
              onBack={() => setSub(0)}
              onNext={() => goSub(2)}
              nextDisabled={!gridDone}
              nextLabel="Siguiente →"
            />
          )}
        </div>
      )}

      {/* ── Sub 2: Factura de consumo <250K ── */}
      {sub === 2 && (
        <div className="space-y-5">
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <div className="space-y-4">
              <InfoBox color="amber" title="Un paso más en el portal DGII">
                Descarga tu factura de consumo (&lt; RD$250 mil) y{' '}
                <strong>súbela al portal DGII</strong> en la sección{' '}
                &ldquo;Facturas de consumo &lt;250Mil&rdquo;.
              </InfoBox>

              <Button
                variant="outline"
                className="gap-2 text-sm w-full"
                disabled={downloading32b}
                onClick={handleDownload32b}
              >
                {downloading32b
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Generando PDF…</>
                  : <><Download className="h-4 w-4" />Descargar factura de consumo (&lt;RD$250K)</>}
              </Button>

              {download32bError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-red-700">{download32bError}</p>
                  </div>
                  <button onClick={() => setDownload32bError(null)} className="text-red-400 hover:text-red-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <InfoBox color="blue" title="Si la DGII la rechaza">
                Será necesario reiniciar todas las pruebas de simulación.{' '}
                <button className="underline font-semibold" onClick={() => { reset(); setSub(1); }}>
                  Reiniciar envío
                </button>
              </InfoBox>
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b flex items-center gap-1.5">
                <ImageIcon className="h-3 w-3 text-gray-400" />
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Dónde subirla en el portal
                </p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dgii-guia/paso4-fc-menor-250k.png"
                alt="Sección Facturas de consumo menor a 250K en el portal DGII"
                className="w-full h-auto"
              />
              <p className="text-[10px] text-gray-500 px-3 py-2 border-t border-gray-100 leading-snug">
                Baja hasta &ldquo;Facturas de consumo &lt;250Mil&rdquo;, selecciona el PDF y haz clic en ENVIAR.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={fc250Done}
              onChange={async e => {
                const v = e.target.checked;
                setFc250Done(v);
                const { guardarEstado } = await import('@/lib/habilitacion/client');
                guardarEstado({ pruebas: { fc250Done: v } }).catch(() => {});
              }}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600"
            />
            <span className="text-sm text-gray-700">
              Subí con éxito la factura de consumo al portal DGII
            </span>
          </label>

          <NavFooter
            onBack={() => setSub(1)}
            onNext={() => goSub(3)}
            nextDisabled={!fc250Done}
            nextLabel="Ver confirmación"
          />
        </div>
      )}

      {/* ── Sub 3: Confirmación ── */}
      {sub === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                <CheckCircle className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-teal-900">Pruebas de simulación completadas</p>
                <p className="text-xs text-teal-700 mt-0.5">
                  Todos los e-CF de prueba fueron aceptados por la DGII
                </p>
              </div>
            </div>
          </div>

          <InfoBox color="blue" title="Próximo: Representación Impresa">
            Ahora DGII necesita validar los <strong>PDFs impresos</strong> de cada tipo de comprobante.
            Son 11 archivos (uno por tipo) que te entregamos en el siguiente paso.
          </InfoBox>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={async e => {
                const v = e.target.checked;
                setConfirmed(v);
                const { guardarEstado } = await import('@/lib/habilitacion/client');
                guardarEstado({ pruebas: { confirmed: v } }).catch(() => {});
              }}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600" />
            <span className="text-sm text-gray-700">
              Confirmo que el Set de Pruebas fue aprobado en el portal DGII
            </span>
          </label>

          <NavFooter onBack={() => setSub(2)} onNext={onComplete} nextDisabled={!confirmed} />
        </div>
      )}
    </div>
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
      const res = await fetch('/api/habilitacion/pdf-representacion', {
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

      {/* ── Sub 0: Descargar los 11 PDFs ── */}
      {sub === 0 && (
        <div className="space-y-5">
          <InfoBox color="amber" title="11 representaciones impresas requeridas">
            DGII necesita aprobar el PDF impreso de cada tipo de comprobante. EmiteDo los genera
            automáticamente con los QR correctos — solo descárgalos y súbelos al portal.
          </InfoBox>

          <div className="flex items-center justify-between">
            <Button onClick={handleDownloadAll} disabled={downloadingAll || !!downloading || allDone} variant="outline" className="gap-2">
              {downloadingAll
                ? <><Loader2 className="h-4 w-4 animate-spin" />Descargando {downloaded.size + 1} de {PDFS.length}…</>
                : allDone
                ? <><CheckCircle className="h-4 w-4 text-teal-500" />Todos descargados</>
                : <><Download className="h-4 w-4" />Descargar todos (uno a uno)</>}
            </Button>
            <span className="text-xs font-mono text-gray-500">
              {downloaded.size}/{PDFS.length}
            </span>
          </div>

          {downloadError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700">Error al descargar PDF</p>
                <p className="text-xs text-red-600 mt-0.5">{downloadError}</p>
              </div>
              <button onClick={() => setDownloadError(null)} className="text-red-400 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            {PDFS.map(pdf => {
              const done = downloaded.has(pdf.tipo);
              const busy = downloading === pdf.tipo;
              return (
                <div key={pdf.tipo} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all
                  ${done ? 'border-teal-200 bg-teal-50/60' : 'border-gray-200 bg-white'}`}>
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold
                    ${done ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>
                    {pdf.tipo.replace(/[ab]/g, '')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{pdf.nombre}</p>
                    <p className="text-xs text-gray-400">{pdf.tam}</p>
                  </div>
                  <button onClick={() => !done && !busy && handleDownloadOne(pdf.tipo)} disabled={done || busy}
                    className={`shrink-0 p-1.5 rounded-lg transition-colors
                      ${done ? 'text-teal-500 cursor-default' : busy ? 'text-gray-300' : 'text-gray-400 hover:text-teal-600 hover:bg-teal-50'}`}>
                    {busy
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : done
                      ? <CheckCircle className="h-4 w-4" />
                      : <Download className="h-4 w-4" />}
                  </button>
                </div>
              );
            })}
          </div>

          <NavFooter
            onBack={onBack}
            onNext={() => setSub(1)}
            nextDisabled={!allDone}
            nextLabel="Ya los descargué"
          />
        </div>
      )}

      {/* ── Sub 1: Confirmar subida al portal ── */}
      {sub === 1 && (
        <div className="space-y-5">
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

          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border border-gray-200 hover:border-teal-300 transition-colors">
            <input
              type="checkbox"
              checked={uploadConfirmed}
              onChange={e => setUploadConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600"
            />
            <span className="text-sm text-gray-700">
              Subí los 11 PDFs al portal DGII y di clic en <strong>ENVIAR ARCHIVOS</strong>
            </span>
          </label>

          <NavFooter
            onBack={() => setSub(0)}
            onNext={() => setSub(2)}
            nextDisabled={!uploadConfirmed}
            nextLabel="Esperar validación"
          />
        </div>
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
          <p className="text-xs text-amber-600 mt-3 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Si DGII rechaza alguna representación, recibirás un correo con los detalles. Vuelve a este paso,
              descarga nuevamente el PDF corregido y re-súbelo al portal.
            </span>
          </p>
        </>
      )}
    </div>
  );
}

// ─── Phase 3: URLs de producción ─────────────────────────────────────────────

function PhaseUrls({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const [rnc,       setRnc]       = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    fetch('/api/equipo/perfil').then(r => r.json()).then(d => setRnc(d.rnc ?? ''));
  }, []);

  const urls = {
    recepcion:    withRnc(URLS_BASE.recepcion,     rnc),
    aprobacion:   withRnc(URLS_BASE.aprobacion,    rnc),
    autenticacion:withRnc(URLS_BASE.autenticacion, rnc),
  };

  return (
    <div className="space-y-5">
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
                <button onClick={() => { setXmlFile(null); setSigned(false); setSent(false); }}
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
              <Button onClick={handleSign} disabled={!xmlFile || signing} className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
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
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Descargar
                </Button>
              </div>
            )}
          </div>

          {/* Step 3 */}
          <div className={`rounded-xl border p-5 space-y-4 transition-all ${sent ? 'border-teal-200' : !signed ? 'border-gray-100 opacity-40' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                ${sent ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {sent ? <Check className="h-3.5 w-3.5" /> : '3'}
              </div>
              <p className="text-sm font-semibold text-gray-800">Enviar al portal DGII</p>
            </div>
            {!sent ? (
              <Button onClick={handleSend} disabled={!signed || sending} className="w-full bg-teal-600 hover:bg-teal-700 gap-2">
                {sending
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Enviando a DGII…</>
                  : <><ExternalLink className="h-4 w-4" />Enviar declaración jurada</>}
              </Button>
            ) : (
              <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg p-3 text-teal-800">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <p className="text-sm font-medium">Enviada y recibida por la DGII</p>
              </div>
            )}
          </div>

          <NavFooter
            onBack={onBack}
            onNext={() => setSub(1)}
            nextDisabled={!sent}
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
              Ya puedes emitir e-CF en producción desde EmiteDo.
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
        estatus de tus e-CF. <strong>No necesitas entrar ahí para emitir facturas</strong> — EmiteDo
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
            <p className="text-sm font-semibold text-teal-900">EmiteDo ya está en producción</p>
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
          Entiendo que desde ahora cada e-CF que emita en EmiteDo es <strong>real</strong> y se envía
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
            EmiteDo te guía paso a paso por el proceso de habilitación ante la DGII.
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
                <p className="text-base font-bold text-gray-900">EmiteDo gestiona todo por mí</p>
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

      <div className="min-h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Habilitación e-CF</h1>
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

          {/* ── Wizard 6 fases ── */}
          {stage === 'wizard' && (
            <div className="space-y-4">
              {!isDone && <EtapasHero />}

              <div className="flex gap-8">
                <Sidebar phase={isDone ? PHASES.length : phase} completed={completed} onJump={handleJump} />
                <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-6 min-h-[540px]">
                  {!isDone ? (
                    <>
                      <div className="mb-6">
                        <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                          <span className="shrink-0">Fase {phase + 1} de {PHASES.length}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div className="bg-teal-500 h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${(completed.size / PHASES.length) * 100}%` }} />
                          </div>
                          <span className="shrink-0">{Math.round((completed.size / PHASES.length) * 100)}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-gray-900">{PHASE_TITLES[phase]}</h2>
                          {mode === 'asistido' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                              <Zap className="h-3 w-3" /> Asistido
                            </span>
                          )}
                        </div>
                      </div>

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
