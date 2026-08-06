'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, Download, Mail, Ban, FileText, Upload, Eye, Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { ImportModal } from '@/components/import-modal';
import { fmtDOP, fmtFechaCorta, fmtFechaRD, fmtHora, diasVencido } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { calcularEstadoPago } from '@/lib/facturas/estado-pago-calc';
import MuiButton from '@mui/material/Button';
import MuiDialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MuiTextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// ─── Constantes ───────────────────────────────────────────────────────────────

const ESTADOS = [
  { value: 'BORRADOR',             label: 'Sin comprobante' },
  { value: 'EN_PROCESO',           label: 'En proceso' },
  { value: 'ACEPTADO',             label: 'Aceptado' },
  { value: 'ACEPTADO_CONDICIONAL', label: 'Aceptado condicional' },
  { value: 'RECHAZADO',            label: 'Rechazado' },
  { value: 'ANULADO',              label: 'Anulado' },
  { value: 'HISTORICA',            label: 'Histórica (Alegra)' },
];

// Etiqueta legible para el badge de estado DGII
const ESTADO_LABEL: Record<string, string> = {
  ACEPTADO:             'Aceptado',
  ACEPTADO_CONDICIONAL: 'Cond.',
  EN_PROCESO:           'En proceso',
  RECHAZADO:            'Rechazado',
  BORRADOR:             'Sin comprobante',
  ANULADO:              'Anulado',
  HISTORICA:            'Histórica',
};

const TIPO_LABELS: Record<string, string> = {
  '31': 'Créd. Fiscal', '32': 'Consumo', '33': 'Nota Débito',
  '34': 'Nota Crédito', '41': 'Compras', '43': 'Gastos Men.',
  '44': 'Reg. Único', '45': 'Gub.', '46': 'Export.', '47': 'Otros',
  '00': 'Histórica',
  'sin-ncf': '—',
};
const TIPO_PAGO_LABEL: Record<number, string> = {
  1: 'Contado', 2: 'Crédito', 3: 'Gratuito', 4: 'Uso o consumo',
};

/** Devuelve true si el encf es un e-CF real de DGII (E31..., E32..., etc.) */
function isECFReal(encf: string): boolean {
  return /^E\d{12}$/.test(encf);
}

// Color del TEXTO del comprobante según estado DGII (como sx color value)
const ESTADO_COLOR: Record<string, { color: string; textDecoration?: string }> = {
  ACEPTADO:             { color: '#065f46' },
  ACEPTADO_CONDICIONAL: { color: '#92400e' },
  EN_PROCESO:           { color: '#0369a1' },
  RECHAZADO:            { color: '#991b1b' },
  BORRADOR:             { color: '#9ca3af' },
  ANULADO:              { color: '#9ca3af', textDecoration: 'line-through' },
  HISTORICA:            { color: '#4f46e5' },
};

/**
 * Formato compacto del e-NCF: E310000000252 → "E31-252".
 * Toma el prefijo Exx (tipo) y el resto sin ceros a la izquierda.
 * Borrador (BOR-…) / Histórica / sin-ncf → devuelve null (mostrar fallback).
 */
function fmtEncf(encf: string): string | null {
  if (!isECFReal(encf)) return null;
  const prefijo = encf.slice(0, 3);                 // E31
  const num     = encf.slice(3).replace(/^0+/, '') || '0'; // 0000000252 → 252
  return `${prefijo}-${num}`;
}

interface Doc {
  id: number; encf: string; codigo: string | null; tipoEcf: string; estado: string;
  estadoPago: string;
  rncComprador: string | null;
  razonSocialComprador: string | null; emailComprador: string | null;
  montoTotal: number; totalItbis: number;
  tipoPago: number | null;
  fechaEmision: string;
  fechaLimitePago: string | null;
  pagado: number;
  createdAt: string;
  createdByName?: string | null;
  dependienteNombre?: string | null;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function FacturasPage() {
  const { can, isLoading: permLoading } = usePermissions();

  const [docs, setDocs]       = useState<Doc[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [emailModal, setEmailModal] = useState<{ id: number; email: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // Maestros de factura (Plan A) → filtros dinámicos por valor.
  const [facturaMaestros, setFacturaMaestros] = useState<
    { id: number; nombre: string; valores: { id: number; valor: string }[] }[]
  >([]);
  useEffect(() => {
    fetch('/api/facturas/maestros')
      .then(r => r.json())
      .then(d => setFacturaMaestros(d.maestros ?? []))
      .catch(() => {});
  }, []);
  const limit = 20;

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [filterValues]);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({
      limit: String(limit),
      offset: String((page - 1) * limit),
      ...(filterValues.q     && { search: filterValues.q }),
      ...(filterValues.estado && { estado: filterValues.estado }),
      ...(filterValues.fecha_desde && { desde: filterValues.fecha_desde }),
      ...(filterValues.fecha_hasta && { hasta: filterValues.fecha_hasta }),
      ...(filterValues.conNcs === '1' && { conNcs: '1' }),
    });
    // Filtros dinámicos por maestro (claves 'm_<maestroId>' → valorId).
    for (const [k, v] of Object.entries(filterValues)) {
      if (k.startsWith('m_') && v) sp.append('maestroValorId', v);
    }
    const res = await fetch(`/api/facturas?${sp}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setDocs(data.docs ?? data);
      setTotal(data.total ?? data.length);
    }
    setLoading(false);
  }, [filterValues, page]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  async function bulkAnular(ids: (string | number)[]) {
    if (!confirm(`¿Anular ${ids.length} comprobante(s)?`)) return;
    const res = await fetch('/api/facturas/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'anular', ids }),
    });
    if (res.ok) {
      toast.success(`${ids.length} comprobante(s) anulados`);
      fetchDocs();
    } else {
      toast.error('Error al anular');
    }
  }

  function exportCsv() {
    const sp = new URLSearchParams({
      ...(filterValues.estado && { estado: filterValues.estado }),
      ...(filterValues.fecha_desde && { desde: filterValues.fecha_desde }),
      ...(filterValues.fecha_hasta && { hasta: filterValues.fecha_hasta }),
    });
    window.location.href = `/api/facturas/export?${sp}`;
  }

  async function sendEmail() {
    if (!emailModal) return;
    setEmailLoading(true);
    const res = await fetch(`/api/facturas/${emailModal.id}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailModal.email }),
    });
    if (res.ok) {
      toast.success('Factura enviada por email');
      setEmailModal(null);
    } else {
      const d = await res.json();
      toast.error(d.error ?? 'Error enviando email');
    }
    setEmailLoading(false);
  }

  // ─── Columns ────────────────────────────────────────────────────────────────

  const columns: DataTableColumn<Doc>[] = [
    {
      id: 'codigo',
      header: 'Código',
      sortable: true,
      sortAccessor: doc => doc.codigo ?? '',
      render: doc => (
        <Link
          href={`/dashboard/facturas/${doc.id}`}
          style={{ textDecoration: 'none' }}
          title={doc.codigo ?? `#${doc.id}`}
        >
          <Typography
            component="span"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#374151',
              display: 'block',
              lineHeight: 1.25,
              fontVariantNumeric: 'tabular-nums',
              '&:hover': { color: '#2a45c4', textDecoration: 'underline' },
            }}
          >
            {doc.codigo ?? `#${doc.id}`}
          </Typography>
        </Link>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      sortable: true,
      sortAccessor: doc => doc.razonSocialComprador ?? '',
      render: doc => (
        <Box sx={{ maxWidth: 200, minWidth: 0 }}>
          <Typography
            title={doc.razonSocialComprador ?? 'Consumidor Final'}
            sx={{
              fontSize: '0.875rem',
              color: doc.razonSocialComprador ? '#111827' : '#9ca3af',
              fontWeight: doc.razonSocialComprador ? 500 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.25,
            }}
          >
            {doc.razonSocialComprador ?? 'Consumidor Final'}
          </Typography>
          {doc.rncComprador && (
            <Typography
              sx={{
                fontSize: '0.6875rem',
                color: '#9ca3af',
                fontFamily: 'monospace',
                mt: '2px',
                lineHeight: 1.25,
              }}
            >
              {doc.rncComprador}
            </Typography>
          )}
          {doc.dependienteNombre && (
            <Typography
              title={`Beneficiario: ${doc.dependienteNombre}`}
              sx={{
                fontSize: '0.6875rem',
                color: '#9ca3af',
                mt: '2px',
                lineHeight: 1.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Benef.: {doc.dependienteNombre}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'fechaEmision',
      header: 'Emisión',
      visibleAt: 'md',
      sortable: true,
      sortAccessor: doc => doc.createdAt,
      render: doc => (
        <Box component="span" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
          <Typography component="span" sx={{ fontSize: '0.75rem', color: '#4b5563', display: 'block' }}>{fmtFechaRD(doc.createdAt)}</Typography>
          {doc.createdAt && (
            <Typography component="span" sx={{ fontSize: '0.6875rem', color: '#9ca3af', display: 'block' }}>{fmtHora(doc.createdAt)}</Typography>
          )}
        </Box>
      ),
    },
    {
      id: 'pagoVence',
      header: 'Vencimiento',
      visibleAt: 'lg',
      render: doc => {
        const esCredito = doc.tipoPago === 2;
        const dias = diasVencido(doc.fechaLimitePago);
        const saldo = doc.montoTotal - (doc.pagado ?? 0);
        const vencida = esCredito && saldo > 0 && dias > 0 && ['ACEPTADO','ACEPTADO_CONDICIONAL','EN_PROCESO'].includes(doc.estado);
        return (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: '0.75rem',
                fontWeight: 500,
                lineHeight: 1.25,
                color: esCredito ? '#92400e' : '#6b7280',
              }}
            >
              {TIPO_PAGO_LABEL[doc.tipoPago ?? 1] ?? '—'}
            </Typography>
            {esCredito && doc.fechaLimitePago && (
              <Typography
                sx={{
                  fontSize: '0.6875rem',
                  mt: '2px',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                  color: vencida ? '#dc2626' : '#9ca3af',
                  fontWeight: vencida ? 600 : 400,
                }}
              >
                {fmtFechaCorta(doc.fechaLimitePago)}
                {vencida && (
                  <Typography component="span" sx={{ ml: '4px', color: '#ef4444', fontSize: '0.6875rem' }}>
                    · {dias}d
                  </Typography>
                )}
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      id: 'subtotal',
      header: 'Subtotal',
      visibleAt: 'xl',
      align: 'right',
      sortable: true,
      sortAccessor: doc => doc.montoTotal - doc.totalItbis,
      render: doc => (
        <Typography
          component="span"
          sx={{
            fontSize: '0.75rem',
            color: '#6b7280',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtDOP(doc.montoTotal - doc.totalItbis)}
        </Typography>
      ),
    },
    {
      id: 'itbis',
      header: 'ITBIS',
      visibleAt: 'xl',
      align: 'right',
      render: doc => (
        <Typography
          component="span"
          sx={{
            fontSize: '0.75rem',
            color: doc.totalItbis > 0 ? '#6b7280' : '#d1d5db',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {doc.totalItbis > 0 ? fmtDOP(doc.totalItbis) : '—'}
        </Typography>
      ),
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      sortable: true,
      sortAccessor: doc => doc.montoTotal,
      render: doc => (
        <Typography
          component="span"
          sx={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: '#111827',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtDOP(doc.montoTotal)}
        </Typography>
      ),
    },
    {
      id: 'saldo',
      header: 'Cobro',
      visibleAt: 'lg',
      align: 'center',
      // Deriva el estado EN VIVO desde `pagado` (suma del ledger + fallback
      // inline), con la misma fn que el detalle. Antes leía la columna
      // estado_pago persistida y podía quedar stale (listado "Pendiente" vs
      // detalle "Pagada") si algún path no la recalculaba.
      render: doc => {
        const pagado  = doc.pagado ?? 0;
        const ep      = calcularEstadoPago({
          estado: doc.estado, tipoPago: doc.tipoPago, montoTotal: doc.montoTotal, totalPagado: pagado,
        });
        const saldo   = doc.montoTotal - pagado;
        const esCred  = doc.tipoPago === 2;
        const dias    = diasVencido(doc.fechaLimitePago);
        if (ep === 'GRATUITA') return <Badge color="gray">Gratuita</Badge>;
        if (ep === 'USO')      return <Badge color="gray">Uso</Badge>;
        if (ep === 'PAGADA')   return <Badge color="green">Pagada</Badge>;
        if (ep === 'PARCIAL')  return <Badge color="amber" title={`Falta ${fmtDOP(saldo)}`}>Parcial</Badge>;
        if (ep === 'PENDIENTE' && esCred && dias > 0) {
          return <Badge color="red" title={`Vencida hace ${dias}d`}>Vencida</Badge>;
        }
        if (ep === 'PENDIENTE') return <Badge color="amber">Pendiente</Badge>;
        if (ep === 'ANULADA')   return <Badge color="gray">—</Badge>;
        return <Badge color="red" title="Sin estado">—</Badge>;
      },
    },
    {
      id: 'createdBy',
      header: 'Creado por',
      visibleAt: 'xl',
      render: doc => (
        <Typography
          component="span"
          title={doc.createdByName ?? undefined}
          sx={{
            fontSize: '0.75rem',
            color: '#6b7280',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 120,
            display: 'block',
          }}
        >
          {doc.createdByName ?? '—'}
        </Typography>
      ),
    },
    {
      // Comprobante al final. Texto coloreado según estado DGII. Formato E31-252.
      id: 'encf',
      header: 'Comprobante',
      align: 'right',
      sortable: true,
      sortAccessor: doc => doc.encf,
      render: doc => {
        const compacto  = fmtEncf(doc.encf);
        const colorSx   = ESTADO_COLOR[doc.estado] ?? { color: '#9ca3af' };
        return (
          <Link
            href={`/dashboard/facturas/${doc.id}`}
            style={{ textDecoration: 'none' }}
            title={`${doc.encf && !doc.encf.startsWith('BOR-') ? doc.encf : 'Sin comprobante'} · ${ESTADO_LABEL[doc.estado] ?? doc.estado}`}
          >
            <Typography
              component="span"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                fontWeight: 600,
                lineHeight: 1.25,
                display: 'block',
                whiteSpace: 'nowrap',
                '&:hover': { textDecoration: 'underline' },
                ...colorSx,
              }}
            >
              {compacto ?? (doc.encf && !doc.encf.startsWith('BOR-') ? doc.encf : '—')}
            </Typography>
          </Link>
        );
      },
    },
  ];

  const rowActions = (doc: Doc): RowAction[] => {
    // "Ver" inline (👁) antes de los 3 puntos — abre el detalle.
    const ver: RowAction = { icon: Eye, title: 'Ver detalle', href: `/dashboard/facturas/${doc.id}`, primary: true };
    // Recibo POS: solo para ventas sin-ncf (ticket de mostrador). Reabre el recibo 80mm.
    const recibo: RowAction[] = doc.tipoEcf === 'sin-ncf'
      ? [{ icon: Printer, title: 'Reimprimir recibo', onClick: () => window.open(`/pos-ticket/${doc.id}`, '_blank', 'width=420,height=680') }]
      : [];
    if (doc.estado === 'BORRADOR') {
      return [
        ver,
        { icon: FileText, title: 'Continuar edición', href: `/dashboard/facturas/${doc.id}/editar` },
        ...recibo,
      ];
    }
    return [
      ver,
      { icon: FileText, title: 'Ver PDF', href: `/api/pdf/factura/${doc.codigo ?? doc.id}` },
      { icon: Mail,     title: 'Enviar por email', onClick: () => setEmailModal({ id: doc.id, email: doc.emailComprador ?? '' }) },
      ...recibo,
    ];
  };

  // Derivar bulk/header actions según permisos (default-deny mientras carga)
  const canAnular   = !permLoading && can('facturas:anular');
  const canExportar = !permLoading && can('facturas:exportar');
  const canCrear    = !permLoading && can('facturas:crear');

  return (
    <Box component="section" sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <DataTable<Doc>
        data={docs}
        loading={loading}
        columns={columns}
        title="Facturas"
        filters={[
          { type: 'search',    id: 'q',      placeholder: 'Buscar por e-NCF o cliente…' },
          { type: 'select',    id: 'estado', label: 'Todos los estados', options: ESTADOS },
          { type: 'daterange', id: 'fecha',  label: 'Fechas' },
          // NCA-22: filtro "Con NCs / débitos"
          {
            type: 'select',
            id: 'conNcs',
            label: 'Con NCs',
            options: [
              { value: '',  label: 'Todas' },
              { value: '1', label: 'Con NCs asociadas' },
            ],
          },
          // Filtros dinámicos por maestro de factura (Plan A).
          ...facturaMaestros
            .filter(m => m.valores.length > 0)
            .map(m => ({
              type: 'select' as const,
              id: `m_${m.id}`,
              label: m.nombre,
              options: [
                { value: '', label: `${m.nombre}: todos` },
                ...m.valores.map(v => ({ value: String(v.id), label: v.valor })),
              ],
            })),
        ]}
        filterValues={filterValues}
        onFilterChange={setFilterValues}
        bulkActions={[
          ...(canAnular ? [{ label: 'Anular seleccionados', icon: Ban, variant: 'danger' as const, onClick: (ids: (string | number)[]) => bulkAnular(ids) }] : []),
        ]}
        rowActions={rowActions}
        pagination={{
          page,
          pageSize: limit,
          total,
          onPageChange: setPage,
        }}
        emptyState={{
          icon: FileText,
          title: 'No se encontraron comprobantes',
          cta: canCrear ? (
            <Link href="/dashboard/facturas/nueva" style={{ textDecoration: 'none' }}>
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.875rem',
                  color: '#3658e1',
                  '&:hover': { textDecoration: 'underline', color: '#2a45c4' },
                }}
              >
                <Plus style={{ width: 16, height: 16 }} /> Emitir primer comprobante
              </Box>
            </Link>
          ) : undefined,
        }}
        headerActions={
          <>
            {canCrear && (
              <MuiButton
                variant="outlined"
                size="small"
                disableElevation
                onClick={() => setShowImport(true)}
                startIcon={<Upload style={{ width: 16, height: 16 }} />}
                sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#e5e7eb', color: '#6b7280' }}
              >
                Importar de Alegra
              </MuiButton>
            )}
            {canExportar && (
              <MuiButton
                variant="outlined"
                size="small"
                disableElevation
                onClick={exportCsv}
                startIcon={<Download style={{ width: 16, height: 16 }} />}
                sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#e5e7eb', color: '#6b7280' }}
              >
                CSV
              </MuiButton>
            )}
            {canCrear && (
              <Link href="/dashboard/facturas/nueva" style={{ textDecoration: 'none' }}>
                <MuiButton
                  variant="contained"
                  size="small"
                  disableElevation
                  startIcon={<Plus style={{ width: 16, height: 16 }} />}
                  sx={{
                    borderRadius: '8px',
                    textTransform: 'none',
                    fontWeight: 600,
                    bgcolor: '#3658e1',
                    '&:hover': { bgcolor: '#2a45c4' },
                  }}
                >
                  Nueva Factura
                </MuiButton>
              </Link>
            )}
          </>
        }
      />

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        endpoint="/api/import/facturas"
        title="Importar facturas de Alegra"
        helpText="CSV de Alegra (Facturas). Se agrupan por código, no van a DGII (estado Histórica). Crea clientes y productos faltantes. Dedup por código."
        columns={[
          { key: 'codigo',        label: 'Código' },
          { key: 'fecha',         label: 'Fecha' },
          { key: 'clienteNombre', label: 'Cliente' },
          { key: 'clienteRnc',    label: 'RNC' },
          { key: 'lineasCount',   label: 'Líneas' },
          { key: 'montoTotal',    label: 'Total (¢)' },
          { key: 'cobrada',       label: 'Cobro', format: v => v ? 'Cobrada' : 'Pendiente' },
        ]}
        onDone={() => fetchDocs()}
      />

      {/* Email modal */}
      <MuiDialog
        open={!!emailModal}
        onClose={() => setEmailModal(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px' } } as object }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Enviar factura por email</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <MuiTextField
            type="email"
            label="Email del destinatario"
            value={emailModal?.email ?? ''}
            onChange={e => setEmailModal(m => m ? { ...m, email: e.target.value } : m)}
            placeholder="cliente@empresa.com"
            fullWidth
            size="small"
            sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <MuiButton
            variant="outlined"
            disableElevation
            onClick={() => setEmailModal(null)}
            sx={{ borderRadius: '8px', textTransform: 'none' }}
          >
            Cancelar
          </MuiButton>
          <MuiButton
            variant="contained"
            disableElevation
            onClick={sendEmail}
            disabled={emailLoading || !emailModal?.email}
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              bgcolor: '#3658e1',
              '&:hover': { bgcolor: '#2a45c4' },
            }}
          >
            {emailLoading ? 'Enviando...' : 'Enviar'}
          </MuiButton>
        </DialogActions>
      </MuiDialog>
    </Box>
  );
}

// ─── Badge helper (uso interno a esta página) ─────────────────────────────────

const BADGE_SX: Record<string, object> = {
  green: { bgcolor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' },
  amber: { bgcolor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
  red:   { bgcolor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
  gray:  { bgcolor: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' },
};

function Badge({
  color,
  title,
  children,
}: {
  color: keyof typeof BADGE_SX;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Chip
      label={children}
      size="small"
      title={title}
      sx={{
        height: 20,
        borderRadius: '10px',
        fontSize: '0.6875rem',
        fontWeight: 600,
        '& .MuiChip-label': { px: 1, py: '1px' },
        ...BADGE_SX[color],
      }}
    />
  );
}
