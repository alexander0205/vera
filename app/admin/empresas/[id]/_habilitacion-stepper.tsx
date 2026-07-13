'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserCheck, Database, FileCheck, FlaskConical, Printer, ScanLine,
  Link2, PlayCircle, Inbox, ThumbsUp, Globe, ScrollText, ShieldCheck,
  PartyPopper, ChevronDown, ChevronRight, Circle, CheckCircle2,
  Clock, AlertCircle, Rocket, Copy, Check, ExternalLink, Settings, User,
  FileSignature, Upload, Download, Loader2, X, ArrowRight, RotateCcw, FileText,
} from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import { keyframes } from '@mui/material/styles';
import { firmarXml, descargarBase64 } from '@/lib/habilitacion/client';

// Animación de giro para loaders (reemplaza el `animate-spin` de Tailwind)
const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

// Loader giratorio — sustituye el spinner de Tailwind por keyframes MUI
function Spinner({ size }: { size: number }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', animation: `${spin} 1s linear infinite` }}>
      <Loader2 style={{ width: size, height: size }} />
    </Box>
  );
}

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
  step13?:      PersistedStep1;  // declaración jurada — mismo shape que firma postulación
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
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
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
    <Box sx={embedded ? { m: '-20px' } : { bgcolor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      {/* Header con progreso global */}
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #f3f4f6', background: 'linear-gradient(135deg, rgba(240,253,250,0.4) 0%, #fff 100%)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: '#ccfbf1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Rocket style={{ width: 20, height: 20, color: '#0f766e' }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: 'text.primary' }}>Habilitación DGII</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: '2px' }}>
              Team #{teamId} · {completedCount} de {STEPS.length} pasos completados
              {inProgress && ` · paso ${inProgress.id} en progreso`}
            </Typography>
          </Box>
          {completedCount > 0 && (
            <Button
              size="small"
              onClick={() => { if (confirm('¿Reiniciar todo el progreso de habilitación de este team?')) reset(); }}
              title="Reiniciar progreso local"
              sx={{ fontSize: '0.6875rem', color: 'text.disabled', textTransform: 'none', minWidth: 0, px: 1, py: 0.5, borderRadius: '6px', '&:hover': { color: 'error.main', bgcolor: '#fef2f2' } }}
              startIcon={<RotateCcw style={{ width: 12, height: 12 }} />}
            >
              Reiniciar
            </Button>
          )}
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>{pctComplete.toFixed(0)}%</Typography>
            <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>completado</Typography>
          </Box>
        </Box>
        {/* Progress bar */}
        <Box sx={{ height: 6, bgcolor: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
          <Box
            sx={{ height: '100%', background: 'linear-gradient(90deg, #14b8a6, #0d9488)', transition: 'width 0.3s ease' }}
            style={{ width: `${pctComplete}%` }}
          />
        </Box>
      </Box>

      {/* Steps */}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, '& > li + li': { borderTop: '1px solid #f3f4f6' } }}>
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
      </Box>
    </Box>
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
    <Box component="li">
      <Box
        component="button"
        type="button"
        onClick={onToggle}
        sx={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 2,
          bgcolor: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
          transition: 'background-color 0.15s',
          '&:hover': { bgcolor: 'rgba(249,250,251,0.8)' },
          '&:hover [data-status="pending"]': { bgcolor: '#e5e7eb' },
        }}
      >
        {/* Número grande con anillo */}
        <Box
          data-status={status}
          sx={{
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: '50%', fontWeight: 700, fontSize: '0.875rem', flexShrink: 0,
            transition: 'background-color 0.15s',
            ...(status === 'done' ? { bgcolor: '#10b981', color: '#fff' }
              : status === 'in-progress' ? { bgcolor: '#fef3c7', color: '#78350f', outline: '2px solid #fbbf24', outlineOffset: '0px' }
              : status === 'error' ? { bgcolor: '#fee2e2', color: '#b91c1c', outline: '2px solid #f87171', outlineOffset: '0px' }
              : { bgcolor: '#f3f4f6', color: '#6b7280' }),
          }}
        >
          {status === 'done' ? <CheckCircle2 style={{ width: 20, height: 20 }} /> : step.id}
        </Box>

        {/* Icono + título + desc */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
          <Icon style={{
            width: 20, height: 20, flexShrink: 0,
            color: status === 'done' ? '#059669'
              : status === 'in-progress' ? '#d97706'
              : status === 'error' ? '#dc2626'
              : '#9ca3af',
          }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.label}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' } }}>{step.desc}</Typography>
          </Box>
        </Box>

        {/* Status pill */}
        <StatusPill status={status} />

        {/* Sub-screens count */}
        <Typography component="span" sx={{ fontSize: '0.625rem', color: '#9ca3af', fontFamily: 'monospace', display: { xs: 'none', md: 'inline' } }}>
          {step.screens.length} pantalla{step.screens.length === 1 ? '' : 's'}
        </Typography>

        {/* Expand chevron */}
        {isOpen ? (
          <ChevronDown style={{ width: 20, height: 20, color: '#9ca3af', flexShrink: 0 }} />
        ) : (
          <ChevronRight style={{ width: 20, height: 20, color: '#9ca3af', flexShrink: 0 }} />
        )}
      </Box>

      {/* Body expandido */}
      {isOpen && (
        <Box sx={{ px: 3, pb: 2.5, pt: 0.5, pl: '84px', bgcolor: 'rgba(249,250,251,0.4)', borderTop: '1px solid #f3f4f6' }}>
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
          ) : step.id === 7 || step.id === 12 ? (
            <UrlServiciosBody ctx={ctx} produccion={step.id === 12} />
          ) : (step.id >= 8 && step.id <= 11) ? (
            <PortalStepBody stepId={step.id} ctx={ctx} />
          ) : step.id === 13 ? (
            <Step13Body ctx={ctx} persisted={persisted} persistUpdate={persistUpdate} />
          ) : (step.id === 6 || step.id === 14 || step.id === 15) ? (
            <PasoPasivoBody stepId={step.id} />
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
        </Box>
      )}
    </Box>
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
      <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography component="span" sx={{ fontSize: '0.6875rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: 0.75, fontWeight: 500 }}>
          <CheckCircle2 style={{ width: 14, height: 14 }} /> Paso completado y guardado
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
      <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>
        {isCurrent
          ? 'Cuando termines aquí, marca completado para avanzar al siguiente paso.'
          : 'Este paso no es el actual. Puedes revisarlo pero marcarlo no salta el orden.'}
      </Typography>
      <Button
        type="button"
        variant="contained"
        size="small"
        onClick={onMarkDone}
        endIcon={!isLast ? <ArrowRight style={{ width: 14, height: 14 }} /> : undefined}
        disableElevation
        sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: '6px', bgcolor: '#0d9488', flexShrink: 0, '&:hover': { bgcolor: '#0f766e' } }}
      >
        {isLast ? 'Finalizar habilitación' : 'Marcar completado y continuar'}
      </Button>
    </Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Intro */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', p: 1.5 }}>
        <ExternalLink style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, color: '#2563eb' }} />
        <Box sx={{ flex: 1, fontSize: '0.75rem', color: '#1e3a5f' }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: '2px', color: '#1e3a5f' }}>Registrar en portal DGII</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(30,58,95,0.8)' }}>
            Copia los campos abajo y pégalos en el formulario del portal DGII
            ({ctx.ambiente === 'Produccion' ? 'producción' : ctx.ambiente === 'CerteCF' ? 'CerteCF' : 'TesteCF'}).
            Luego usa el bloque de la derecha para firmar el XML descargado.
          </Typography>
        </Box>
        <Box
          component="a"
          href={ctx.ambiente === 'Produccion'
            ? 'https://ecf.dgii.gov.do/ecf/contribuyentes'
            : ctx.ambiente === 'CerteCF'
              ? 'https://ecf.dgii.gov.do/certecf/contribuyentes'
              : 'https://ecf.dgii.gov.do/testecf/contribuyentes'}
          target="_blank" rel="noopener noreferrer"
          sx={{ fontSize: '0.6875rem', bgcolor: '#2563eb', color: '#fff', fontWeight: 600, px: 1.5, py: 0.75, borderRadius: '6px', display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, textDecoration: 'none', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          Abrir portal <ExternalLink style={{ width: 12, height: 12 }} />
        </Box>
      </Box>

      {/* 2-col: izq form datos · der upload+firmar */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '2fr 1fr' }, gap: 2.5 }}>
        {/* IZQ: form portal DGII (2/3) */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Datos del software a utilizar */}
          <Box component="section">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Settings style={{ width: 16, height: 16, color: '#6b7280' }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Datos del software a utilizar</Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5, mb: 1.5 }}>
              <DgiiCopyField label="Tipo de software"     value={SOFTWARE_PROVIDER.tipo} required={false} />
              <DgiiCopyField label="Nombre del software"  value={software_or_loading(ctx.software?.nombre)} />
              <DgiiCopyField label="Versión del software" value="1" />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <DgiiCopyField label="URL de recepción"            value={baseValue} isUrl />
              <DgiiCopyField label="URL de aprobación comercial" value={baseValue} isUrl />
              <DgiiCopyField label="URL de autenticación"        value={baseValue} isUrl />
            </Box>
          </Box>

          {/* Datos del proveedor electrónico */}
          <Box component="section">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <User style={{ width: 16, height: 16, color: '#6b7280' }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Datos del proveedor electrónico</Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              <DgiiCopyField label="RNC / Cédula" value={SOFTWARE_PROVIDER.rnc} />
              <DgiiCopyField label="Razón social" value={SOFTWARE_PROVIDER.razonSocial} colSpan={2} />
            </Box>
          </Box>

          {/* Datos del contribuyente vinculado */}
          <Box component="section">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <UserCheck style={{ width: 16, height: 16, color: '#6b7280' }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>Contribuyente vinculado</Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              <DgiiCopyField label="RNC contribuyente" value={ctx.rnc ?? '—'} required={false} />
              <DgiiCopyField label="Código público"    value={ctx.codigoPublico ?? '—'} required={false} />
              <DgiiCopyField label="Ambiente"          value={ctx.ambiente ?? '—'} required={false} />
            </Box>
          </Box>
        </Box>

        {/* DER: upload + firmar XML postulación (1/3) */}
        <Box>
          <FirmarPostulacionPanel
            rnc={ctx.rnc}
            codigoPublico={ctx.codigoPublico}
            persisted={persisted}
            persistUpdate={persistUpdate}
          />
        </Box>
      </Box>
    </Box>
  );
}

// ─── Panel firmar XML postulación ────────────────────────────────────────────

function FirmarPostulacionPanel({
  rnc, codigoPublico, persisted, persistUpdate,
  proposito = 'postulacion', slotKey = 'step1', titulo = 'Firma del XML de postulación',
}: {
  rnc?: string;
  codigoPublico?: string;
  persisted: PersistedState;
  persistUpdate: (mut: (s: PersistedState) => PersistedState) => void;
  proposito?: 'postulacion' | 'declaracion-jurada';
  slotKey?: 'step1' | 'step13';
  titulo?: string;
}) {
  const [file, setFile]       = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Recuperar del store (slot parametrizable: step1 postulación / step13 decl. jurada)
  const slot             = (persisted[slotKey] ?? {}) as PersistedStep1;
  const uploadedXmlName  = slot.uploadedXmlName;
  const signed           = slot.signedXmlBase64 && slot.signedXmlNombre
    ? { base64: slot.signedXmlBase64, nombre: slot.signedXmlNombre }
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
        proposito,
        codigoPublico,  // ← admin firma con cert de esa empresa
      });
      persistUpdate(s => ({
        ...s,
        [slotKey]: {
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
    persistUpdate(s => ({ ...s, [slotKey]: undefined }));
  }

  const persistedStep1 = slot; // alias para el resto del JSX (timestamp)

  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', borderRadius: '8px', borderColor: '#e5e7eb' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <FileSignature style={{ width: 16, height: 16, color: '#0d9488' }} />
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>{titulo}</Typography>
      </Box>

      {/* Pasos numerados */}
      <Box component="ol" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1, listStyle: 'none', m: 0, p: 0 }}>
        {/* Paso 1: generar archivo en portal */}
        <Box component="li" sx={{ display: 'flex', gap: 1.25 }}>
          <Typography component="span" sx={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', bgcolor: '#f3f4f6', color: '#4b5563', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1f2937' }}>Generar archivo en DGII</Typography>
            <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mt: '2px' }}>
              En el portal DGII llena los campos y haz clic en <strong>"Generar archivo"</strong>.
              Descargarás un XML sin firmar.
            </Typography>
          </Box>
        </Box>

        {/* Paso 2: subir XML */}
        <Box component="li" sx={{ display: 'flex', gap: 1.25 }}>
          <Box component="span" sx={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(displayFileName ? { bgcolor: '#0d9488', color: '#fff' } : { bgcolor: '#f3f4f6', color: '#4b5563' }) }}>
            {displayFileName ? <Check style={{ width: 12, height: 12 }} /> : '2'}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1f2937' }}>Subir XML sin firmar</Typography>
            {!displayFileName ? (
              <Box component="label" sx={{ mt: 0.75, display: 'block', cursor: 'pointer' }}>
                <input
                  type="file"
                  accept=".xml,application/xml,text/xml"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { setFile(f); setError(null); }
                  }}
                  style={{ display: 'block', width: '100%', fontSize: '0.6875rem', cursor: 'pointer', color: '#6b7280' }}
                />
              </Box>
            ) : (
              <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', px: 1, py: 0.75 }}>
                <Upload style={{ width: 12, height: 12, flexShrink: 0, color: '#9ca3af' }} />
                <Typography component="span" sx={{ fontSize: '0.6875rem', color: '#374151', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{displayFileName}</Typography>
                <IconButton size="small" onClick={handleReset} title="Quitar archivo" sx={{ p: 0, color: '#9ca3af', '&:hover': { color: 'error.main' } }}>
                  <X style={{ width: 12, height: 12 }} />
                </IconButton>
              </Box>
            )}
          </Box>
        </Box>

        {/* Paso 3: firmar */}
        <Box component="li" sx={{ display: 'flex', gap: 1.25 }}>
          <Box component="span" sx={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(signed ? { bgcolor: '#0d9488', color: '#fff' } : { bgcolor: '#f3f4f6', color: '#4b5563' }) }}>
            {signed ? <Check style={{ width: 12, height: 12 }} /> : '3'}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1f2937' }}>Firmar con certificado P12</Typography>
            <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mt: '2px' }}>
              Aplicamos XMLDSig RSA-SHA256 con el cert de {rnc ? `RNC ${rnc}` : 'esta empresa'}.
              {persistedStep1.signedAt && ` Firmado: ${new Date(persistedStep1.signedAt).toLocaleString('es-DO')}`}
            </Typography>
            {!signed && (
              <Button
                type="button"
                variant="contained"
                fullWidth
                onClick={handleFirmar}
                disabled={!file || loading}
                disableElevation
                startIcon={loading ? <Spinner size={14} /> : <FileSignature style={{ width: 14, height: 14 }} />}
                sx={{ mt: 1, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: '6px', bgcolor: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, '&:hover': { bgcolor: '#0f766e' }, '&:disabled': { bgcolor: '#e5e7eb', color: '#9ca3af' } }}
              >
                {loading ? 'Firmando…' : 'Firmar XML'}
              </Button>
            )}
          </Box>
        </Box>

        {/* Paso 4: descargar */}
        {signed && (
          <Box component="li" sx={{ display: 'flex', gap: 1.25 }}>
            <Typography component="span" sx={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', bgcolor: '#f3f4f6', color: '#4b5563', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>4</Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1f2937' }}>Descargar XML firmado</Typography>
              <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mt: '2px' }}>Luego súbelo al portal DGII para completar la postulación.</Typography>
              <Button
                type="button"
                variant="contained"
                fullWidth
                onClick={handleDownload}
                disableElevation
                startIcon={<Download style={{ width: 14, height: 14 }} />}
                sx={{ mt: 1, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: '6px', bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
              >
                Descargar {signed.nombre}
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* Error */}
      {error && (
        <Box sx={{ mt: 1.5, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', p: 1.25, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: '#dc2626' }} />
          <Typography sx={{ fontSize: '0.6875rem', color: '#b91c1c', flex: 1 }}>{error}</Typography>
        </Box>
      )}

      {/* Reset si firmado */}
      {signed && (
        <Button
          type="button"
          onClick={handleReset}
          sx={{ mt: 1.5, fontSize: '0.6875rem', color: 'text.secondary', textTransform: 'none', textDecoration: 'underline', alignSelf: 'center', '&:hover': { color: 'text.primary' } }}
        >
          Firmar otro XML
        </Button>
      )}
    </Paper>
  );
}

function software_or_loading(v: string | undefined) {
  return v && v.length > 0 ? v : 'Cargando…';
}

// ─── Campo estilo portal DGII con copy button ────────────────────────────────

function DgiiCopyField({ label, value, isUrl = false, required = true, colSpan }: {
  label: string;
  value: string;
  isUrl?: boolean;
  required?: boolean;
  colSpan?: number;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Box sx={colSpan ? { gridColumn: `span ${colSpan}` } : undefined}>
      <Typography component="label" sx={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#374151', mb: 0.5 }}>
        {label}{required && <Typography component="span" sx={{ color: 'error.main', ml: '2px' }}>*</Typography>}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '6px', bgcolor: '#fff', overflow: 'hidden', '&:focus-within': { outline: '2px solid rgba(13,148,136,0.2)', borderColor: '#2dd4bf' } }}>
        {isUrl && (
          <Typography component="span" sx={{ flexShrink: 0, px: 1.25, py: 0.75, fontSize: '0.75rem', color: '#9ca3af', bgcolor: '#f9fafb', borderRight: '1px solid #e5e7eb', userSelect: 'none', fontFamily: 'monospace' }}>
            https://
          </Typography>
        )}
        <Typography component="span" sx={{ flex: 1, px: 1.5, py: 0.75, fontSize: '0.75rem', color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontFamily: 'monospace' }}>
          {isUrl ? value.replace(/^https?:\/\//, '') : value}
        </Typography>
        <IconButton
          size="small"
          onClick={handleCopy}
          title="Copiar"
          sx={{ flexShrink: 0, borderRadius: 0, px: 1.25, py: 0.75, borderLeft: '1px solid #e5e7eb', bgcolor: '#f9fafb', color: '#9ca3af', '&:hover': { bgcolor: '#f0fdfa', color: '#0d9488' } }}
        >
          {copied ? <Check style={{ width: 14, height: 14, color: '#0d9488' }} /> : <Copy style={{ width: 14, height: 14 }} />}
        </IconButton>
      </Box>
    </Box>
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
    mensajesDgii?: Array<{ codigo?: number | string; valor?: string }>;
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
  const [reemitting, setReemit] = useState(false);

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

  // Re-emitir la corrida previa SIN borrarla ni re-subir el Excel. Reusa el
  // runId duplicado, re-emite sus casos y lo adopta como corrida activa.
  async function handleReemitirDuplicado() {
    const targetRunId = dupRunId ?? runId;
    if (!targetRunId) return;
    setReemit(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/runs/${targetRunId}/emitir-todos`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Error al re-emitir la corrida');
      setDupRunId(null);
      setFile(null);
      persistUpdate(s => ({
        ...s,
        step2: { runId: targetRunId, status: data.status, lastChecked: new Date().toISOString() },
      }));
      setRun(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al re-emitir la corrida');
    } finally {
      setReemit(false);
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

  // Casos fallidos: solo DGII RECHAZADO/ERROR, o FAILED sin estadoDgii (no llegó a DGII).
  // OJO: ecf-api rebuildRowsFromDb mapea ENVIADO → status=FAILED, así que NO se puede
  // confiar en status='FAILED' solo — habría que excluir los aún en vuelo (ENVIADO/PENDIENTE).
  const failedCases = run?.rows?.filter(r =>
    r.estadoDgii === 'RECHAZADO' ||
    r.estadoDgii === 'ERROR' ||
    (r.status === 'FAILED' && !r.estadoDgii),
  ) ?? [];
  const failedEncfs = failedCases.map(c => c.eNcf).filter(Boolean);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Info banner azul */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', p: 2 }}>
        <AlertCircle style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#2563eb' }} />
        <Box sx={{ flex: 1, fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>
            Etapa en la que se comprueba la capacidad de su sistema para generar
            Comprobantes Fiscales Electrónicos (e-CF), con datos suministrados por DGII.
          </Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', ml: 2.5, mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.75rem', color: '#1e3a5f' }}>
            <li>Descarga el <strong>Excel (Set de pruebas)</strong> del portal DGII, súbelo aquí y el sistema emite los casos automáticamente con el cert del contribuyente (resuelto por <code>RNCEmisor</code> del Excel).</li>
            <li>Las FC <strong>&lt; RD$250,000</strong> NO se envían por API: se descargan en ZIP y se suben manual al portal DGII.</li>
          </Box>
        </Box>
      </Box>

      {/* Card: Subir Excel + arrancar */}
      <CardSection title="1. Subir Excel del Set de Pruebas" icon={Upload} color="teal">
        {!runId ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {!file ? (
              <Box component="label" sx={{ display: 'block', cursor: 'pointer' }}>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(null); } }}
                  style={{ display: 'block', width: '100%', fontSize: '0.6875rem', cursor: 'pointer', color: '#6b7280' }}
                />
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', px: 1, py: 0.75 }}>
                <Upload style={{ width: 12, height: 12, flexShrink: 0, color: '#9ca3af' }} />
                <Typography component="span" sx={{ fontSize: '0.6875rem', color: '#374151', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{file.name}</Typography>
                <IconButton size="small" onClick={() => setFile(null)} sx={{ p: 0, color: '#9ca3af', '&:hover': { color: 'error.main' } }}>
                  <X style={{ width: 12, height: 12 }} />
                </IconButton>
              </Box>
            )}
            {/* e-NCFs a excluir (re-correr solo los que fallaron) */}
            <Box>
              <Typography component="label" sx={{ display: 'block', fontSize: '0.6875rem', fontWeight: 500, color: '#4b5563', mb: 0.5 }}>
                Excluir e-NCFs (opcional)
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={skipEncfs}
                onChange={e => setSkipEncfs(e.target.value)}
                placeholder="E320000000012,E320000000015"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '6px', fontSize: '0.6875rem', fontFamily: 'monospace' } }}
              />
              <Typography sx={{ fontSize: '0.625rem', color: '#9ca3af', mt: 0.5 }}>
                CSV de e-NCF a saltar. Útil para re-subir el Excel omitiendo los que ya fallaron.
              </Typography>
            </Box>
            <Button
              type="button"
              variant="contained"
              fullWidth
              onClick={handleUpload}
              disabled={!file || uploading}
              disableElevation
              startIcon={uploading ? <Spinner size={14} /> : <ArrowRight style={{ width: 14, height: 14 }} />}
              sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: '6px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, '&:disabled': { bgcolor: '#d1d5db', cursor: 'not-allowed' } }}
            >
              {uploading ? 'Subiendo…' : 'Procesar Set de Pruebas'}
            </Button>
            <Typography sx={{ fontSize: '0.625rem', color: '#9ca3af', textAlign: 'center' }}>
              Ambiente: <strong>{env}</strong> · Excel .xlsx, máx 20 MB
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', px: 1.25, py: 1 }}>
              <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0, color: '#059669' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#065f46' }}>Corrida iniciada</Typography>
                <Typography sx={{ fontSize: '0.625rem', color: '#047857', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>run: {runId}</Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                type="button"
                variant="outlined"
                onClick={handleReemitirDuplicado}
                disabled={reemitting}
                title="Re-emite todos los casos de esta corrida sin borrarla"
                startIcon={reemitting
                  ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
                  : <RotateCcw style={{ width: 12, height: 12 }} />}
                sx={{ flex: 1, fontSize: '0.6875rem', textTransform: 'none', borderRadius: '6px', color: '#0d9488', borderColor: '#99f6e4', '&:hover': { bgcolor: '#f0fdfa' } }}
              >
                {reemitting ? 'Re-emitiendo…' : 'Re-emitir'}
              </Button>
              <Button
                type="button"
                variant="outlined"
                fullWidth
                onClick={handleForgetRun}
                startIcon={<RotateCcw style={{ width: 12, height: 12 }} />}
                sx={{ fontSize: '0.6875rem', textTransform: 'none', borderRadius: '6px', color: 'text.secondary', borderColor: '#e5e7eb', '&:hover': { bgcolor: '#f9fafb' } }}
              >
                Olvidar
              </Button>
              <Button
                type="button"
                variant="outlined"
                fullWidth
                onClick={handleDeleteRun}
                startIcon={<X style={{ width: 12, height: 12 }} />}
                sx={{ fontSize: '0.6875rem', textTransform: 'none', borderRadius: '6px', color: 'error.main', borderColor: '#fecaca', '&:hover': { bgcolor: '#fef2f2' } }}
              >
                Borrar en ecf-api
              </Button>
            </Box>
          </Box>
        )}
      </CardSection>

      {/* Card: Estado emisión */}
      {runId && (
        <CardSection title="2. Estado de la emisión" icon={ShieldCheck} color="teal">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <RunStatusBadge status={run?.status ?? persisted.step2?.status ?? 'PROCESANDO'} polling={polling} />
              <Button
                type="button"
                onClick={() => runId && fetchRun(runId)}
                startIcon={<RotateCcw style={{ width: 12, height: 12 }} />}
                sx={{ ml: 'auto', fontSize: '0.6875rem', color: '#0d9488', textTransform: 'none', '&:hover': { color: '#0f766e' } }}
              >
                Refrescar
              </Button>
            </Box>

            {/* Counters de emisión */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, textAlign: 'center' }}>
              <MiniStat label="Total"    value={run?.total ?? 0} />
              <MiniStat label="OK"       value={run?.ok ?? 0}      tone="emerald" />
              <MiniStat label="Fallidos" value={run?.failed ?? 0}  tone="red" />
              <MiniStat label="Saltados" value={run?.skipped ?? 0} tone="gray" />
            </Box>

            {/* Counters DGII */}
            <Box sx={{ borderTop: '1px solid #f3f4f6', pt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <CounterRow label="Aceptados por DGII"  accepted={aceptados}     total={run?.total ?? 0} />
              <CounterRow label="Resúmenes (RFCE) Aceptados" accepted={rfceAceptados} total={rfceRows.length} />
              {rechazados > 0 && <Typography sx={{ fontSize: '0.6875rem', color: '#dc2626' }}>{rechazados} rechazados por DGII</Typography>}
              {enProceso > 0 && <Typography sx={{ fontSize: '0.6875rem', color: '#d97706' }}>{enProceso} en proceso/pendientes</Typography>}
            </Box>

            {run?.errorMessage && (
              <Typography sx={{ fontSize: '0.6875rem', color: '#dc2626', bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', p: 1 }}>{run.errorMessage}</Typography>
            )}

            {/* Casos fallidos con su e-NCF + error específico */}
            {failedCases.length > 0 && (
              <Box sx={{ borderTop: '1px solid #f3f4f6', pt: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#b91c1c' }}>
                    {failedCases.length} caso{failedCases.length === 1 ? '' : 's'} fallido{failedCases.length === 1 ? '' : 's'}
                  </Typography>
                  <Button
                    type="button"
                    size="small"
                    onClick={() => {
                      setSkipEncfs(failedEncfs.join(','));
                      handleForgetRun();
                    }}
                    title="Copia los e-NCF fallidos al campo Excluir y limpia la corrida para re-subir"
                    startIcon={<RotateCcw style={{ width: 10, height: 10 }} />}
                    sx={{ fontSize: '0.625rem', bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, textTransform: 'none', borderRadius: '4px', '&:hover': { bgcolor: '#fde68a' } }}
                  >
                    Excluir fallidos y re-subir
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 192, overflowY: 'auto' }}>
                  {failedCases.map((c, i) => (
                    <Box key={i} sx={{ fontSize: '0.625rem', bgcolor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '4px', px: 1, py: 0.75 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography component="span" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#991b1b', fontSize: '0.625rem' }}>{c.eNcf || '(sin e-NCF)'}</Typography>
                        <Typography component="span" sx={{ color: '#9ca3af', fontSize: '0.625rem' }}>tipo {c.tipoECF}</Typography>
                        <Typography component="span" sx={{ ml: 'auto', px: 0.75, py: '1px', borderRadius: '3px', bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 600, fontSize: '0.625rem' }}>
                          {c.estadoDgii ?? c.status}
                        </Typography>
                      </Box>
                      {(c.error || (c.mensajesDgii && c.mensajesDgii.length > 0)) && (
                        <Typography sx={{ color: '#dc2626', mt: '2px', lineHeight: 1.4, fontSize: '0.625rem' }}>
                          {c.error ?? c.mensajesDgii
                            ?.map(m => [m.codigo, m.valor].filter(Boolean).join(': '))
                            .filter(Boolean)
                            .join(' · ')}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </CardSection>
      )}

      {/* Card: Descargas (FC<250K + paquete) */}
      {runId && (
        <CardSection title="3. Descargas" icon={Download} color="teal">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box
              component="a"
              href={`${apiBase}/runs/${runId}/manual-upload/zip`}
              sx={{ width: '100%', bgcolor: '#0d9488', color: '#fff', fontSize: '0.75rem', fontWeight: 600, px: 2, py: 1, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, textDecoration: 'none', '&:hover': { bgcolor: '#0f766e' } }}
            >
              <Download style={{ width: 14, height: 14 }} /> ZIP Facturas &lt; RD$250K
            </Box>
            <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary', textAlign: 'center' }}>
              Descomprime y sube cada XML al portal DGII en <strong>"Facturas de consumo &lt; 250Mil"</strong>.
            </Typography>
            <Box
              component="a"
              href={`${apiBase}/runs/${runId}/package`}
              sx={{ width: '100%', fontSize: '0.75rem', fontWeight: 600, px: 2, py: 1, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, border: '1px solid #d1d5db', color: '#374151', textDecoration: 'none', '&:hover': { bgcolor: '#f9fafb' } }}
            >
              <Download style={{ width: 14, height: 14 }} /> Paquete completo (XML + PDF)
            </Box>
          </Box>
        </CardSection>
      )}

      {/* Error global */}
      {error && (
        <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', p: 1.25, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: '#dc2626' }} />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.6875rem', color: '#b91c1c' }}>{error}</Typography>
            {dupRunId && (
              <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Button
                  type="button"
                  variant="contained"
                  size="small"
                  onClick={handleReemitirDuplicado}
                  disabled={reemitting}
                  disableElevation
                  title="Reusa la corrida previa y re-emite sus casos sin borrarla ni re-subir el Excel"
                  startIcon={reemitting
                    ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
                    : <RotateCcw style={{ width: 12, height: 12 }} />}
                  sx={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'none', borderRadius: '6px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
                >
                  {reemitting ? 'Re-emitiendo…' : 'Re-emitir sin borrar'}
                </Button>
                <Button
                  type="button"
                  variant="contained"
                  size="small"
                  onClick={handleDeleteDuplicate}
                  disabled={reemitting}
                  disableElevation
                  startIcon={<X style={{ width: 12, height: 12 }} />}
                  sx={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'none', borderRadius: '6px', bgcolor: 'error.main', '&:hover': { bgcolor: 'error.dark' } }}
                >
                  Borrar corrida previa y reintentar
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Info banner */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', p: 2 }}>
        <AlertCircle style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#2563eb' }} />
        <Box sx={{ flex: 1, fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>
            Etapa en la que se comprueba la capacidad de su sistema para generar
            Aprobaciones Comerciales (ACECF), con datos suministrados por DGII.
          </Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', ml: 2.5, mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.75rem', color: '#1e3a5f' }}>
            <li>Descarga <strong>"Aprobaciones Comerciales"</strong> del portal DGII (archivo distinto al del paso 2), súbelo aquí.</li>
            <li>Cada ACECF se firma con el cert del <strong>RNCComprador</strong> (derivado del Excel) y se envía a DGII. Proceso síncrono.</li>
            <li>Para certificar deben enviarse satisfactoriamente <strong>todas</strong> las aprobaciones generadas.</li>
          </Box>
        </Box>
      </Box>

      {/* Card: Subir Excel */}
      <CardSection title="1. Subir Excel de Aprobaciones Comerciales" icon={Upload} color="teal">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {!file ? (
            <Box component="label" sx={{ display: 'block', cursor: 'pointer' }}>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(null); } }}
                style={{ display: 'block', width: '100%', fontSize: '0.6875rem', cursor: 'pointer', color: '#6b7280' }}
              />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', px: 1, py: 0.75 }}>
              <Upload style={{ width: 12, height: 12, flexShrink: 0, color: '#9ca3af' }} />
              <Typography component="span" sx={{ fontSize: '0.6875rem', color: '#374151', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{file.name}</Typography>
              <IconButton size="small" onClick={() => setFile(null)} sx={{ p: 0, color: '#9ca3af', '&:hover': { color: 'error.main' } }}>
                <X style={{ width: 12, height: 12 }} />
              </IconButton>
            </Box>
          )}
          <Box>
            <Typography component="label" sx={{ display: 'block', fontSize: '0.6875rem', fontWeight: 500, color: '#4b5563', mb: 0.5 }}>Shift selectivo de fecha (opcional)</Typography>
            <TextField
              fullWidth
              size="small"
              value={secShiftEncfs}
              onChange={e => setShift(e.target.value)}
              placeholder="E450000000010,E330000000001"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '6px', fontSize: '0.6875rem', fontFamily: 'monospace' } }}
            />
            <Typography sx={{ fontSize: '0.625rem', color: '#9ca3af', mt: 0.5 }}>
              CSV de e-NCF — ajusta FechaHoraAprobacionComercial si DGII lo pide al re-enviar.
            </Typography>
          </Box>
          <Button
            type="button"
            variant="contained"
            fullWidth
            onClick={handleUpload}
            disabled={!file || uploading}
            disableElevation
            startIcon={uploading ? <Spinner size={14} /> : <ArrowRight style={{ width: 14, height: 14 }} />}
            sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: '6px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, '&:disabled': { bgcolor: '#d1d5db', cursor: 'not-allowed' } }}
          >
            {uploading ? 'Procesando…' : 'Procesar Aprobaciones'}
          </Button>
          <Typography sx={{ fontSize: '0.625rem', color: '#9ca3af', textAlign: 'center' }}>
            Ambiente: <strong>{env}</strong> · Excel .xlsx (hoja ACEECF_Generadas), máx 20 MB
          </Typography>
        </Box>
      </CardSection>

      {/* Card: Resultado */}
      {result && (
        <CardSection title="2. Resultado del envío" icon={ShieldCheck} color="teal">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography component="span" sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>
                {persisted.step3?.lastRunAt && `Último envío: ${new Date(persisted.step3.lastRunAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}`}
              </Typography>
              <Button
                type="button"
                onClick={handleClear}
                startIcon={<RotateCcw style={{ width: 12, height: 12 }} />}
                sx={{ ml: 'auto', fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'none', '&:hover': { color: 'error.main' } }}
              >
                Limpiar
              </Button>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, textAlign: 'center' }}>
              <MiniStat label="Total"    value={result.total} />
              <MiniStat label="OK"       value={result.ok}     tone="emerald" />
              <MiniStat label="Fallidas" value={result.failed} tone="red" />
            </Box>

            <CounterRow label="Aprobaciones comerciales aceptadas" accepted={result.ok} total={result.total} />

            {/* Filas fallidas con e-NCF + error */}
            {failedRows.length > 0 && (
              <Box sx={{ borderTop: '1px solid #f3f4f6', pt: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#b91c1c' }}>
                    {failedRows.length} fallida{failedRows.length === 1 ? '' : 's'}
                  </Typography>
                  {failedEncfs.length > 0 && (
                    <Button
                      type="button"
                      size="small"
                      onClick={() => setShift(failedEncfs.join(','))}
                      title="Copia los e-NCF fallidos al campo de shift selectivo"
                      startIcon={<RotateCcw style={{ width: 10, height: 10 }} />}
                      sx={{ fontSize: '0.625rem', bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, textTransform: 'none', borderRadius: '4px', '&:hover': { bgcolor: '#fde68a' } }}
                    >
                      Copiar fallidos a shift
                    </Button>
                  )}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 192, overflowY: 'auto' }}>
                  {failedRows.map((r, i) => (
                    <Box key={i} sx={{ fontSize: '0.625rem', bgcolor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '4px', px: 1, py: 0.75 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography component="span" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#991b1b', fontSize: '0.625rem' }}>{r.eNcf || '(sin e-NCF)'}</Typography>
                        <Typography component="span" sx={{ ml: 'auto', px: 0.75, py: '1px', borderRadius: '3px', bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 600, fontSize: '0.625rem' }}>
                          {r.estadoDgii ?? r.estadoEnvio ?? 'ERROR'}
                        </Typography>
                      </Box>
                      {r.error && <Typography sx={{ color: '#dc2626', mt: '2px', lineHeight: 1.4, fontSize: '0.625rem' }}>{r.error}</Typography>}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Filas OK (resumen compacto) */}
            {rows.length > 0 && (
              <Box component="details" sx={{ borderTop: '1px solid #f3f4f6', pt: 1 }}>
                <Typography component="summary" sx={{ fontSize: '0.6875rem', color: 'text.secondary', cursor: 'pointer' }}>Ver todas las filas ({rows.length})</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 192, overflowY: 'auto', mt: 0.75 }}>
                  {rows.map((r, i) => (
                    <Box key={i} sx={{ fontSize: '0.625rem', display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, bgcolor: '#f9fafb', borderRadius: '4px' }}>
                      <Typography component="span" sx={{ fontFamily: 'monospace', color: '#374151', fontSize: '0.625rem' }}>{r.eNcf || '—'}</Typography>
                      <Typography component="span" sx={{ color: '#9ca3af', fontSize: '0.625rem' }}>{r.trackId ?? ''}</Typography>
                      <Typography component="span" sx={{ ml: 'auto', color: '#4b5563', fontSize: '0.625rem' }}>{r.estadoDgii ?? r.estadoEnvio ?? ''}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </CardSection>
      )}

      {/* Error global */}
      {error && (
        <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', p: 1.25, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: '#dc2626' }} />
          <Typography sx={{ fontSize: '0.6875rem', color: '#b91c1c', flex: 1 }}>{error}</Typography>
        </Box>
      )}
    </Box>
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
  // Solo RECHAZADO/ERROR, o FAILED sin estadoDgii. ecf-api rebuildRowsFromDb
  // mapea ENVIADO → status=FAILED, así que status='FAILED' solo no basta.
  const failedCases = rows.filter(r =>
    r.estadoDgii === 'RECHAZADO' ||
    r.estadoDgii === 'ERROR' ||
    (r.status === 'FAILED' && !r.estadoDgii),
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Banner */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', p: 2 }}>
        <AlertCircle style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#2563eb' }} />
        <Box sx={{ flex: 1, fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>
            Pruebas de Simulación: el sistema genera <strong>29 e-CF sintéticos</strong> y
            los envía a DGII con el cert del contribuyente. No requiere Excel.
          </Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', ml: 2.5, mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.75rem', color: '#1e3a5f' }}>
            <li>Cada tipo usa un rango de NCF 1–10,000,000; los NCF rechazados no se reutilizan.</li>
            <li>Las FC <strong>&lt; RD$250,000</strong> se descargan en ZIP y se suben manual al portal DGII.</li>
            <li>Si DGII rechaza, usa <strong>Re-iniciar</strong> para correr con NCFs frescos (+100).</li>
          </Box>
        </Box>
      </Box>

      {/* Card: Iniciar */}
      <CardSection title="1. Iniciar simulación" icon={FlaskConical} color="teal">
        {!runId ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box>
              <Typography component="label" sx={{ display: 'block', fontSize: '0.6875rem', fontWeight: 500, color: '#4b5563', mb: 0.5 }}>NCF inicial</Typography>
              <TextField
                fullWidth
                size="small"
                type="number"
                value={ncfStart}
                onChange={e => setNcfStart(parseInt(e.target.value, 10) || 500)}
                slotProps={{ htmlInput: { min: 1 } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '6px', fontSize: '0.6875rem', fontFamily: 'monospace' } }}
              />
              <Typography sx={{ fontSize: '0.625rem', color: '#9ca3af', mt: 0.5 }}>Usa un valor alto/fresco (500+) para no chocar con eNCF ya quemados.</Typography>
            </Box>
            <Button
              type="button"
              variant="contained"
              fullWidth
              onClick={handleStart}
              disabled={starting}
              disableElevation
              startIcon={starting ? <Spinner size={14} /> : <FlaskConical style={{ width: 14, height: 14 }} />}
              sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: '6px', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' }, '&:disabled': { bgcolor: '#d1d5db', cursor: 'not-allowed' } }}
            >
              {starting ? 'Iniciando…' : 'Iniciar simulación (29 casos)'}
            </Button>
            <Typography sx={{ fontSize: '0.625rem', color: '#9ca3af', textAlign: 'center' }}>Ambiente: <strong>{env}</strong></Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', px: 1.25, py: 1 }}>
              <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0, color: '#059669' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#065f46' }}>Simulación iniciada</Typography>
                <Typography sx={{ fontSize: '0.625rem', color: '#047857', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>run: {runId}</Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                type="button"
                variant="outlined"
                fullWidth
                onClick={handleRestart}
                disabled={starting}
                startIcon={starting ? <Spinner size={12} /> : <RotateCcw style={{ width: 12, height: 12 }} />}
                sx={{ fontSize: '0.6875rem', textTransform: 'none', borderRadius: '6px', color: '#0f766e', borderColor: '#a7f3d0', '&:hover': { bgcolor: '#f0fdfa' }, '&:disabled': { opacity: 0.5 } }}
              >
                Re-iniciar (+100)
              </Button>
              <Button
                type="button"
                variant="outlined"
                fullWidth
                onClick={handleForget}
                startIcon={<X style={{ width: 12, height: 12 }} />}
                sx={{ fontSize: '0.6875rem', textTransform: 'none', borderRadius: '6px', color: 'text.secondary', borderColor: '#e5e7eb', '&:hover': { bgcolor: '#f9fafb' } }}
              >
                Olvidar
              </Button>
            </Box>
          </Box>
        )}
      </CardSection>

      {/* Card: Estado por tipo */}
      {runId && (
        <CardSection title="2. Estado de las pruebas de simulación" icon={ShieldCheck} color="teal">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <RunStatusBadge status={run?.status ?? persisted.step4?.status ?? 'PROCESANDO'} polling={polling} />
              <Button
                type="button"
                onClick={() => runId && fetchRun(runId)}
                startIcon={<RotateCcw style={{ width: 12, height: 12 }} />}
                sx={{ ml: 'auto', fontSize: '0.6875rem', color: '#0d9488', textTransform: 'none', '&:hover': { color: '#0f766e' } }}
              >
                Refrescar
              </Button>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1 }}>
              {SIMUL_REQUERIDOS.map(t => {
                const acc = acceptedOf(t.tipo, t.formato);
                const done = acc >= t.req;
                return (
                  <Box key={t.key} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, px: 1, py: 0.75, borderRadius: '4px', border: '1px solid', ...(done ? { bgcolor: '#ecfdf5', borderColor: '#a7f3d0' } : { bgcolor: '#f9fafb', borderColor: '#e5e7eb' }) }}>
                    <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: done ? '#065f46' : 'text.primary' }}>
                      {acc}/{t.req}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: '0.625rem', color: '#4b5563' }}>{t.label}</Typography>
                  </Box>
                );
              })}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, textAlign: 'center', borderTop: '1px solid #f3f4f6', pt: 1 }}>
              <MiniStat label="Total"    value={run?.total ?? 0} />
              <MiniStat label="OK"       value={run?.ok ?? 0}      tone="emerald" />
              <MiniStat label="Fallidos" value={run?.failed ?? 0}  tone="red" />
              <MiniStat label="Saltados" value={run?.skipped ?? 0} tone="gray" />
            </Box>

            {failedCases.length > 0 && (
              <Box sx={{ borderTop: '1px solid #f3f4f6', pt: 1 }}>
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#b91c1c', mb: 0.75 }}>{failedCases.length} fallidos</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 192, overflowY: 'auto' }}>
                  {failedCases.map((c, i) => (
                    <Box key={i} sx={{ fontSize: '0.625rem', bgcolor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '4px', px: 1, py: 0.75 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography component="span" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#991b1b', fontSize: '0.625rem' }}>{c.eNcf || '(sin e-NCF)'}</Typography>
                        <Typography component="span" sx={{ color: '#9ca3af', fontSize: '0.625rem' }}>tipo {c.tipoECF}</Typography>
                        <Typography component="span" sx={{ ml: 'auto', px: 0.75, py: '1px', borderRadius: '3px', bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 600, fontSize: '0.625rem' }}>{c.estadoDgii ?? c.status}</Typography>
                      </Box>
                      {(c.error || (c.mensajesDgii && c.mensajesDgii.length > 0)) && (
                        <Typography sx={{ color: '#dc2626', mt: '2px', lineHeight: 1.4, fontSize: '0.625rem' }}>{c.error ?? c.mensajesDgii
                          ?.map(m => [m.codigo, m.valor].filter(Boolean).join(': '))
                          .filter(Boolean)
                          .join(' · ')}</Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </CardSection>
      )}

      {/* Card: Descargas */}
      {runId && (
        <CardSection title="3. Facturas < RD$250K" icon={Download} color="teal">
          <Box
            component="a"
            href={`${zipBase}/runs/${runId}/manual-upload/zip`}
            sx={{ width: '100%', bgcolor: '#0d9488', color: '#fff', fontSize: '0.75rem', fontWeight: 600, px: 2, py: 1, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, textDecoration: 'none', '&:hover': { bgcolor: '#0f766e' } }}
          >
            <Download style={{ width: 14, height: 14 }} /> ZIP Facturas &lt; RD$250K
          </Box>
          <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary', textAlign: 'center', mt: 1 }}>
            Descomprime y sube cada XML al portal DGII en <strong>"Facturas de consumo &lt; 250Mil"</strong>.
          </Typography>
        </CardSection>
      )}

      {error && (
        <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', p: 1.25, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: '#dc2626' }} />
          <Typography sx={{ fontSize: '0.6875rem', color: '#b91c1c', flex: 1 }}>{error}</Typography>
        </Box>
      )}
    </Box>
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
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', p: 2 }}>
        <AlertCircle style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#d97706' }} />
        <Box sx={{ fontSize: '0.75rem', color: '#78350f' }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: '2px', color: '#78350f' }}>Completa el paso 4 primero</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#78350f' }}>Las representaciones impresas (PDF) salen de los e-CF emitidos en la Simulación (paso 4).</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Banner */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', p: 2 }}>
        <AlertCircle style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#2563eb' }} />
        <Box sx={{ flex: 1, fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>
            Genera y envía las Representaciones Impresas (PDF) de los e-CF del paso 4.
            La subida es <strong>manual en el portal DGII</strong> — el sistema solo entrega los PDF con el QR correcto.
          </Typography>
          <Box component="ul" sx={{ listStyleType: 'disc', ml: 2.5, mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.75rem', color: '#1e3a5f' }}>
            <li>Descarga el paquete, descomprime y sube un PDF de cada tipo en el portal (Paso 5 → ENVIAR ARCHIVOS).</li>
            <li>La suma de archivos no puede superar <strong>10MB</strong>.</li>
          </Box>
        </Box>
      </Box>

      {/* Card: Descargar paquete */}
      <CardSection title="1. Descargar representaciones (PDF)" icon={Printer} color="teal">
        <Box
          component="a"
          href={`${zipBase}/runs/${runId}/package`}
          sx={{ width: '100%', bgcolor: '#0d9488', color: '#fff', fontSize: '0.75rem', fontWeight: 600, px: 2, py: 1, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, textDecoration: 'none', '&:hover': { bgcolor: '#0f766e' } }}
        >
          <Download style={{ width: 14, height: 14 }} /> Paquete completo (PDF + XML por tipo)
        </Box>
        <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary', textAlign: 'center', mt: 1 }}>
          PDFs nombrados por tipo (incluye 32 ≥250mil y 32 &lt;250mil).
        </Typography>
      </CardSection>

      {/* Card: PDF individual por tipo */}
      <CardSection title="2. PDF individual por tipo" icon={FileText} color="teal">
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.75rem', color: 'text.secondary', py: 1.5, justifyContent: 'center' }}>
            <Spinner size={16} /> Cargando emisiones…
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1 }}>
            {REPR_TIPOS.map(t => {
              const row = pdfFor(t.tipo, t.formato);
              return (
                <Box key={t.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, border: '1px solid #e5e7eb', borderRadius: '6px', px: 1.25, py: 0.75 }}>
                  <Typography component="span" sx={{ fontSize: '0.6875rem', color: '#374151', flex: 1 }}>{t.label}</Typography>
                  {row?.emisionId ? (
                    <Box
                      component="a"
                      href={`${apiBase}/emisiones/${row.emisionId}/pdf`}
                      target="_blank" rel="noopener noreferrer"
                      sx={{ fontSize: '0.6875rem', color: '#0d9488', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5, textDecoration: 'none', '&:hover': { color: '#0f766e' } }}
                    >
                      <Download style={{ width: 12, height: 12 }} /> PDF
                    </Box>
                  ) : (
                    <Typography component="span" sx={{ fontSize: '0.625rem', color: '#d1d5db' }}>—</Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
        <Typography sx={{ fontSize: '0.625rem', color: '#9ca3af', mt: 1 }}>
          La FC tipo 32 &lt;RD$250mil se incluye en el paquete completo.
        </Typography>
      </CardSection>

      {/* Aviso responsabilidad */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', p: 1.5 }}>
        <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, color: '#d97706' }} />
        <Typography sx={{ fontSize: '0.6875rem', color: '#92400e' }}>
          Es responsabilidad del contribuyente que la representación impresa cumpla con la Ley 32-23
          y la documentación técnica del Formato de e-CF.
        </Typography>
      </Box>

      {error && (
        <Box sx={{ bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', p: 1.25, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2, color: '#dc2626' }} />
          <Typography sx={{ fontSize: '0.6875rem', color: '#b91c1c', flex: 1 }}>{error}</Typography>
        </Box>
      )}
    </Box>
  );
}

// ─── Steps 6 / 14 / 15: pasos pasivos (DGII valida / finalizado) ──────────────

function PasoPasivoBody({ stepId }: { stepId: number }) {
  if (stepId === 15) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', p: 2 }}>
        <PartyPopper style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#059669' }} />
        <Box sx={{ fontSize: '0.75rem', color: '#064e3b' }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: '2px', color: '#064e3b' }}>¡Habilitación completada!</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#064e3b' }}>El contribuyente está habilitado para emitir e-CF en producción. No requiere más acciones.</Typography>
        </Box>
      </Box>
    );
  }

  const info = stepId === 6
    ? {
        title: 'Validación de la Representación Impresa',
        body:  'DGII valida las representaciones impresas (PDF) subidas en el paso 5. No requiere acción en el sistema — espera la confirmación en el portal DGII.',
      }
    : {
        title: 'Verificación de Estatus',
        body:  'DGII verifica el estatus final de la habilitación. No requiere acción en el sistema — el resultado se refleja en el portal DGII.',
      };

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', p: 2 }}>
      <AlertCircle style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#2563eb' }} />
      <Box sx={{ fontSize: '0.75rem', color: '#1e3a5f' }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: '2px', color: '#1e3a5f' }}>{info.title}</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: 'rgba(30,58,95,0.8)' }}>{info.body}</Typography>
      </Box>
    </Box>
  );
}

// ─── Step 13: Declaración Jurada ──────────────────────────────────────────────
// Mismo flujo de firma que el paso 1, con proposito 'declaracion-jurada'.

function Step13Body({ ctx, persisted, persistUpdate }: {
  ctx: StepCtx;
  persisted: PersistedState;
  persistUpdate: (mut: (s: PersistedState) => PersistedState) => void;
}) {
  const portalUrl = ctx.ambiente === 'Produccion'
    ? 'https://ecf.dgii.gov.do/ecf/contribuyentes'
    : ctx.ambiente === 'CerteCF'
      ? 'https://ecf.dgii.gov.do/certecf/contribuyentes'
      : 'https://ecf.dgii.gov.do/testecf/contribuyentes';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', p: 2 }}>
        <ScrollText style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#2563eb' }} />
        <Box sx={{ flex: 1, fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: '2px', color: '#1e3a5f' }}>Declaración Jurada</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(30,58,95,0.8)' }}>
            En el portal DGII genera el archivo de Declaración Jurada ("Generar archivo"),
            descárgalo, súbelo a la derecha para firmarlo con el cert del contribuyente y
            sube el XML firmado de vuelta al portal ("Enviar archivo").
          </Typography>
        </Box>
        <Box
          component="a"
          href={portalUrl}
          target="_blank" rel="noopener noreferrer"
          sx={{ fontSize: '0.6875rem', bgcolor: '#2563eb', color: '#fff', fontWeight: 600, px: 1.5, py: 0.75, borderRadius: '6px', display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, textDecoration: 'none', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          Abrir portal <ExternalLink style={{ width: 12, height: 12 }} />
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, 1fr)' }, gap: 2.5 }}>
        <Box sx={{ fontSize: '0.75rem', color: '#4b5563', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', lineHeight: 1.6 }}>
            La Declaración Jurada acredita que el contribuyente, responsable o tercero mandatario
            conoce el modelo de facturación electrónica de la DGII y es responsable solidario del
            uso de los e-CF.
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', lineHeight: 1.6 }}>
            Requiere un certificado de firma digital acreditado por una entidad certificadora
            autorizada (INDOTEL). Se firma con el cert del contribuyente
            {ctx.rnc ? ` (RNC ${ctx.rnc})` : ''}.
          </Typography>
        </Box>
        <FirmarPostulacionPanel
          rnc={ctx.rnc}
          codigoPublico={ctx.codigoPublico}
          persisted={persisted}
          persistUpdate={persistUpdate}
          proposito="declaracion-jurada"
          slotKey="step13"
          titulo="Firma de la Declaración Jurada"
        />
      </Box>
    </Box>
  );
}

// ─── Steps 8-11: acción en portal DGII + DGII valida (pasivo) ─────────────────

const PORTAL_STEP_INFO: Record<number, { intro: string; accion: string; valida: string }> = {
  8: {
    intro: 'Inicio de la prueba de Recepción de e-CF. DGII enviará e-CF de prueba a tu Servicio de Recepción.',
    accion: 'En el portal DGII haz clic en "Enviar prueba de recepción e-CF".',
    valida: 'DGII enviará los comprobantes a tu webhook de recepción registrado en el paso 7.',
  },
  9: {
    intro: 'Recepción de e-CF. DGII valida que tu servicio recibió y respondió correctamente los e-CF de prueba.',
    accion: 'No requiere acción en el sistema — el flujo ocurre entre DGII y tu Servicio de Recepción.',
    valida: 'DGII valida las respuestas (ARECF) que devolvió tu servicio. Verifica el estatus en el portal.',
  },
  10: {
    intro: 'Inicio de la prueba de Recepción de Aprobación Comercial.',
    accion: 'En el portal DGII haz clic en "Enviar prueba de aprobaciones comerciales".',
    valida: 'DGII enviará las aprobaciones comerciales de prueba a tu webhook registrado.',
  },
  11: {
    intro: 'Recepción de Aprobación Comercial. DGII valida que tu servicio procesó las aprobaciones recibidas.',
    accion: 'No requiere acción en el sistema — el flujo ocurre entre DGII y tu Servicio de Aprobación Comercial.',
    valida: 'DGII valida el procesamiento. Verifica el estatus en el portal DGII.',
  },
};

function PortalStepBody({ stepId, ctx }: { stepId: number; ctx: StepCtx }) {
  const info = PORTAL_STEP_INFO[stepId];
  const portalUrl = ctx.ambiente === 'Produccion'
    ? 'https://ecf.dgii.gov.do/ecf/contribuyentes'
    : ctx.ambiente === 'CerteCF'
      ? 'https://ecf.dgii.gov.do/certecf/contribuyentes'
      : 'https://ecf.dgii.gov.do/testecf/contribuyentes';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', p: 2 }}>
        <AlertCircle style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#2563eb' }} />
        <Typography sx={{ flex: 1, fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>{info.intro}</Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
          <Typography component="span" sx={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', bgcolor: '#ccfbf1', color: '#0f766e', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#374151', flex: 1 }}>{info.accion}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
          <Typography component="span" sx={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', bgcolor: '#f3f4f6', color: '#4b5563', fontSize: '0.6875rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>2</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', flex: 1 }}>{info.valida}</Typography>
        </Box>
      </Box>

      <Box
        component="a"
        href={portalUrl}
        target="_blank" rel="noopener noreferrer"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.75rem', bgcolor: '#2563eb', color: '#fff', fontWeight: 600, px: 2, py: 1, borderRadius: '6px', textDecoration: 'none', alignSelf: 'flex-start', '&:hover': { bgcolor: '#1d4ed8' } }}
      >
        Abrir portal DGII <ExternalLink style={{ width: 14, height: 14 }} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', p: 1.5 }}>
        <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, color: '#d97706' }} />
        <Typography sx={{ fontSize: '0.6875rem', color: '#92400e' }}>
          Cuando DGII confirme este paso en el portal, márcalo como completado abajo.
        </Typography>
      </Box>
    </Box>
  );
}

// ─── Steps 7 / 12: URL Servicios (Prueba / Producción) ────────────────────────
// Igual al paso 1: presenta el webhookBaseUrl para copiar al portal DGII.
// El portal añade el suffix (/fe/recepcion/api/ecf, etc).

function UrlServiciosBody({ ctx, produccion }: { ctx: StepCtx; produccion: boolean }) {
  const baseValue = ctx.webhookBaseUrl ?? 'Cargando…';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', p: 2 }}>
        <AlertCircle style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2, color: '#2563eb' }} />
        <Box sx={{ flex: 1, fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6 }}>
            Etapa en la que deben ser validadas y/o actualizadas las URL de los servicios de
            Recepción, Aprobación Comercial y/o Autenticación
            {produccion ? ' para el ambiente de PRODUCCIÓN.' : '.'}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: '#1e3a5f', lineHeight: 1.6, mt: 0.75 }}>
            Pega la misma URL en cada campo del portal DGII — el portal añade el sufijo
            (<code>/fe/recepcion/api/ecf</code>, etc.) automáticamente.
          </Typography>
        </Box>
      </Box>

      <Box component="section">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Link2 style={{ width: 16, height: 16, color: '#6b7280' }} />
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>URLs para confirmación</Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <DgiiCopyField label="Servicio de Autenticación"     value={baseValue} isUrl required={false} />
          <DgiiCopyField label="Servicio de Recepción"         value={baseValue} isUrl />
          <DgiiCopyField label="Servicio de Aprobación Comercial" value={baseValue} isUrl />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', p: 1.5 }}>
        <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, color: '#d97706' }} />
        <Typography sx={{ fontSize: '0.6875rem', color: '#92400e' }}>
          Tras pegar las URLs en el portal DGII, haz clic en <strong>"Confirmar URLs"</strong> ahí,
          luego marca este paso como completado.
        </Typography>
      </Box>
    </Box>
  );
}

function RunStatusBadge({ status, polling }: { status: string; polling: boolean }) {
  const map: Record<string, { bgcolor: string; color: string; borderColor: string; label: string }> = {
    PENDIENTE:  { bgcolor: '#f3f4f6', color: '#4b5563', borderColor: '#e5e7eb', label: 'Pendiente' },
    PROCESANDO: { bgcolor: '#fffbeb', color: '#b45309', borderColor: '#fde68a', label: 'Procesando' },
    COMPLETO:   { bgcolor: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0', label: 'Completo' },
    FALLIDO:    { bgcolor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', label: 'Fallido' },
  };
  const c = map[status] ?? map.PROCESANDO;
  return (
    <Typography component="span" sx={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid', px: 1, py: '2px', borderRadius: '999px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: c.bgcolor, color: c.color, borderColor: c.borderColor }}>
      {polling ? <Spinner size={12} /> : <Circle style={{ width: 10, height: 10 }} />}
      {c.label}
    </Typography>
  );
}

function MiniStat({ label, value, tone = 'gray' }: { label: string; value: number; tone?: 'emerald'|'red'|'gray' }) {
  const color = tone === 'emerald' ? '#065f46' : tone === 'red' ? '#dc2626' : 'text.primary';
  return (
    <Box sx={{ bgcolor: '#f9fafb', borderRadius: '6px', py: 1 }}>
      <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color }}>{value}</Typography>
      <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</Typography>
    </Box>
  );
}

function CardSection({ title, icon: Icon, children, color = 'teal' }: {
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  children: React.ReactNode;
  color?: 'teal' | 'amber';
}) {
  const headerBg = color === 'teal' ? '#0d9488' : '#d97706';
  return (
    <Paper variant="outlined" sx={{ bgcolor: '#fff', borderRadius: '8px', overflow: 'hidden', borderColor: '#e5e7eb' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, bgcolor: headerBg }}>
        <Icon style={{ width: 16, height: 16, color: '#fff' }} />
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff' }}>{title}</Typography>
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Paper>
  );
}

function CounterRow({ label, accepted, total }: { label: string; accepted: number; total: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, py: 0.5 }}>
      <Typography component="span" sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{accepted}/{total}</Typography>
      <Typography component="span" sx={{ fontSize: '0.75rem', color: '#4b5563' }}>{label}</Typography>
    </Box>
  );
}

// ─── Placeholder body para pasos 3-15 ─────────────────────────────────────────

function StepPlaceholderBody({ step }: { step: Step }) {
  return (
    <>
      <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', mb: 1.5, lineHeight: 1.6 }}>{step.desc}</Typography>

      {/* Sub-pantallas grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1, mb: 1.5 }}>
        {step.screens.map((sc, i) => (
          <Paper
            key={i}
            variant="outlined"
            sx={{ bgcolor: '#fff', borderRadius: '8px', p: 1.5, borderColor: '#e5e7eb', transition: 'border-color 0.15s', '&:hover': { borderColor: '#d1d5db' } }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Typography component="span" sx={{ fontSize: '0.625rem', fontFamily: 'monospace', color: '#9ca3af', bgcolor: '#f3f4f6', borderRadius: '4px', px: 0.75, py: '2px', flexShrink: 0, mt: '2px' }}>
                {step.id}.{i + 1}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#1f2937' }}>{sc.label}</Typography>
                <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', mt: '2px', lineHeight: 1.4 }}>{sc.desc}</Typography>
              </Box>
            </Box>
          </Paper>
        ))}
      </Box>

      <Paper variant="outlined" sx={{ bgcolor: '#fff', borderRadius: '8px', p: 1.5, borderStyle: 'dashed', borderColor: '#d1d5db', textAlign: 'center' }}>
        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          Acciones de este paso pendientes de wire (endpoint por conectar).
        </Typography>
      </Paper>
    </>
  );
}

function StatusPill({ status }: { status: Status }) {
  const config: Record<Status, { label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; bgcolor: string; color: string; borderColor: string }> = {
    'pending':     { label: 'Pendiente',   icon: Circle,       bgcolor: '#f3f4f6', color: '#4b5563', borderColor: '#e5e7eb' },
    'in-progress': { label: 'En progreso', icon: Clock,        bgcolor: '#fffbeb', color: '#b45309', borderColor: '#fde68a' },
    'done':        { label: 'Completo',    icon: CheckCircle2, bgcolor: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' },
    'error':       { label: 'Error',       icon: AlertCircle,  bgcolor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' },
  };

  const c = config[status];
  const Icon = c.icon;
  return (
    <Typography component="span" sx={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid', px: 1, py: '2px', borderRadius: '999px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0, bgcolor: c.bgcolor, color: c.color, borderColor: c.borderColor }}>
      <Icon style={{ width: 10, height: 10 }} />
      {c.label}
    </Typography>
  );
}
