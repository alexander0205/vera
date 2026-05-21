'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserCheck, Database, FileCheck, FlaskConical, Printer, ScanLine,
  Link2, PlayCircle, Inbox, ThumbsUp, Globe, ScrollText, ShieldCheck,
  PartyPopper, ChevronDown, ChevronRight, Circle, CheckCircle2,
  Clock, AlertCircle, Rocket, Copy, Check, ExternalLink, Settings, User,
  FileSignature, Upload, Download, Loader2, X, ArrowRight, RotateCcw, FileText,
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

interface PersistedStep2 {
  runId?:       string;
  status?:      string;  // PENDIENTE | PROCESANDO | COMPLETO | FALLIDO
  lastChecked?: string;  // ISO
}

interface PersistedStep3 {
  lastResult?:  {
    total: number;
    ok: number;
    failed: number;
    rows?: Array<{ eNcf?: string; estadoEnvio?: string; estadoDgii?: string; trackId?: string; error?: string }>;
  };
  lastRunAt?:   string;  // ISO
}

interface PersistedStep4 {
  runId?:       string;
  status?:      string;
  ncfStart?:    number;
  lastChecked?: string;
}

interface PersistedState {
  currentStep:  number;
  completed:    number[];  // step ids marcados completos
  step1?:       PersistedStep1;
  step2?:       PersistedStep2;
  step3?:       PersistedStep3;
  step4?:       PersistedStep4;
  // futuro: step5?, ...
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
            ctx={{ teamId, software, webhookBaseUrl, codigoPublico, rnc, ambiente }}
          />
        ))}
      </ul>
    </div>
  );
}

interface StepCtx {
  teamId:          number;
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
          ) : step.id === 2 ? (
            <Step2Body ctx={ctx} persisted={persisted} persistUpdate={persistUpdate} />
          ) : step.id === 3 ? (
            <Step3Body ctx={ctx} persisted={persisted} persistUpdate={persistUpdate} />
          ) : step.id === 4 ? (
            <Step4Body ctx={ctx} persisted={persisted} persistUpdate={persistUpdate} />
          ) : step.id === 5 ? (
            <Step5Body ctx={ctx} persisted={persisted} />
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

// ─── Step 2: Pruebas de Datos e-CF ────────────────────────────────────────────
// Mirror del portal DGII paso 2:
//   - Descargar Set de comprobantes (datos de prueba DGII)
//   - Estado actual de pruebas (counters comprobantes/resúmenes aceptados)
//   - Subir Facturas Consumo <RD$250K → enviar a RecepcionFC
//   - Lista de servicios DGII (read-only)

interface RunStatus {
  importId:     string;
  status:       string;   // PENDIENTE | PROCESANDO | COMPLETO | FALLIDO
  errorMessage?: string;
  total?:       number;
  ok?:          number;
  failed?:      number;
  skipped?:     number;
  rows?: Array<{
    casoPrueba: string;
    tipoECF:    string;
    eNcf:       string;
    formato:    string;       // RFCE | ECF
    status:     string;       // OK | FAILED | SKIPPED
    estadoDgii?: string;      // ACEPTADO | RECHAZADO | ...
    trackId?:   string;
    error?:     string;
    mensajesDgii?: string[];
    emisionId?: string;       // para descargar PDF/XML individual (paso 5)
    pdfUrl?:    string;
  }>;
}

function Step2Body({ ctx, persisted, persistUpdate }: {
  ctx: StepCtx;
  persisted: PersistedState;
  persistUpdate: (mut: (s: PersistedState) => PersistedState) => void;
}) {
  const env = ctx.ambiente === 'Produccion' ? 'eCF'
    : ctx.ambiente === 'CerteCF' ? 'CerteCF'
    : 'TesteCF';

  const runId = persisted.step2?.runId ?? null;

  const [file, setFile]       = useState<File | null>(null);
  const [uploading, setUp]    = useState(false);
  const [run, setRun]         = useState<RunStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [skipEncfs, setSkipEncfs] = useState('');

  const apiBase = `/api/admin/empresas/${ctx.teamId}/set-pruebas`;

  // Fetch estado del run
  const fetchRun = useCallback(async (rid: string) => {
    try {
      const res = await fetch(`${apiBase}/runs/${rid}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? 'Error consultando estado');
      }
      const data = await res.json() as RunStatus;
      setRun(data);
      persistUpdate(s => ({
        ...s,
        step2: { ...s.step2, runId: rid, status: data.status, lastChecked: new Date().toISOString() },
      }));
      return data.status;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error consultando estado');
      return null;
    }
  }, [apiBase, persistUpdate]);

  // Auto-poll mientras PROCESANDO
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function loop() {
      const status = await fetchRun(runId!);
      if (cancelled) return;
      if (status === 'PROCESANDO' || status === 'PENDIENTE') {
        setPolling(true);
        timer = setTimeout(loop, 5000);
      } else {
        setPolling(false);
      }
    }
    loop();

    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const [dupRunId, setDupRunId] = useState<string | null>(null);

  async function handleUpload() {
    if (!file) return;
    setUp(true);
    setError(null);
    setDupRunId(null);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      if (skipEncfs.trim()) fd.append('skipEncfs', skipEncfs.trim());
      const res = await fetch(`${apiBase}/runs`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Excel duplicado → buscar la corrida previa por RNC para ofrecer borrarla
        if ((data.error ?? '').toLowerCase().includes('import')) {
          await findDuplicateRun();
        }
        throw new Error(data.error ?? 'Error al subir el Excel');
      }
      persistUpdate(s => ({
        ...s,
        step2: { runId: data.importId, status: data.status, lastChecked: new Date().toISOString() },
      }));
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir el Excel');
    } finally {
      setUp(false);
    }
  }

  async function findDuplicateRun() {
    try {
      const res = await fetch(`${apiBase}/runs`);
      const data = await res.json().catch(() => ({}));
      const runs: Array<{ importId: string; sourceFilename?: string }> = data.runs ?? [];
      // Match por nombre de archivo, si no, la corrida más reciente del RNC
      const match = runs.find(r => r.sourceFilename === file?.name) ?? runs[0];
      if (match) setDupRunId(match.importId);
    } catch {
      // silencioso — el botón de borrar simplemente no aparecerá
    }
  }

  async function handleDeleteDuplicate() {
    if (!dupRunId) return;
    if (!confirm('¿Borrar la corrida previa (con purga de emisiones) para re-subir el Excel?')) return;
    setError(null);
    try {
      const res = await fetch(`${apiBase}/runs/${dupRunId}?purgeEmisiones=true`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al borrar la corrida previa');
      setDupRunId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al borrar la corrida previa');
    }
  }

  function handleForgetRun() {
    if (!confirm('¿Olvidar esta corrida solo aquí? (no se borra en ecf-api)')) return;
    setRun(null);
    setError(null);
    persistUpdate(s => ({ ...s, step2: undefined }));
  }

  async function handleDeleteRun() {
    if (!runId) return;
    if (!confirm('¿BORRAR la corrida en ecf-api? Elimina casos, comparaciones y purga emisiones (re-correr limpio). Irreversible.')) return;
    setError(null);
    try {
      const res = await fetch(`${apiBase}/runs/${runId}?purgeEmisiones=true`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al borrar la corrida');
      setRun(null);
      persistUpdate(s => ({ ...s, step2: undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al borrar la corrida');
    }
  }

  // Derivados
  const aceptados = run?.rows?.filter(r => r.estadoDgii === 'ACEPTADO' || r.estadoDgii === 'ACEPTADO_CONDICIONAL').length ?? 0;
  const rechazados = run?.rows?.filter(r => r.estadoDgii === 'RECHAZADO' || r.estadoDgii === 'ERROR').length ?? 0;
  const enProceso = run?.rows?.filter(r => !r.estadoDgii || r.estadoDgii === 'PENDIENTE' || r.estadoDgii === 'ENVIADO').length ?? 0;
  const rfceRows = run?.rows?.filter(r => r.formato === 'RFCE') ?? [];
  const rfceAceptados = rfceRows.filter(r => r.estadoDgii === 'ACEPTADO' || r.estadoDgii === 'ACEPTADO_CONDICIONAL').length;
  const isComplete = run?.status === 'COMPLETO';

  // Casos fallidos: emisión FAILED o DGII RECHAZADO/ERROR
  const failedCases = run?.rows?.filter(r =>
    r.status === 'FAILED' || r.estadoDgii === 'RECHAZADO' || r.estadoDgii === 'ERROR',
  ) ?? [];
  const failedEncfs = failedCases.map(c => c.eNcf).filter(Boolean);

  return (
    <div className="space-y-5">
      {/* Info banner azul */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 text-xs text-blue-900 leading-relaxed">
          <p>
            Etapa en la que se comprueba la capacidad de su sistema para generar
            Comprobantes Fiscales Electrónicos (e-CF), con datos suministrados por DGII.
          </p>
          <ul className="list-disc ml-5 mt-1.5 space-y-1">
            <li>Descarga el <strong>Excel (Set de pruebas)</strong> del portal DGII, súbelo aquí y el sistema emite los casos automáticamente con el cert del contribuyente (resuelto por <code>RNCEmisor</code> del Excel).</li>
            <li>Las FC <strong>&lt; RD$250,000</strong> NO se envían por API: se descargan en ZIP y se suben manual al portal DGII.</li>
          </ul>
        </div>
      </div>

      {/* Card: Subir Excel + arrancar */}
      <CardSection title="1. Subir Excel del Set de Pruebas" icon={Upload} color="teal">
        {!runId ? (
          <div className="space-y-2">
            {!file ? (
              <label className="block">
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(null); } }}
                  className="block w-full text-[11px] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:bg-gray-100 file:text-gray-700 file:font-medium hover:file:bg-gray-200 file:cursor-pointer cursor-pointer text-gray-500"
                />
              </label>
            ) : (
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5">
                <Upload className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <span className="text-[11px] text-gray-700 font-mono truncate flex-1">{file.name}</span>
                <button type="button" onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {/* e-NCFs a excluir (re-correr solo los que fallaron) */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Excluir e-NCFs (opcional)
              </label>
              <input
                type="text"
                value={skipEncfs}
                onChange={e => setSkipEncfs(e.target.value)}
                placeholder="E320000000012,E320000000015"
                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                CSV de e-NCF a saltar. Útil para re-subir el Excel omitiendo los que ya fallaron.
              </p>
            </div>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-md flex items-center justify-center gap-1.5"
            >
              {uploading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo…</>
                : <><ArrowRight className="w-3.5 h-3.5" /> Procesar Set de Pruebas</>}
            </button>
            <p className="text-[10px] text-gray-400 text-center">
              Ambiente: <strong>{env}</strong> · Excel .xlsx, máx 20 MB
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-emerald-800">Corrida iniciada</p>
                <p className="text-[10px] text-emerald-700 font-mono truncate">run: {runId}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleForgetRun}
                className="flex-1 text-[11px] text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                <RotateCcw className="w-3 h-3" /> Olvidar
              </button>
              <button
                type="button"
                onClick={handleDeleteRun}
                className="flex-1 text-[11px] text-red-600 hover:text-red-700 flex items-center justify-center gap-1 py-1.5 border border-red-200 rounded-md hover:bg-red-50"
              >
                <X className="w-3 h-3" /> Borrar en ecf-api
              </button>
            </div>
          </div>
        )}
      </CardSection>

      {/* Card: Estado emisión */}
      {runId && (
        <CardSection title="2. Estado de la emisión" icon={ShieldCheck} color="teal">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <RunStatusBadge status={run?.status ?? persisted.step2?.status ?? 'PROCESANDO'} polling={polling} />
              <button
                type="button"
                onClick={() => runId && fetchRun(runId)}
                className="ml-auto text-[11px] text-teal-600 hover:text-teal-700 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Refrescar
              </button>
            </div>

            {/* Counters de emisión */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <MiniStat label="Total"    value={run?.total ?? 0} />
              <MiniStat label="OK"       value={run?.ok ?? 0}      tone="emerald" />
              <MiniStat label="Fallidos" value={run?.failed ?? 0}  tone="red" />
              <MiniStat label="Saltados" value={run?.skipped ?? 0} tone="gray" />
            </div>

            {/* Counters DGII */}
            <div className="border-t border-gray-100 pt-2 space-y-1">
              <CounterRow label="Aceptados por DGII"  accepted={aceptados}     total={run?.total ?? 0} />
              <CounterRow label="Resúmenes (RFCE) Aceptados" accepted={rfceAceptados} total={rfceRows.length} />
              {rechazados > 0 && <p className="text-[11px] text-red-600">{rechazados} rechazados por DGII</p>}
              {enProceso > 0 && <p className="text-[11px] text-amber-600">{enProceso} en proceso/pendientes</p>}
            </div>

            {run?.errorMessage && (
              <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded p-2">{run.errorMessage}</p>
            )}

            {/* Casos fallidos con su e-NCF + error específico */}
            {failedCases.length > 0 && (
              <div className="border-t border-gray-100 pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-semibold text-red-700">
                    {failedCases.length} caso{failedCases.length === 1 ? '' : 's'} fallido{failedCases.length === 1 ? '' : 's'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSkipEncfs(failedEncfs.join(','));
                      handleForgetRun();
                    }}
                    className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold px-2 py-1 rounded flex items-center gap-1"
                    title="Copia los e-NCF fallidos al campo Excluir y limpia la corrida para re-subir"
                  >
                    <RotateCcw className="w-2.5 h-2.5" /> Excluir fallidos y re-subir
                  </button>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {failedCases.map((c, i) => (
                    <div key={i} className="text-[10px] bg-red-50 border border-red-100 rounded px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-red-800">{c.eNcf || '(sin e-NCF)'}</span>
                        <span className="text-gray-400">tipo {c.tipoECF}</span>
                        <span className="ml-auto px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                          {c.estadoDgii ?? c.status}
                        </span>
                      </div>
                      {(c.error || (c.mensajesDgii && c.mensajesDgii.length > 0)) && (
                        <p className="text-red-600 mt-0.5 leading-snug">
                          {c.error ?? c.mensajesDgii?.join(' · ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardSection>
      )}

      {/* Card: Descargas (FC<250K + paquete) */}
      {runId && (
        <CardSection title="3. Descargas" icon={Download} color="teal">
          <div className="space-y-2">
            <a
              href={`${apiBase}/runs/${runId}/manual-upload/zip`}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-md flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> ZIP Facturas &lt; RD$250K
            </a>
            <p className="text-[10px] text-gray-500 text-center">
              Descomprime y sube cada XML al portal DGII en <strong>"Facturas de consumo &lt; 250Mil"</strong>.
            </p>
            <a
              href={`${apiBase}/runs/${runId}/package`}
              className="w-full text-xs font-semibold px-4 py-2 rounded-md flex items-center justify-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-3.5 h-3.5" /> Paquete completo (XML + PDF)
            </a>
          </div>
        </CardSection>
      )}

      {/* Error global */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[11px] text-red-700">{error}</p>
            {dupRunId && (
              <button
                type="button"
                onClick={handleDeleteDuplicate}
                className="mt-2 text-[11px] bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5"
              >
                <X className="w-3 h-3" /> Borrar corrida previa y reintentar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Pruebas de Datos Aprobación Comercial (ACECF) ────────────────────
// Síncrono: POST devuelve rows al instante. Sin polling, sin runId, sin ZIP.

interface AprobRow { eNcf?: string; estadoEnvio?: string; estadoDgii?: string; trackId?: string; error?: string }
interface AprobResult { total: number; ok: number; failed: number; rows?: AprobRow[] }

function Step3Body({ ctx, persisted, persistUpdate }: {
  ctx: StepCtx;
  persisted: PersistedState;
  persistUpdate: (mut: (s: PersistedState) => PersistedState) => void;
}) {
  const env = ctx.ambiente === 'Produccion' ? 'eCF'
    : ctx.ambiente === 'CerteCF' ? 'CerteCF'
    : 'TesteCF';

  const [file, setFile]           = useState<File | null>(null);
  const [uploading, setUp]        = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [secShiftEncfs, setShift] = useState('');

  const result: AprobResult | null = persisted.step3?.lastResult ?? null;
  const apiBase = `/api/admin/empresas/${ctx.teamId}/set-pruebas`;

  async function handleUpload() {
    if (!file) return;
    setUp(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      if (secShiftEncfs.trim()) fd.append('secShiftEncfs', secShiftEncfs.trim());
      const res = await fetch(`${apiBase}/aprobaciones`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al procesar las aprobaciones');
      persistUpdate(s => ({
        ...s,
        step3: { lastResult: data, lastRunAt: new Date().toISOString() },
      }));
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar las aprobaciones');
    } finally {
      setUp(false);
    }
  }

  function handleClear() {
    if (!confirm('¿Limpiar el resultado guardado de aprobaciones?')) return;
    setError(null);
    persistUpdate(s => ({ ...s, step3: undefined }));
  }

  const rows = result?.rows ?? [];
  const failedRows = rows.filter(r =>
    !!r.error || r.estadoDgii === 'RECHAZADO' || r.estadoDgii === 'ERROR' ||
    (r.estadoEnvio && !/acept/i.test(r.estadoEnvio)),
  );
  const failedEncfs = failedRows.map(r => r.eNcf).filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 text-xs text-blue-900 leading-relaxed">
          <p>
            Etapa en la que se comprueba la capacidad de su sistema para generar
            Aprobaciones Comerciales (ACECF), con datos suministrados por DGII.
          </p>
          <ul className="list-disc ml-5 mt-1.5 space-y-1">
            <li>Descarga <strong>"Aprobaciones Comerciales"</strong> del portal DGII (archivo distinto al del paso 2), súbelo aquí.</li>
            <li>Cada ACECF se firma con el cert del <strong>RNCComprador</strong> (derivado del Excel) y se envía a DGII. Proceso síncrono.</li>
            <li>Para certificar deben enviarse satisfactoriamente <strong>todas</strong> las aprobaciones generadas.</li>
          </ul>
        </div>
      </div>

      {/* Card: Subir Excel */}
      <CardSection title="1. Subir Excel de Aprobaciones Comerciales" icon={Upload} color="teal">
        <div className="space-y-2">
          {!file ? (
            <label className="block">
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(null); } }}
                className="block w-full text-[11px] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:bg-gray-100 file:text-gray-700 file:font-medium hover:file:bg-gray-200 file:cursor-pointer cursor-pointer text-gray-500"
              />
            </label>
          ) : (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5">
              <Upload className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <span className="text-[11px] text-gray-700 font-mono truncate flex-1">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Shift selectivo de fecha (opcional)</label>
            <input
              type="text"
              value={secShiftEncfs}
              onChange={e => setShift(e.target.value)}
              placeholder="E450000000010,E330000000001"
              className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              CSV de e-NCF — ajusta FechaHoraAprobacionComercial si DGII lo pide al re-enviar.
            </p>
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-md flex items-center justify-center gap-1.5"
          >
            {uploading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando…</>
              : <><ArrowRight className="w-3.5 h-3.5" /> Procesar Aprobaciones</>}
          </button>
          <p className="text-[10px] text-gray-400 text-center">
            Ambiente: <strong>{env}</strong> · Excel .xlsx (hoja ACEECF_Generadas), máx 20 MB
          </p>
        </div>
      </CardSection>

      {/* Card: Resultado */}
      {result && (
        <CardSection title="2. Resultado del envío" icon={ShieldCheck} color="teal">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">
                {persisted.step3?.lastRunAt && `Último envío: ${new Date(persisted.step3.lastRunAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}`}
              </span>
              <button
                type="button"
                onClick={handleClear}
                className="ml-auto text-[11px] text-gray-400 hover:text-red-600 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Limpiar
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Total"    value={result.total} />
              <MiniStat label="OK"       value={result.ok}     tone="emerald" />
              <MiniStat label="Fallidas" value={result.failed} tone="red" />
            </div>

            <CounterRow label="Aprobaciones comerciales aceptadas" accepted={result.ok} total={result.total} />

            {/* Filas fallidas con e-NCF + error */}
            {failedRows.length > 0 && (
              <div className="border-t border-gray-100 pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-semibold text-red-700">
                    {failedRows.length} fallida{failedRows.length === 1 ? '' : 's'}
                  </p>
                  {failedEncfs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShift(failedEncfs.join(','))}
                      className="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold px-2 py-1 rounded flex items-center gap-1"
                      title="Copia los e-NCF fallidos al campo de shift selectivo"
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> Copiar fallidos a shift
                    </button>
                  )}
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {failedRows.map((r, i) => (
                    <div key={i} className="text-[10px] bg-red-50 border border-red-100 rounded px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-red-800">{r.eNcf || '(sin e-NCF)'}</span>
                        <span className="ml-auto px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                          {r.estadoDgii ?? r.estadoEnvio ?? 'ERROR'}
                        </span>
                      </div>
                      {r.error && <p className="text-red-600 mt-0.5 leading-snug">{r.error}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filas OK (resumen compacto) */}
            {rows.length > 0 && (
              <details className="border-t border-gray-100 pt-2">
                <summary className="text-[11px] text-gray-500 cursor-pointer">Ver todas las filas ({rows.length})</summary>
                <div className="space-y-1 max-h-48 overflow-y-auto mt-1.5">
                  {rows.map((r, i) => (
                    <div key={i} className="text-[10px] flex items-center gap-2 px-2 py-1 bg-gray-50 rounded">
                      <span className="font-mono text-gray-700">{r.eNcf || '—'}</span>
                      <span className="text-gray-400">{r.trackId ?? ''}</span>
                      <span className="ml-auto text-gray-600">{r.estadoDgii ?? r.estadoEnvio ?? ''}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </CardSection>
      )}

      {/* Error global */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-red-700 flex-1">{error}</p>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Pruebas de Simulación e-CF ───────────────────────────────────────
// Genera 29 e-CF sintéticos (sin Excel) y los envía a DGII. cp-scoped.
// Requeridos por tipo (portal DGII): 31×4, 32≥250×2, 33×1, 34×2, 41×2, 43×2,
// 44×2, 45×2, 46×2, 47×2, 32-RFCE×4.

const SIMUL_REQUERIDOS: Array<{ key: string; label: string; tipo: string; formato?: string; req: number }> = [
  { key: '31',   label: 'Tipo 31',            tipo: '31', formato: 'ECF',  req: 4 },
  { key: '32g',  label: 'Tipo 32 ≥250Mil',    tipo: '32', formato: 'ECF',  req: 2 },
  { key: '33',   label: 'Tipo 33',            tipo: '33', formato: 'ECF',  req: 1 },
  { key: '34',   label: 'Tipo 34',            tipo: '34', formato: 'ECF',  req: 2 },
  { key: '41',   label: 'Tipo 41',            tipo: '41', formato: 'ECF',  req: 2 },
  { key: '43',   label: 'Tipo 43',            tipo: '43', formato: 'ECF',  req: 2 },
  { key: '44',   label: 'Tipo 44',            tipo: '44', formato: 'ECF',  req: 2 },
  { key: '45',   label: 'Tipo 45',            tipo: '45', formato: 'ECF',  req: 2 },
  { key: '46',   label: 'Tipo 46',            tipo: '46', formato: 'ECF',  req: 2 },
  { key: '47',   label: 'Tipo 47',            tipo: '47', formato: 'ECF',  req: 2 },
  { key: '32r',  label: 'Tipo 32 RFCE',       tipo: '32', formato: 'RFCE', req: 4 },
];

function Step4Body({ ctx, persisted, persistUpdate }: {
  ctx: StepCtx;
  persisted: PersistedState;
  persistUpdate: (mut: (s: PersistedState) => PersistedState) => void;
}) {
  const env = ctx.ambiente === 'Produccion' ? 'eCF'
    : ctx.ambiente === 'CerteCF' ? 'CerteCF'
    : 'TesteCF';

  const runId = persisted.step4?.runId ?? null;

  const [ncfStart, setNcfStart] = useState(persisted.step4?.ncfStart ?? 500);
  const [starting, setStarting] = useState(false);
  const [run, setRun]           = useState<RunStatus | null>(null);
  const [polling, setPolling]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const apiBase    = `/api/admin/empresas/${ctx.teamId}/simulacion`;
  const zipBase    = `/api/admin/empresas/${ctx.teamId}/set-pruebas`; // ZIP <250K reusa runId

  const fetchRun = useCallback(async (rid: string) => {
    try {
      const res = await fetch(`${apiBase}/runs/${rid}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? 'Error consultando estado');
      }
      const data = await res.json() as RunStatus;
      setRun(data);
      persistUpdate(s => ({
        ...s,
        step4: { ...s.step4, runId: rid, status: data.status, lastChecked: new Date().toISOString() },
      }));
      return data.status;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error consultando estado');
      return null;
    }
  }, [apiBase, persistUpdate]);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function loop() {
      const status = await fetchRun(runId!);
      if (cancelled) return;
      if (status === 'PROCESANDO' || status === 'PENDIENTE') {
        setPolling(true);
        timer = setTimeout(loop, 5000);
      } else setPolling(false);
    }
    loop();
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ncfStart }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al iniciar la simulación');
      setRun(data);
      persistUpdate(s => ({
        ...s,
        step4: { runId: data.importId, status: data.status, ncfStart, lastChecked: new Date().toISOString() },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al iniciar la simulación');
    } finally {
      setStarting(false);
    }
  }

  async function handleRestart() {
    if (!confirm('¿Re-iniciar con NCFs frescos (+100)? Re-emite los 29 casos.')) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/restart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ncfBump: 100 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al reiniciar');
      setRun(data);
      persistUpdate(s => ({
        ...s,
        step4: { runId: data.importId, status: data.status, ncfStart, lastChecked: new Date().toISOString() },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al reiniciar');
    } finally {
      setStarting(false);
    }
  }

  function handleForget() {
    if (!confirm('¿Olvidar este run solo aquí? (no se borra en ecf-api)')) return;
    setRun(null);
    setError(null);
    persistUpdate(s => ({ ...s, step4: undefined }));
  }

  // Conteo aceptados por tipo
  const rows = run?.rows ?? [];
  const acceptedOf = (tipo: string, formato?: string) =>
    rows.filter(r =>
      r.tipoECF === tipo &&
      (!formato || r.formato === formato) &&
      (r.estadoDgii === 'ACEPTADO' || r.estadoDgii === 'ACEPTADO_CONDICIONAL'),
    ).length;

  const isComplete = run?.status === 'COMPLETO';
  const failedCases = rows.filter(r =>
    r.status === 'FAILED' || r.estadoDgii === 'RECHAZADO' || r.estadoDgii === 'ERROR',
  );

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 text-xs text-blue-900 leading-relaxed">
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

      {/* Card: Iniciar */}
      <CardSection title="1. Iniciar simulación" icon={FlaskConical} color="teal">
        {!runId ? (
          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">NCF inicial</label>
              <input
                type="number"
                value={ncfStart}
                onChange={e => setNcfStart(parseInt(e.target.value, 10) || 500)}
                min={1}
                className="w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
              />
              <p className="text-[10px] text-gray-400 mt-1">Usa un valor alto/fresco (500+) para no chocar con eNCF ya quemados.</p>
            </div>
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-md flex items-center justify-center gap-1.5"
            >
              {starting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Iniciando…</>
                : <><FlaskConical className="w-3.5 h-3.5" /> Iniciar simulación (29 casos)</>}
            </button>
            <p className="text-[10px] text-gray-400 text-center">Ambiente: <strong>{env}</strong></p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-emerald-800">Simulación iniciada</p>
                <p className="text-[10px] text-emerald-700 font-mono truncate">run: {runId}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRestart}
                disabled={starting}
                className="flex-1 text-[11px] text-teal-700 hover:text-teal-800 flex items-center justify-center gap-1 py-1.5 border border-teal-200 rounded-md hover:bg-teal-50 disabled:opacity-50"
              >
                {starting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Re-iniciar (+100)
              </button>
              <button
                type="button"
                onClick={handleForget}
                className="flex-1 text-[11px] text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                <X className="w-3 h-3" /> Olvidar
              </button>
            </div>
          </div>
        )}
      </CardSection>

      {/* Card: Estado por tipo */}
      {runId && (
        <CardSection title="2. Estado de las pruebas de simulación" icon={ShieldCheck} color="teal">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <RunStatusBadge status={run?.status ?? persisted.step4?.status ?? 'PROCESANDO'} polling={polling} />
              <button
                type="button"
                onClick={() => runId && fetchRun(runId)}
                className="ml-auto text-[11px] text-teal-600 hover:text-teal-700 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Refrescar
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {SIMUL_REQUERIDOS.map(t => {
                const acc = acceptedOf(t.tipo, t.formato);
                const done = acc >= t.req;
                return (
                  <div key={t.key} className={`flex items-baseline gap-1.5 px-2 py-1.5 rounded border ${
                    done ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <span className={`text-sm font-bold tabular-nums ${done ? 'text-emerald-700' : 'text-gray-900'}`}>
                      {acc}/{t.req}
                    </span>
                    <span className="text-[10px] text-gray-600">{t.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-4 gap-2 text-center border-t border-gray-100 pt-2">
              <MiniStat label="Total"    value={run?.total ?? 0} />
              <MiniStat label="OK"       value={run?.ok ?? 0}      tone="emerald" />
              <MiniStat label="Fallidos" value={run?.failed ?? 0}  tone="red" />
              <MiniStat label="Saltados" value={run?.skipped ?? 0} tone="gray" />
            </div>

            {failedCases.length > 0 && (
              <div className="border-t border-gray-100 pt-2">
                <p className="text-[11px] font-semibold text-red-700 mb-1.5">{failedCases.length} fallidos</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {failedCases.map((c, i) => (
                    <div key={i} className="text-[10px] bg-red-50 border border-red-100 rounded px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-red-800">{c.eNcf || '(sin e-NCF)'}</span>
                        <span className="text-gray-400">tipo {c.tipoECF}</span>
                        <span className="ml-auto px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">{c.estadoDgii ?? c.status}</span>
                      </div>
                      {(c.error || (c.mensajesDgii && c.mensajesDgii.length > 0)) && (
                        <p className="text-red-600 mt-0.5 leading-snug">{c.error ?? c.mensajesDgii?.join(' · ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardSection>
      )}

      {/* Card: Descargas */}
      {runId && (
        <CardSection title="3. Facturas < RD$250K" icon={Download} color="teal">
          <a
            href={`${zipBase}/runs/${runId}/manual-upload/zip`}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-md flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> ZIP Facturas &lt; RD$250K
          </a>
          <p className="text-[10px] text-gray-500 text-center mt-2">
            Descomprime y sube cada XML al portal DGII en <strong>"Facturas de consumo &lt; 250Mil"</strong>.
          </p>
        </CardSection>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-red-700 flex-1">{error}</p>
        </div>
      )}
    </div>
  );
}

// ─── Step 5: Pruebas de Simulación Representación Impresa ──────────────────────
// Subida MANUAL al portal DGII. El API solo entrega los PDF (con QR correcto).
// Reusa el runId del paso 4: package ZIP (todos) + PDF individual por tipo.

const REPR_TIPOS: Array<{ key: string; label: string; tipo: string; formato?: string; menor250?: boolean }> = [
  { key: '31',   label: 'Tipo 31',                 tipo: '31', formato: 'ECF' },
  { key: '32g',  label: 'Tipo 32 ≥RD$250mil',      tipo: '32', formato: 'ECF' },
  { key: '33',   label: 'Tipo 33',                 tipo: '33', formato: 'ECF' },
  { key: '34',   label: 'Tipo 34',                 tipo: '34', formato: 'ECF' },
  { key: '41',   label: 'Tipo 41',                 tipo: '41', formato: 'ECF' },
  { key: '43',   label: 'Tipo 43',                 tipo: '43', formato: 'ECF' },
  { key: '44',   label: 'Tipo 44',                 tipo: '44', formato: 'ECF' },
  { key: '45',   label: 'Tipo 45',                 tipo: '45', formato: 'ECF' },
  { key: '46',   label: 'Tipo 46',                 tipo: '46', formato: 'ECF' },
  { key: '47',   label: 'Tipo 47',                 tipo: '47', formato: 'ECF' },
];

function Step5Body({ ctx, persisted }: { ctx: StepCtx; persisted: PersistedState }) {
  const runId = persisted.step4?.runId ?? null;
  const apiBase = `/api/admin/empresas/${ctx.teamId}`;
  const zipBase = `${apiBase}/set-pruebas`;

  const [run, setRun]     = useState<RunStatus | null>(null);
  const [loading, setLoad] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar rows del run del paso 4 (para listar PDFs por tipo)
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    (async () => {
      setLoad(true);
      try {
        const res = await fetch(`${apiBase}/simulacion/runs/${runId}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? 'Error cargando emisiones del paso 4');
        if (!cancelled) setRun(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando emisiones');
      } finally {
        if (!cancelled) setLoad(false);
      }
    })();
    return () => { cancelled = true; };
  }, [runId, apiBase]);

  const rows = run?.rows ?? [];
  const pdfFor = (tipo: string, formato?: string) =>
    rows.find(r => r.tipoECF === tipo && (!formato || r.formato === formato) && r.emisionId);

  if (!runId) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-amber-900">
          <p className="font-semibold mb-0.5">Completa el paso 4 primero</p>
          <p>Las representaciones impresas (PDF) salen de los e-CF emitidos en la Simulación (paso 4).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 text-xs text-blue-900 leading-relaxed">
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

      {/* Card: Descargar paquete */}
      <CardSection title="1. Descargar representaciones (PDF)" icon={Printer} color="teal">
        <a
          href={`${zipBase}/runs/${runId}/package`}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-md flex items-center justify-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> Paquete completo (PDF + XML por tipo)
        </a>
        <p className="text-[10px] text-gray-500 text-center mt-2">
          PDFs nombrados por tipo (incluye 32 ≥250mil y 32 &lt;250mil).
        </p>
      </CardSection>

      {/* Card: PDF individual por tipo */}
      <CardSection title="2. PDF individual por tipo" icon={FileText} color="teal">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 py-3 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando emisiones…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {REPR_TIPOS.map(t => {
              const row = pdfFor(t.tipo, t.formato);
              return (
                <div key={t.key} className="flex items-center gap-2 border border-gray-200 rounded-md px-2.5 py-1.5">
                  <span className="text-[11px] text-gray-700 flex-1">{t.label}</span>
                  {row?.emisionId ? (
                    <a
                      href={`${apiBase}/emisiones/${row.emisionId}/pdf`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> PDF
                    </a>
                  ) : (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-gray-400 mt-2">
          La FC tipo 32 &lt;RD$250mil se incluye en el paquete completo.
        </p>
      </CardSection>

      {/* Aviso responsabilidad */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-amber-800">
          Es responsabilidad del contribuyente que la representación impresa cumpla con la Ley 32-23
          y la documentación técnica del Formato de e-CF.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-red-700 flex-1">{error}</p>
        </div>
      )}
    </div>
  );
}

function RunStatusBadge({ status, polling }: { status: string; polling: boolean }) {
  const map: Record<string, { cls: string; label: string }> = {
    PENDIENTE:  { cls: 'bg-gray-100 text-gray-600 border-gray-200',     label: 'Pendiente' },
    PROCESANDO: { cls: 'bg-amber-50 text-amber-700 border-amber-200',   label: 'Procesando' },
    COMPLETO:   { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Completo' },
    FALLIDO:    { cls: 'bg-red-50 text-red-700 border-red-200',         label: 'Fallido' },
  };
  const c = map[status] ?? map.PROCESANDO;
  return (
    <span className={`text-[11px] uppercase tracking-wide border px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${c.cls}`}>
      {polling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Circle className="w-2.5 h-2.5" />}
      {c.label}
    </span>
  );
}

function MiniStat({ label, value, tone = 'gray' }: { label: string; value: number; tone?: 'emerald'|'red'|'gray' }) {
  const toneCls = tone === 'emerald' ? 'text-emerald-700' : tone === 'red' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="bg-gray-50 rounded-md py-2">
      <p className={`text-lg font-bold tabular-nums ${toneCls}`}>{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function CardSection({ title, icon: Icon, children, color = 'teal' }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  color?: 'teal' | 'amber';
}) {
  const headerCls = color === 'teal' ? 'bg-teal-600 text-white' : 'bg-amber-600 text-white';
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 ${headerCls}`}>
        <Icon className="w-4 h-4" />
        <p className="text-xs font-semibold">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function CounterRow({ label, accepted, total }: { label: string; accepted: number; total: number }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="text-xl font-bold text-gray-900 tabular-nums">{accepted}/{total}</span>
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}

// ─── Placeholder body para pasos 3-15 ─────────────────────────────────────────

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
