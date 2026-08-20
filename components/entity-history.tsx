'use client';

import { useEffect, useState } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

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
export function EntityHistory({ docId, encf }: Props) {
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
      // Motivo del rechazo DGII (o cualquier mensaje guardado en el evento).
      if (m.mensajes) {
        const raw = Array.isArray(m.mensajes)
          ? m.mensajes
          : (typeof m.mensajes === 'object' ? Object.values(m.mensajes as Record<string, unknown>) : [m.mensajes]);
        const first = raw
          .map((x) => typeof x === 'string' ? x : (x && typeof x === 'object' ? String((x as Record<string, unknown>).valor ?? (x as Record<string, unknown>).mensaje ?? '') : ''))
          .filter(Boolean)[0];
        if (first) parts.push(String(first).slice(0, 100));
      }
      if (m.motivo)     parts.push(String(m.motivo).slice(0, 80));
      return parts.length ? parts.join(' · ') : null;
    } catch {
      return null;
    }
  }

  // Badge visual por tipo de fuente/operación → color de borde izquierdo + fondo
  function badgeStyle(log: LogRow): { borderColor: string; bgcolor: string } {
    if (log._source === 'row_audit') {
      if (log._operation === 'I') return { borderColor: '#6ee7b7', bgcolor: '#ecfdf5' }; // emerald
      if (log._operation === 'U') return { borderColor: '#bae6fd', bgcolor: '#f0f9ff' }; // sky
      if (log._operation === 'D') return { borderColor: '#fecaca', bgcolor: '#fef2f2' }; // red
      return { borderColor: '#e5e7eb', bgcolor: 'transparent' };
    }
    if (log.action === 'ECF_SEND' || log.action === 'ECF_ACEPTADO') return { borderColor: '#a5b4f9', bgcolor: '#eef2fe' }; // teal
    if (log.action === 'ECF_RECHAZADO' || log.action === 'ECF_ANULADO') return { borderColor: '#fecaca', bgcolor: '#fef2f2' }; // red
    if (log.action === 'PAGO_REGISTRADO') return { borderColor: '#a7f3d0', bgcolor: '#ecfdf5' }; // emerald
    return { borderColor: '#e5e7eb', bgcolor: 'transparent' };
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={20} sx={{ color: '#5b73ec' }} />
      </Box>
    );
  }

  if (logs.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: '#9ca3af', fontSize: '0.875rem' }}>
        <HistoryIcon style={{ width: 32, height: 32, display: 'block', margin: '0 auto 8px', opacity: 0.4 }} />
        Sin historial registrado todavía.
      </Box>
    );
  }

  return (
    <Box
      component="ol"
      sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}
    >
      {logs.map(l => {
        const label = labelForRow(l);
        const meta  = renderMeta(l);
        const actorLabel = l.userName || l.actor || 'Sistema';
        const badge = badgeStyle(l);
        return (
          <Box
            component="li"
            key={l.id}
            sx={{ borderLeft: '2px solid', borderColor: badge.borderColor, bgcolor: badge.bgcolor, pl: 1.5, pb: 1 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>{label}</Typography>
              <Typography
                component="span"
                sx={{ fontSize: '10px', color: '#9ca3af', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {fmtDate(l.createdAt)}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.75rem', color: '#6b7280', mt: 0.25 }}>
              {actorLabel}
              {meta && <Box component="span" sx={{ color: '#9ca3af' }}> · {meta}</Box>}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
