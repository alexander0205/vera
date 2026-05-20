'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserCheck, Database, FileCheck, FlaskConical, Printer, ScanLine,
  Link2, PlayCircle, Inbox, ThumbsUp, Globe, ScrollText, ShieldCheck,
  PartyPopper, ChevronDown, ChevronRight, Circle, CheckCircle2,
  Clock, AlertCircle, Rocket, Copy, Check, ExternalLink, Settings, User,
  FileSignature, Upload, Download, Loader2, X, ArrowRight, RotateCcw,
} from 'lucide-react';
import { firmarXml, descargarBase64 } from '@/lib/habilitacion/client';

// ─── Persistencia local del progreso (per-teamId) ────────────────────────────

const STORAGE_VERSION = 1;
const storageKey = (teamId: number) => `emitedo:admin:habilitacion:v${STORAGE_VERSION}:team-${teamId}`;

interface PersistedStep1 {
  uploadedXmlName?:  string;
  signedXmlBase64?:  string;
  signedXmlNombre?:  string;
  signedAt?:         string;  // ISO
}

interface PersistedState {
  currentStep:  number;
  completed:    number[];  // step ids marcados completos
  step1?:       PersistedStep1;
  // futuro: step2?, step3?, ...
}

const EMPTY_STATE: PersistedState = { currentStep: 1, completed: [] };

function loadState(teamId: number): PersistedState {
  if (typeof window === 'undefined') return EMPTY_STATE;
  try {
    const raw = localStorage.getItem(storageKey(teamId));
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as PersistedState;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return EMPTY_STATE;
  }
}

function saveState(teamId: number, state: PersistedState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(teamId), JSON.stringify(state));
  } catch (e) {
    console.error('[habilitacion] localStorage write failed', e);
  }
}

function useHabilitacionState(teamId: number) {
  const [state, setStateRaw] = useState<PersistedState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);

  // Hidratar tras mount (evita mismatch SSR)
  useEffect(() => {
    setStateRaw(loadState(teamId));
    setHydrated(true);
  }, [teamId]);

  const update = useCallback((mut: (s: PersistedState) => PersistedState) => {
    setStateRaw(prev => {
      const next = mut(prev);
      saveState(teamId, next);
      return next;
    });
  }, [teamId]);

  const reset = useCallback(() => {
    setStateRaw(EMPTY_STATE);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(storageKey(teamId));
    }
  }, [teamId]);

  return { state, update, reset, hydrated };
}

// ─── Constantes proveedor del software (EmiteDO / Yisrael Tech) ──────────────
// Coinciden con app/(dashboard)/dashboard/habilitacion/page.tsx
const SOFTWARE_PROVIDER = {
  tipo:        'EXTERNO' as const,
  rnc:         '1333307391',
  razonSocial: 'Yisrael Technology SRL',
};

type Status = 'pending' | 'in-progress' | 'done' | 'error';

interface SubScreen {
  label: string;
  desc: string;
}

interface Step {
  id: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  screens: SubScreen[];
}

const STEPS: Step[] = [
  {
    id: 1, label: 'Registrado', icon: UserCheck,
    desc: 'Contribuyente registrado en el portal DGII y vinculado al sistema.',
    screens: [
      { label: 'Datos contribuyente',  desc: 'RNC, razón social, ambiente, código público ecf-api.' },
      { label: 'Confirmación DGII',    desc: 'Estado del registro frente a DGII y fecha de alta.' },
    ],
  },
  {
    id: 2, label: 'Pruebas de Datos e-CF', icon: Database,
    desc: 'Validación de datos del contribuyente para emisión de e-CF.',
    screens: [
      { label: 'Checklist fiscal',     desc: 'RNC, razón social, dirección, teléfono, email facturación.' },
      { label: 'Catálogos cargados',   desc: 'Provincias/municipios sincronizados desde DGII.' },
      { label: 'Resultado validación', desc: 'OK / pendiente / errores por campo.' },
    ],
  },
  {
    id: 3, label: 'Pruebas de Datos Aprobación Comercial', icon: FileCheck,
    desc: 'Validación de datos para flujo de aprobación comercial.',
    screens: [
      { label: 'Checklist receptor',   desc: 'Datos requeridos para emitir/recibir aprobación.' },
      { label: 'Resultado validación', desc: 'OK / errores reportados por DGII.' },
    ],
  },
  {
    id: 4, label: 'Pruebas Simulación e-CF', icon: FlaskConical,
    desc: 'Emisión del Set de Pruebas oficial DGII.',
    screens: [
      { label: 'Tanda 1: 31, 32, 41, 43, 44, 45, 46, 47', desc: 'Base — deben aprobarse primero.' },
      { label: 'Tanda 2: 33 (ND), 34 (NC)',                desc: 'Notas referidas a tipos aprobados.' },
      { label: 'Tanda 3: RFCE',                             desc: 'Resumen Factura Consumo Electrónica.' },
      { label: 'Tabla trackIds + polling estados',          desc: 'Estado real por comprobante (Aceptado/Rechazado/En Proceso).' },
    ],
  },
  {
    id: 5, label: 'Pruebas Simulación Representación Impresa', icon: Printer,
    desc: 'Generación de PDFs de representación impresa por tipo.',
    screens: [
      { label: 'Grid PDFs por tipo',     desc: '31, 32a, 32b, 33, 34, 41, 43, 44, 45, 46, 47.' },
      { label: 'Descarga individual/zip', desc: 'Botones de descarga + bundle completo.' },
    ],
  },
  {
    id: 6, label: 'Validación Representación Impresa', icon: ScanLine,
    desc: 'Subida y validación DGII de los PDFs generados.',
    screens: [
      { label: 'Upload por tipo',     desc: 'Subir PDF firmado/aprobado por DGII para cada tipo.' },
      { label: 'Resultado por tipo',  desc: 'Validado / pendiente / rechazado + comentarios.' },
    ],
  },
  {
    id: 7, label: 'URL Servicios Prueba', icon: Link2,
    desc: 'Registro de URLs del servicio web para ambiente de pruebas.',
    screens: [
      { label: 'URL Recepción e-CF',           desc: 'Endpoint público que recibe e-CF.' },
      { label: 'URL Aprobación Comercial',     desc: 'Endpoint que recibe aprobaciones.' },
      { label: 'URL Anulación',                desc: 'Endpoint para anulación de rangos.' },
      { label: 'URL Consulta',                 desc: 'Endpoint de consulta estatus.' },
    ],
  },
  {
    id: 8, label: 'Inicio Prueba Recepción e-CF', icon: PlayCircle,
    desc: 'Activación del proceso de recepción de e-CF en pruebas.',
    screens: [
      { label: 'Toggle activación',  desc: 'Notifica a DGII inicio de ventana de pruebas.' },
      { label: 'Info ventana DGII',  desc: 'Fecha/hora inicio + duración esperada.' },
    ],
  },
  {
    id: 9, label: 'Recepción e-CF', icon: Inbox,
    desc: 'e-CF recibidos de otros contribuyentes en ambiente pruebas.',
    screens: [
      { label: 'Tabla e-CF recibidos', desc: 'eNCF, emisor, monto, fecha, estado.' },
      { label: 'Detalle e-CF',          desc: 'XML, PDF, mensajes DGII.' },
    ],
  },
  {
    id: 10, label: 'Inicio Prueba Recepción Aprobación Comercial', icon: PlayCircle,
    desc: 'Activación del proceso de recepción de aprobaciones.',
    screens: [
      { label: 'Toggle activación',  desc: 'Notifica a DGII inicio de la ventana.' },
      { label: 'Info ventana DGII',  desc: 'Fecha/hora inicio + duración.' },
    ],
  },
  {
    id: 11, label: 'Recepción Aprobación Comercial', icon: ThumbsUp,
    desc: 'Aprobaciones comerciales recibidas en pruebas.',
    screens: [
      { label: 'Tabla aprobaciones', desc: 'eNCF referenciado, decisión, motivo, fecha.' },
      { label: 'Detalle aprobación', desc: 'XML firmado del receptor.' },
    ],
  },
  {
    id: 12, label: 'URL Servicios Producción', icon: Globe,
    desc: 'Registro de URLs definitivas para producción.',
    screens: [
      { label: 'URL Recepción e-CF (prod)',       desc: 'Endpoint producción.' },
      { label: 'URL Aprobación Comercial (prod)', desc: 'Endpoint producción.' },
      { label: 'URL Anulación (prod)',            desc: 'Endpoint producción.' },
      { label: 'URL Consulta (prod)',             desc: 'Endpoint producción.' },
    ],
  },
  {
    id: 13, label: 'Declaración Jurada', icon: ScrollText,
    desc: 'Firma y envío de declaración jurada de cumplimiento.',
    screens: [
      { label: 'Datos representante legal', desc: 'Nombre, cédula, cargo.' },
      { label: 'Firma XML + envío',         desc: 'Generar XML, firmar con P12, enviar a DGII.' },
      { label: 'Acuse de recibo',           desc: 'TrackId + confirmación DGII.' },
    ],
  },
  {
    id: 14, label: 'Verificación Estatus', icon: ShieldCheck,
    desc: 'DGII verifica el estatus final de la habilitación.',
    screens: [
      { label: 'Estado DGII',         desc: 'Postulación aprobada / pendiente / rechazada.' },
      { label: 'Diagnóstico',         desc: 'Listado de checks superados y pendientes.' },
    ],
  },
  {
    id: 15, label: 'Finalizado', icon: PartyPopper,
    desc: 'Habilitación aprobada — listo para emitir en producción.',
    screens: [
      { label: 'Resumen final',  desc: 'Fechas, ambiente, RNC, e-CF habilitados.' },
      { label: 'Acceso OFV',     desc: 'Link al portal DGII OFV en producción.' },
    ],
  },
];

interface Props {
  teamId: number;
  embedded?: boolean;
  software?: { nombre: string; version: string; ambienteDefault: string } | null;
  webhookBaseUrl?: string | null;
  codigoPublico?: string;
  rnc?: string;
  ambiente?: string;
}

export function HabilitacionStepper({
  teamId,
  embedded = false,
  software = null,
  webhookBaseUrl = null,
  codigoPublico,
  rnc,
  ambiente,
}: Props) {
  const { state, update, reset, hydrated } = useHabilitacionState(teamId);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Auto-expand paso actual al hidratar
  useEffect(() => {
    if (hydrated && expanded === null) setExpanded(state.currentStep);
  }, [hydrated, state.currentStep, expanded]);

  // Helper: status derivado del state persistido
  const statusOf = (id: number): Status => {
    if (state.completed.includes(id)) return 'done';
    if (id === state.currentStep) return 'in-progress';
    return 'pending';
  };

  const completedCount = state.completed.length;
  const pctComplete    = (completedCount / STEPS.length) * 100;
  const inProgress     = STEPS.find(s => statusOf(s.id) === 'in-progress');

  function markStepDone(id: number) {
    update(s => ({
      ...s,
      completed:   s.completed.includes(id) ? s.completed : [...s.completed, id],
      currentStep: Math.min(STEPS.length, Math.max(s.currentStep, id + 1)),
    }));
    // mover expansión al siguiente
    setExpanded(Math.min(STEPS.length, id + 1));
  }

  function goToStep(id: number) {
    update(s => ({ ...s, currentStep: id }));
    setExpanded(id);
  }

  return (
    <div className={embedded ? '-m-5' : 'bg-white rounded-xl border border-gray-200 overflow-hidden'}>
      {/* Header con progreso global */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-br from-teal-50/40 to-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
            <Rocket className="w-5 h-5 text-teal-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">Habilitación DGII</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Team #{teamId} · {completedCount} de {STEPS.length} pasos completados
              {inProgress && ` · paso ${inProgress.id} en progreso`}
            </p>
          </div>
          {completedCount > 0 && (
            <button
              type="button"
              onClick={() => { if (confirm('¿Reiniciar todo el progreso de habilitación de este team?')) reset(); }}
              className="text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50"
              title="Reiniciar progreso local"
            >
              <RotateCcw className="w-3 h-3" /> Reiniciar
            </button>
          )}
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold text-teal-700 tabular-nums">{pctComplete.toFixed(0)}%</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">completado</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-teal-600 transition-all"
            style={{ width: `${pctComplete}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <ul className="divide-y divide-gray-100">
        {STEPS.map((step) => (
          <StepRow
            key={step.id}
            step={step}
            status={statusOf(step.id)}
            isOpen={expanded === step.id}
            onToggle={() => setExpanded(expanded === step.id ? null : step.id)}
            onMarkDone={() => markStepDone(step.id)}
            onGoTo={() => goToStep(step.id)}
            isCurrent={step.id === state.currentStep}
            persisted={state}
            persistUpdate={update}
            ctx={{ software, webhookBaseUrl, codigoPublico, rnc, ambiente }}
          />
        ))}
      </ul>
    </div>
  );
}

interface StepCtx {
  software:        { nombre: string; version: string; ambienteDefault: string } | null;
  webhookBaseUrl:  string | null;
  codigoPublico?:  string;
  rnc?:            string;
  ambiente?:       string;
}

function StepRow({
  step, status, isOpen, onToggle, onMarkDone, onGoTo, isCurrent, persisted, persistUpdate, ctx,
}: {
  step: Step;
  status: Status;
  isOpen: boolean;
  onToggle: () => void;
  onMarkDone: () => void;
  onGoTo: () => void;
  isCurrent: boolean;
  persisted: PersistedState;
  persistUpdate: (mut: (s: PersistedState) => PersistedState) => void;
  ctx: StepCtx;
}) {
  const Icon = step.icon;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50/80 transition-colors text-left group"
      >
        {/* Número grande con anillo */}
        <div className={`relative flex items-center justify-center w-11 h-11 rounded-full font-bold text-sm flex-shrink-0 transition-colors
          ${status === 'done'
            ? 'bg-emerald-500 text-white'
            : status === 'in-progress'
              ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-400'
              : status === 'error'
                ? 'bg-red-100 text-red-700 ring-2 ring-red-400'
                : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
          }`}>
          {status === 'done' ? <CheckCircle2 className="w-5 h-5" /> : step.id}
        </div>

        {/* Icono + título + desc */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Icon className={`w-5 h-5 flex-shrink-0 ${
            status === 'done' ? 'text-emerald-600' :
            status === 'in-progress' ? 'text-amber-600' :
            status === 'error' ? 'text-red-600' :
            'text-gray-400'
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{step.label}</p>
            <p className="text-xs text-gray-500 truncate hidden sm:block">{step.desc}</p>
          </div>
        </div>

        {/* Status pill */}
        <StatusPill status={status} />

        {/* Sub-screens count */}
        <span className="text-[10px] text-gray-400 font-mono hidden md:inline">
          {step.screens.length} pantalla{step.screens.length === 1 ? '' : 's'}
        </span>

        {/* Expand chevron */}
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {/* Body expandido */}
      {isOpen && (
        <div className="px-6 pb-5 pt-1 pl-[5.25rem] bg-gray-50/40 border-t border-gray-100">
          {step.id === 1 ? (
            <Step1Body ctx={ctx} persisted={persisted} persistUpdate={persistUpdate} />
          ) : (
            <StepPlaceholderBody step={step} />
          )}

          {/* Nav footer: marcar completado / siguiente */}
          <StepNavFooter
            stepId={step.id}
            status={status}
            isCurrent={isCurrent}
            onMarkDone={onMarkDone}
          />
        </div>
      )}
    </li>
  );
}

function StepNavFooter({ stepId, status, isCurrent, onMarkDone }: {
  stepId: number;
  status: Status;
  isCurrent: boolean;
  onMarkDone: () => void;
}) {
  const isLast = stepId === STEPS.length;

  if (status === 'done') {
    return (
      <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
        <span className="text-[11px] text-emerald-700 flex items-center gap-1.5 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> Paso completado y guardado
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between gap-3">
      <p className="text-[11px] text-gray-500">
        {isCurrent
          ? 'Cuando termines aquí, marca completado para avanzar al siguiente paso.'
          : 'Este paso no es el actual. Puedes revisarlo pero marcarlo no salta el orden.'}
      </p>
      <button
        type="button"
        onClick={onMarkDone}
        className="text-xs bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-1.5 rounded-md flex items-center gap-1.5 flex-shrink-0"
      >
        {isLast ? 'Finalizar habilitación' : 'Marcar completado y continuar'}
        {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ─── Step 1: Registrado / Datos del software a utilizar ──────────────────────

function Step1Body({ ctx, persisted, persistUpdate }: {
  ctx: StepCtx;
  persisted: PersistedState;
  persistUpdate: (mut: (s: PersistedState) => PersistedState) => void;
}) {
  // DGII portal añade el suffix (/recepcion/api/ecf, etc) — solo pegar webhookBaseUrl.
  const baseValue = ctx.webhookBaseUrl ?? 'Cargando…';

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <ExternalLink className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 text-xs text-blue-900">
          <p className="font-semibold mb-0.5">Registrar en portal DGII</p>
          <p className="text-blue-800/80">
            Copia los campos abajo y pégalos en el formulario del portal DGII
            ({ctx.ambiente === 'Produccion' ? 'producción' : ctx.ambiente === 'CerteCF' ? 'CerteCF' : 'TesteCF'}).
            Luego usa el bloque de la derecha para firmar el XML descargado.
          </p>
        </div>
        <a
          href={ctx.ambiente === 'Produccion'
            ? 'https://ecf.dgii.gov.do/ecf/contribuyentes'
            : ctx.ambiente === 'CerteCF'
              ? 'https://ecf.dgii.gov.do/certecf/contribuyentes'
              : 'https://ecf.dgii.gov.do/testecf/contribuyentes'}
          target="_blank" rel="noopener noreferrer"
          className="text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1.5 rounded-md flex items-center gap-1 flex-shrink-0"
        >
          Abrir portal <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* 2-col: izq form datos · der upload+firmar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* IZQ: form portal DGII (2/3) */}
        <div className="xl:col-span-2 space-y-5">
          {/* Datos del software a utilizar */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-800">Datos del software a utilizar</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <DgiiCopyField label="Tipo de software"     value={SOFTWARE_PROVIDER.tipo} required={false} />
              <DgiiCopyField label="Nombre del software"  value={software_or_loading(ctx.software?.nombre)} />
              <DgiiCopyField label="Versión del software" value={software_or_loading(ctx.software?.version)} />
            </div>

            <div className="space-y-3">
              <DgiiCopyField label="URL de recepción"            value={baseValue} isUrl />
              <DgiiCopyField label="URL de aprobación comercial" value={baseValue} isUrl />
              <DgiiCopyField label="URL de autenticación"        value={baseValue} isUrl />
            </div>
          </section>

          {/* Datos del proveedor electrónico */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-800">Datos del proveedor electrónico</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <DgiiCopyField label="RNC / Cédula" value={SOFTWARE_PROVIDER.rnc} />
              <DgiiCopyField label="Razón social" value={SOFTWARE_PROVIDER.razonSocial} className="md:col-span-2" />
            </div>
          </section>

          {/* Datos del contribuyente vinculado */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <UserCheck className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-800">Contribuyente vinculado</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <DgiiCopyField label="RNC contribuyente" value={ctx.rnc ?? '—'} required={false} />
              <DgiiCopyField label="Código público"    value={ctx.codigoPublico ?? '—'} required={false} />
              <DgiiCopyField label="Ambiente"          value={ctx.ambiente ?? '—'} required={false} />
            </div>
          </section>
        </div>

        {/* DER: upload + firmar XML postulación (1/3) */}
        <div className="xl:col-span-1">
          <FirmarPostulacionPanel
            rnc={ctx.rnc}
            codigoPublico={ctx.codigoPublico}
            persisted={persisted}
            persistUpdate={persistUpdate}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Panel firmar XML postulación ────────────────────────────────────────────

function FirmarPostulacionPanel({ rnc, codigoPublico, persisted, persistUpdate }: {
  rnc?: string;
  codigoPublico?: string;
  persisted: PersistedState;
  persistUpdate: (mut: (s: PersistedState) => PersistedState) => void;
}) {
  const [file, setFile]       = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Recuperar del store
  const persistedStep1   = persisted.step1 ?? {};
  const uploadedXmlName  = persistedStep1.uploadedXmlName;
  const signed           = persistedStep1.signedXmlBase64 && persistedStep1.signedXmlNombre
    ? { base64: persistedStep1.signedXmlBase64, nombre: persistedStep1.signedXmlNombre }
    : null;

  const displayFileName = file?.name ?? uploadedXmlName;

  async function handleFirmar() {
    if (!file) return;
    if (!codigoPublico) {
      setError('Empresa sin vinculación ecf-api — no se puede firmar.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await firmarXml({
        xmlFile:       file,
        proposito:     'postulacion',
        codigoPublico,  // ← admin firma con cert de esa empresa
      });
      persistUpdate(s => ({
        ...s,
        step1: {
          uploadedXmlName: file.name,
          signedXmlBase64: r.xmlFirmadoBase64,
          signedXmlNombre: r.xmlFirmadoNombre,
          signedAt:        new Date().toISOString(),
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error firmando XML');
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!signed) return;
    descargarBase64(signed.base64, signed.nombre, 'application/xml');
  }

  function handleReset() {
    setFile(null);
    setError(null);
    persistUpdate(s => ({ ...s, step1: undefined }));
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <FileSignature className="w-4 h-4 text-teal-600" />
        <h3 className="text-sm font-semibold text-gray-800">Firma del XML de postulación</h3>
      </div>

      {/* Pasos numerados */}
      <ol className="space-y-3 flex-1">
        {/* Paso 1: generar archivo en portal */}
        <li className="flex gap-2.5">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold flex items-center justify-center">1</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800">Generar archivo en DGII</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              En el portal DGII llena los campos y haz clic en <strong>"Generar archivo"</strong>.
              Descargarás un XML sin firmar.
            </p>
          </div>
        </li>

        {/* Paso 2: subir XML */}
        <li className="flex gap-2.5">
          <span className={`flex-shrink-0 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
            displayFileName ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}>
            {displayFileName ? <Check className="w-3 h-3" /> : '2'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800">Subir XML sin firmar</p>
            {!displayFileName ? (
              <label className="mt-1.5 block">
                <input
                  type="file"
                  accept=".xml,application/xml,text/xml"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { setFile(f); setError(null); }
                  }}
                  className="block w-full text-[11px] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:bg-gray-100 file:text-gray-700 file:font-medium hover:file:bg-gray-200 file:cursor-pointer cursor-pointer text-gray-500"
                />
              </label>
            ) : (
              <div className="mt-1.5 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5">
                <Upload className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span className="text-[11px] text-gray-700 font-mono truncate flex-1">{displayFileName}</span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-gray-400 hover:text-red-500"
                  title="Quitar archivo"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </li>

        {/* Paso 3: firmar */}
        <li className="flex gap-2.5">
          <span className={`flex-shrink-0 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
            signed ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'
          }`}>
            {signed ? <Check className="w-3 h-3" /> : '3'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800">Firmar con certificado P12</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Aplicamos XMLDSig RSA-SHA256 con el cert de {rnc ? `RNC ${rnc}` : 'esta empresa'}.
              {persistedStep1.signedAt && ` Firmado: ${new Date(persistedStep1.signedAt).toLocaleString('es-DO')}`}
            </p>
            {!signed && (
              <button
                type="button"
                onClick={handleFirmar}
                disabled={!file || loading}
                className="mt-2 w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-semibold px-3 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors"
              >
                {loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Firmando…</>
                ) : (
                  <><FileSignature className="w-3.5 h-3.5" /> Firmar XML</>
                )}
              </button>
            )}
          </div>
        </li>

        {/* Paso 4: descargar */}
        {signed && (
          <li className="flex gap-2.5">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold flex items-center justify-center">4</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800">Descargar XML firmado</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Luego súbelo al portal DGII para completar la postulación.</p>
              <button
                type="button"
                onClick={handleDownload}
                className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Descargar {signed.nombre}
              </button>
            </div>
          </li>
        )}
      </ol>

      {/* Error */}
      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-red-700 flex-1">{error}</p>
        </div>
      )}

      {/* Reset si firmado */}
      {signed && (
        <button
          type="button"
          onClick={handleReset}
          className="mt-3 text-[11px] text-gray-500 hover:text-gray-700 underline self-center"
        >
          Firmar otro XML
        </button>
      )}
    </div>
  );
}

function software_or_loading(v: string | undefined) {
  return v && v.length > 0 ? v : 'Cargando…';
}

// ─── Campo estilo portal DGII con copy button ────────────────────────────────

function DgiiCopyField({ label, value, isUrl = false, required = true, className = '' }: {
  label: string;
  value: string;
  isUrl?: boolean;
  required?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="flex items-center border border-gray-300 rounded-md bg-white overflow-hidden focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-400">
        {isUrl && (
          <span className="shrink-0 px-2.5 py-1.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 select-none font-mono">
            https://
          </span>
        )}
        <span className="flex-1 px-3 py-1.5 text-xs text-gray-900 truncate min-w-0 font-mono">
          {isUrl ? value.replace(/^https?:\/\//, '') : value}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 px-2.5 py-1.5 border-l border-gray-200 bg-gray-50 hover:bg-teal-50 text-gray-400 hover:text-teal-600 transition-colors"
          title="Copiar"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ─── Placeholder body para pasos 2-15 ─────────────────────────────────────────

function StepPlaceholderBody({ step }: { step: Step }) {
  return (
    <>
      <p className="text-xs text-gray-600 mb-3 leading-relaxed">{step.desc}</p>

      {/* Sub-pantallas grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
        {step.screens.map((sc, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-mono text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">
                {step.id}.{i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800">{sc.label}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{sc.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-dashed border-gray-300 rounded-lg p-3 text-center">
        <p className="text-xs text-gray-400">
          Acciones de este paso pendientes de wire (endpoint por conectar).
        </p>
      </div>
    </>
  );
}

function StatusPill({ status }: { status: Status }) {
  const config = {
    'pending':     { label: 'Pendiente',   icon: Circle,        cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    'in-progress': { label: 'En progreso', icon: Clock,         cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    'done':        { label: 'Completo',    icon: CheckCircle2,  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    'error':       { label: 'Error',       icon: AlertCircle,   cls: 'bg-red-50 text-red-700 border-red-200' },
  }[status];

  const Icon = config.icon;
  return (
    <span className={`text-[10px] uppercase tracking-wide border px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 flex-shrink-0 ${config.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </span>
  );
}
