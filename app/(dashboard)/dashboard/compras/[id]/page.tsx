'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import { ArrowLeft, Copy, Check, ChevronDown, ChevronRight, AlertTriangle, Loader2, PackagePlus } from 'lucide-react';
import { fmtFechaCorta } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useVolver } from '@/lib/hooks/useVolver';
import type { RecepcionEcfDto } from '@/lib/ecf-api/client';
import ModalRegistrarCompra from '../_modal-registrar-compra';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ESTADO_BADGE: Record<string, { bgcolor: string; color: string; border: string }> = {
  ACEPTADO:             { bgcolor: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  ACEPTADO_CONDICIONAL: { bgcolor: '#fffbeb', color: '#92400e', border: '#fde68a' },
  RECHAZADO:            { bgcolor: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  RECIBIDO:             { bgcolor: '#f0f9ff', color: '#075985', border: '#bae6fd' },
  PENDIENTE:            { bgcolor: '#f9fafb', color: '#4b5563', border: '#d1d5db' },
};

const TIPO_LABELS: Record<string, string> = {
  '31': 'Crédito Fiscal', '32': 'Consumo', '33': 'Nota Débito',
  '34': 'Nota Crédito',   '41': 'Compras', '43': 'Gastos Menores',
  '44': 'Régimen Único',  '45': 'Gubernamental', '46': 'Exportación', '47': 'Otros',
};

function tipoCode(item: RecepcionEcfDto): string {
  return (item.tipoECF || item.tipoComprobante || item.eNcf?.match(/^E(\d{2})/)?.[1] || '') as string;
}
function tipoLabel(item: RecepcionEcfDto): string {
  const c = tipoCode(item);
  return c ? `${TIPO_LABELS[c] ?? `Tipo e${c}`}${c ? ` (e${c})` : ''}` : '—';
}

function fmtMonto(item: RecepcionEcfDto): string {
  const xml = item.xmlFirmado ?? item.xmlOriginal;
  const m = xml?.match(/<MontoTotal>\s*([\d.]+)\s*<\/MontoTotal>/i);
  if (!m) return '—';
  return `RD$${Number(m[1]).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const fetcher = (url: string) => fetch(url).then(r => r.ok ? r.json() : r.json().then((d: unknown) => Promise.reject(d)));

// ─── XML section colapsable ────────────────────────────────────────────────────

function XmlSection({ title, xml }: { title: string; xml?: string | null }) {
  const [open, setOpen]     = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!xml) return;
    navigator.clipboard.writeText(xml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      <Box
        component="button"
        onClick={() => setOpen(o => !o)}
        sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, bgcolor: 'transparent', border: 'none', cursor: 'pointer', '&:hover': { bgcolor: '#f9fafb' }, transition: 'background 0.1s' }}
      >
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>{title}</Typography>
        {open ? <ChevronDown size={16} color="#9ca3af" /> : <ChevronRight size={16} color="#9ca3af" />}
      </Box>

      <Collapse in={open}>
        <Box sx={{ borderTop: '1px solid #f3f4f6' }}>
          {xml ? (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 2, py: 1, borderBottom: '1px solid #f3f4f6', bgcolor: '#f9fafb' }}>
                <Box
                  component="button"
                  onClick={handleCopy}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.75rem', color: '#4b5563', bgcolor: 'transparent', border: 'none', cursor: 'pointer', '&:hover': { color: '#111827' } }}
                >
                  {copied
                    ? <><Check size={14} color="#16a34a" /> Copiado</>
                    : <><Copy size={14} /> Copiar</>
                  }
                </Box>
              </Box>
              <Box component="pre" sx={{ p: 2, fontSize: '0.6875rem', fontFamily: 'monospace', color: '#374151', overflowX: 'auto', maxHeight: 320, bgcolor: '#f9fafb', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', m: 0 }}>
                {xml}
              </Box>
            </>
          ) : (
            <Typography sx={{ px: 2, py: 2, fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>No disponible</Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─── Fila de detalle ──────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, py: 1.5, borderBottom: '1px solid #f3f4f6', '&:last-child': { borderBottom: 'none' } }}>
      <Typography component="dt" sx={{ width: 144, flexShrink: 0, fontSize: '0.75rem', fontWeight: 500, color: '#6b7280' }}>{label}</Typography>
      <Box component="dd" sx={{ flex: 1, fontSize: '0.875rem', color: '#111827', m: 0 }}>{value}</Box>
    </Box>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CompraDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { can, isLoading: permLoading } = usePermissions();
  const volver = useVolver('/dashboard/compras');
  const [showEntrada, setShowEntrada] = useState(false);

  const { data, isLoading, error } = useSWR<RecepcionEcfDto>(
    !permLoading && can('compras:ver') && id ? `/api/compras/${id}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (permLoading || isLoading) {
    return (
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <CircularProgress size={32} sx={{ color: '#3658e1' }} />
      </Box>
    );
  }

  if (!permLoading && !can('compras:ver')) {
    return (
      <Box sx={{ p: 3 }}>
        <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', p: 5, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280' }}>No tienes permiso para ver esta sección.</Typography>
        </Box>
      </Box>
    );
  }

  if (error || !data) {
    const msg = (error as { error?: string } | null)?.error ?? 'No se pudo cargar el detalle.';
    return (
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Button onClick={volver} variant="text" startIcon={<ArrowLeft size={16} />} sx={{ alignSelf: 'flex-start', textTransform: 'none', color: '#6b7280', '&:hover': { color: '#374151' } }}>
          Volver a Compras
        </Button>
        <Alert severity="error" icon={<AlertTriangle size={16} />} sx={{ borderRadius: '8px' }}>{msg}</Alert>
      </Box>
    );
  }

  const estado = data.estado ?? 'PENDIENTE';
  const badge  = ESTADO_BADGE[estado] ?? { bgcolor: '#f9fafb', color: '#4b5563', border: '#d1d5db' };

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 720 }}>
      {/* Back */}
      <Button onClick={volver} variant="text" startIcon={<ArrowLeft size={16} />} sx={{ alignSelf: 'flex-start', textTransform: 'none', color: '#6b7280', '&:hover': { color: '#374151' } }}>
        Volver a Compras
      </Button>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{data.eNcf}</Typography>
            <Chip
              label={estado}
              size="small"
              sx={{ bgcolor: badge.bgcolor, color: badge.color, border: `1px solid ${badge.border}`, fontSize: '0.6875rem', height: 22, fontWeight: 500 }}
            />
          </Box>
          <Typography sx={{ fontSize: '0.875rem', color: '#6b7280', mt: 0.25 }}>{tipoLabel(data)}</Typography>
        </Box>
        {can('productos:gestionar') && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => setShowEntrada(true)}
            startIcon={<PackagePlus style={{ width: 16, height: 16 }} />}
            sx={{ textTransform: 'none', borderRadius: '8px' }}
          >
            Registrar entrada
          </Button>
        )}
      </Box>

      <ModalRegistrarCompra
        open={showEntrada}
        onClose={() => setShowEntrada(false)}
        onSuccess={() => {}}
        prefill={{
          proveedorRnc:   data.rncEmisor ?? data.rnc ?? undefined,
          referenciaEncf: data.eNcf ?? undefined,
        }}
      />

      {/* Datos principales */}
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f3f4f6', bgcolor: '#f9fafb' }}>
          <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Detalle</Typography>
        </Box>
        <Box component="dl" sx={{ px: 2, m: 0 }}>
          <DetailRow label="Emisor (RNC)" value={<Box component="span" sx={{ fontFamily: 'monospace' }}>{data.rncEmisor ?? data.rnc}</Box>} />
          <DetailRow label="e-NCF"        value={<Box component="span" sx={{ fontFamily: 'monospace' }}>{data.eNcf}</Box>} />
          <DetailRow label="Tipo"         value={tipoLabel(data)} />
          <DetailRow label="Fecha recepción" value={fmtFechaCorta(data.fechaRecepcion ?? data.createdAt)} />
          <DetailRow label="Estado"       value={
            <Chip label={estado} size="small" sx={{ bgcolor: badge.bgcolor, color: badge.color, border: `1px solid ${badge.border}`, fontSize: '0.6875rem', height: 22 }} />
          } />
          {typeof data.firmaValida === 'boolean' && (
            <DetailRow label="Firma" value={
              data.firmaValida
                ? <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: '#16a34a' }}><Check size={14} /> Válida</Box>
                : <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: '#dc2626' }}><AlertTriangle size={14} /> Inválida</Box>
            } />
          )}
          <DetailRow label="Monto" value={<Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{fmtMonto(data)}</Typography>} />
        </Box>
      </Box>

      {/* XML emisor */}
      <XmlSection title="XML del emisor" xml={data.xmlFirmado ?? data.xmlOriginal} />

      {/* ARECF */}
      <XmlSection title="ARECF (nuestra respuesta)" xml={data.arecfXml} />
    </Box>
  );
}
