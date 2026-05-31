'use client';

import { useEffect, useState } from 'react';
import { Loader2, History as HistoryIcon } from 'lucide-react';

interface LogRow {
  id:           number | string;
  action:       string;
  resource:     string | null;
  actor:        string;
  userName:     string | null;
  metadata:     string | null;
  ipAddress:    string | null;
  createdAt:    string;
  _source?:     'audit' | 'row_audit';
  _operation?:  string;
  _changedCols?: string[] | null;
}

interface Props {
  docId?:     number;
  encf?:      string;
  className?: string;
}

// ─── Labels de acciones manuales (audit_logs) ──────────────────────────────────
const ACTION_LABEL: Record<string, string> = {
  ECF_SEND:           'Enviado a DGII',
  ECF_ACEPTADO:       'Aceptado por DGII',
  ECF_RECHAZADO:      'Rechazado por DGII',
  ECF_ANULADO:        'Anulado',
  PAGO_REGISTRADO:    'Pago registrado',
  CERT_UPLOAD:        'Certificado cargado',
  CERT_DELETE:        'Certificado eliminado',
};

// ─── Labels legibles para columnas de ecf_documents ───────────────────────────
const COL_LABEL: Record<string, string> = {
  estado:               'Estado',
  monto_total:          'Monto total',
  total_itbis:          'ITBIS',
  encf:                 'e-NCF',
  tipo_ecf:             'Tipo',
  track_id:             'Track ID',
  codigo_seguridad:     'Código de seguridad',
  fecha_firma:          'Fecha de firma',
  url_verificacion:     'URL verificación',
  pago_recibido:        'Pago recibido',
  pago_metodo:          'Método de pago',
  pago_valor_cts:       'Valor de pago',
  pago_fecha:           'Fecha de pago',
  rnc_comprador:        'RNC comprador',
  razon_social_comprador: 'Razón social comprador',
  email_comprador:      'Email comprador',
  notas:                'Notas',
  comentario:           'Comentario',
  terminos_condiciones: 'Términos y condiciones',
  fecha_limite_pago:    'Fecha límite de pago',
  tipo_pago:            'Tipo de pago',
  lineas_json:          'Líneas de detalle',
  updated_at:           'Actualizado',
  ecf_api_emision_id:   'ID emisión ECF-API',
};

function friendlyCols(cols: string[] | null | undefined): string {
  if (!cols || cols.length === 0) return '';
  return cols
    .filter(c => c !== 'updated_at')           // ruido — siempre cambia
    .map(c => COL_LABEL[c] ?? c.replace(/_/g, ' '))
    .join(', ');
}

function labelForRow(log: LogRow): string {
  if (log._source === 'row_audit') {
    switch (log._operation) {
      case 'I': return 'Factura creada';
      case 'U': {
        const cols = friendlyCols(log._changedCols);
        return cols ? `Actualizado: ${cols}` : 'Factura actualizada';
      }
      case 'D': return 'Factura eliminada';
      default:  return 'Cambio en base de datos';
    }
  }
  return ACTION_LABEL[log.action] ?? log.action;
}

/**
 * Historial de eventos de una entidad — lee audit_logs + row_audit_log
 * filtrado por resource/docId. Usa para mostrar la pestaña "Historia"
 * en el detalle de factura.
 */
export function EntityHistory({ docId, encf, className = '' }: Props) {
  const [logs, setLogs]       = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!docId && !encf) return;
    const params = new URLSearchParams();
    if (docId) params.set('docId', String(docId));
    if (encf)  params.set('encf', encf);

    setLoading(true);
    fetch(`/api/audit-logs?${params.toString()}`)
      .then(r => r.json())
      .then(j => setLogs(j.logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [docId, encf]);

  function fmtDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('es-DO', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  function renderMeta(log: LogRow): string | null {
    if (log._source === 'row_audit') return null; // label ya tiene el detalle

    if (!log.metadata) return null;
    try {
      const m = JSON.parse(log.metadata) as Record<string, unknown>;
      const parts: string[] = [];
      if (m.tipoEcf)    parts.push(`tipo ${m.tipoEcf}`);
      if (m.montoTotal) parts.push(`RD$ ${Number(m.montoTotal).toFixed(2)}`);
      if (m.trackId)    parts.push(`track ${String(m.trackId).slice(0, 12)}…`);
      if (m.via)        parts.push(`vía ${m.via}`);
      return parts.length ? parts.join(' · ') : null;
    } catch {
      return null;
    }
  }

  // Badge visual por tipo de fuente/operación
  function badgeClass(log: LogRow): string {
    if (log._source === 'row_audit') {
      if (log._operation === 'I') return 'border-emerald-300 bg-emerald-50';
      if (log._operation === 'U') return 'border-sky-200 bg-sky-50';
      if (log._operation === 'D') return 'border-red-200 bg-red-50';
      return 'border-gray-200';
    }
    if (log.action === 'ECF_SEND' || log.action === 'ECF_ACEPTADO') return 'border-teal-300 bg-teal-50';
    if (log.action === 'ECF_RECHAZADO' || log.action === 'ECF_ANULADO') return 'border-red-200 bg-red-50';
    if (log.action === 'PAGO_REGISTRADO') return 'border-emerald-200 bg-emerald-50';
    return 'border-gray-200';
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-teal-500" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-400 text-sm ${className}`}>
        <HistoryIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
        Sin historial registrado todavía.
      </div>
    );
  }

  return (
    <ol className={`space-y-3 ${className}`}>
      {logs.map(l => {
        const label = labelForRow(l);
        const meta  = renderMeta(l);
        const actorLabel = l.userName || l.actor || 'Sistema';
        return (
          <li key={l.id} className={`border-l-2 pl-3 pb-2 ${badgeClass(l)}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                {fmtDate(l.createdAt)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {actorLabel}
              {meta && <span className="text-gray-400"> · {meta}</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
