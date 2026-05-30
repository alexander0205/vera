'use client';

import { useEffect, useState } from 'react';
import { Loader2, History as HistoryIcon } from 'lucide-react';

interface LogRow {
  id:        number;
  action:    string;
  resource:  string | null;
  actor:     string;
  userName:  string | null;
  metadata:  string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface Props {
  docId?:  number;
  encf?:   string;
  className?: string;
}

const ACTION_LABEL: Record<string, string> = {
  ECF_SEND:           'Enviado a DGII',
  ECF_ACEPTADO:       'Aceptado por DGII',
  ECF_RECHAZADO:      'Rechazado por DGII',
  ECF_ANULADO:        'Anulado',
  PAGO_REGISTRADO:    'Pago registrado',
  CERT_UPLOAD:        'Certificado cargado',
  CERT_DELETE:        'Certificado eliminado',
};

/**
 * Historial de eventos de una entidad — lee audit_logs filtrado por resource.
 * Usa para mostrar la pestaña "Historia" en el detalle de factura.
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
      return d.toLocaleString('es-DO', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  function renderMeta(metaJson: string | null): string | null {
    if (!metaJson) return null;
    try {
      const m = JSON.parse(metaJson) as Record<string, unknown>;
      const parts: string[] = [];
      if (m.tipoEcf)      parts.push(`tipo ${m.tipoEcf}`);
      if (m.montoTotal)   parts.push(`RD$ ${Number(m.montoTotal).toFixed(2)}`);
      if (m.trackId)      parts.push(`track ${String(m.trackId).slice(0, 12)}…`);
      if (m.via)          parts.push(`vía ${m.via}`);
      return parts.length ? parts.join(' · ') : null;
    } catch {
      return null;
    }
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
        const label = ACTION_LABEL[l.action] ?? l.action;
        const meta  = renderMeta(l.metadata);
        return (
          <li key={l.id} className="border-l-2 border-teal-200 pl-3 pb-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtDate(l.createdAt)}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {l.userName || l.actor}
              {meta && <span className="text-gray-400"> · {meta}</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
