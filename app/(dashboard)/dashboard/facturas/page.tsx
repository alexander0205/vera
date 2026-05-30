'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, Download, Mail, Ban, FileText, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { ImportModal } from '@/components/import-modal';
import { fmtDOP, fmtFechaCorta, diasVencido } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';

// ─── Constantes ───────────────────────────────────────────────────────────────

const ESTADOS = [
  { value: 'BORRADOR',             label: 'Borrador' },
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
  BORRADOR:             'Borrador',
  ANULADO:              'Anulado',
  HISTORICA:            'Histórica',
};

const ESTADO_BADGE: Record<string, string> = {
  ACEPTADO:             'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  ACEPTADO_CONDICIONAL: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  EN_PROCESO:           'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  RECHAZADO:            'bg-red-50 text-red-700 ring-1 ring-red-200',
  BORRADOR:             'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
  ANULADO:              'bg-gray-100 text-gray-400 ring-1 ring-gray-200 line-through',
  HISTORICA:            'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200',
};
const TIPO_LABELS: Record<string, string> = {
  '31': 'Créd. Fiscal', '32': 'Consumo', '33': 'Nota Débito',
  '34': 'Nota Crédito', '41': 'Compras', '43': 'Gastos Men.',
  '44': 'Reg. Único', '45': 'Gub.', '46': 'Export.', '47': 'Otros',
  '00': 'Histórica',
};
const TIPO_PAGO_LABEL: Record<number, string> = {
  1: 'Contado', 2: 'Crédito', 3: 'Gratuito', 4: 'Uso o consumo',
};

/** Devuelve true si el encf es un e-CF real de DGII (E31..., E32..., etc.) */
function isECFReal(encf: string): boolean {
  return /^E\d{12}$/.test(encf);
}

interface Doc {
  id: number; encf: string; tipoEcf: string; estado: string;
  rncComprador: string | null;
  razonSocialComprador: string | null; emailComprador: string | null;
  montoTotal: number; totalItbis: number;
  tipoPago: number | null;
  fechaEmision: string;
  fechaLimitePago: string | null;
  pagado: number;
  createdAt: string;
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
  const limit = 50;

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
      id: 'encf',
      header: 'Comprobante',
      sortable: true,
      render: doc => {
        const esReal = isECFReal(doc.encf);
        const esBorrador = doc.estado === 'BORRADOR';
        return (
          <div className="min-w-0">
            <Link
              href={`/dashboard/facturas/${doc.id}`}
              className={`font-mono text-xs font-semibold hover:underline leading-tight block ${
                esReal ? 'text-teal-700' : esBorrador ? 'text-amber-700' : 'text-gray-500'
              }`}
              title={doc.encf}
            >
              {esReal
                /* e-CF real: separar en grupos legibles E31 · 0000000015 */
                ? <>{doc.encf.slice(0, 3)}<span className="text-teal-400 mx-0.5">·</span>{doc.encf.slice(3)}</>
                /* Borrador / Histórica: mostrar tal cual */
                : doc.encf
              }
            </Link>
            <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
              {TIPO_LABELS[doc.tipoEcf] ?? `Tipo ${doc.tipoEcf}`}
            </p>
          </div>
        );
      },
    },
    {
      id: 'cliente',
      header: 'Cliente',
      sortable: true,
      sortAccessor: doc => doc.razonSocialComprador ?? '',
      render: doc => (
        <div className="max-w-[200px] min-w-0">
          <p
            className="text-sm text-gray-900 truncate font-medium leading-tight"
            title={doc.razonSocialComprador ?? 'Consumidor Final'}
          >
            {doc.razonSocialComprador ?? <span className="text-gray-400 font-normal">Consumidor Final</span>}
          </p>
          {doc.rncComprador
            ? <p className="text-[11px] text-gray-400 font-mono mt-0.5 leading-tight">{doc.rncComprador}</p>
            : <p className="text-[11px] text-gray-300 mt-0.5 leading-tight">Sin RNC</p>
          }
        </div>
      ),
    },
    {
      id: 'fechaEmision',
      header: 'Emisión',
      visibleAt: 'md',
      sortable: true,
      sortAccessor: doc => doc.fechaEmision,
      render: doc => (
        <span className="text-xs text-gray-600 whitespace-nowrap tabular-nums">
          {fmtFechaCorta(doc.fechaEmision)}
        </span>
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
          <div className="min-w-0">
            <p className={`text-xs font-medium leading-tight ${esCredito ? 'text-amber-700' : 'text-gray-500'}`}>
              {TIPO_PAGO_LABEL[doc.tipoPago ?? 1] ?? '—'}
            </p>
            {esCredito && doc.fechaLimitePago && (
              <p className={`text-[11px] mt-0.5 tabular-nums leading-tight whitespace-nowrap ${vencida ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                {fmtFechaCorta(doc.fechaLimitePago)}
                {vencida && <span className="ml-1 text-red-500">· {dias}d</span>}
              </p>
            )}
          </div>
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
        <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
          {fmtDOP(doc.montoTotal - doc.totalItbis)}
        </span>
      ),
    },
    {
      id: 'itbis',
      header: 'ITBIS',
      visibleAt: 'xl',
      align: 'right',
      render: doc => (
        <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
          {doc.totalItbis > 0 ? fmtDOP(doc.totalItbis) : <span className="text-gray-300">—</span>}
        </span>
      ),
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      sortable: true,
      sortAccessor: doc => doc.montoTotal,
      render: doc => (
        <span className="text-sm font-bold text-gray-900 whitespace-nowrap tabular-nums">
          {fmtDOP(doc.montoTotal)}
        </span>
      ),
    },
    {
      id: 'saldo',
      header: 'Cobro',
      visibleAt: 'lg',
      align: 'center',
      render: doc => {
        const pagado = doc.pagado ?? 0;
        const saldo  = doc.montoTotal - pagado;
        const esCredito = doc.tipoPago === 2;
        if (doc.tipoPago === 3) return <Badge color="gray">Gratuita</Badge>;
        if (doc.tipoPago === 4) return <Badge color="gray">Uso</Badge>;
        if (doc.montoTotal > 0 && pagado >= doc.montoTotal) return <Badge color="green">Pagada</Badge>;
        if (pagado > 0) return <Badge color="amber" title={`Falta ${fmtDOP(saldo)}`}>Parcial</Badge>;
        if (esCredito) {
          const dias = diasVencido(doc.fechaLimitePago);
          if (dias > 0) return <Badge color="red" title={`Vencida hace ${dias}d`}>Vencida</Badge>;
          return <Badge color="amber">Pendiente</Badge>;
        }
        return <Badge color="red" title="Contado sin cobro registrado">Sin pago</Badge>;
      },
    },
    {
      id: 'estado',
      header: 'Estado DGII',
      align: 'center',
      render: doc => (
        <span
          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${ESTADO_BADGE[doc.estado] ?? 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'}`}
        >
          {ESTADO_LABEL[doc.estado] ?? doc.estado}
        </span>
      ),
    },
  ];

  const rowActions = (doc: Doc): RowAction[] => {
    if (doc.estado === 'BORRADOR') {
      // Para borradores no es ícono — usamos un link "Editar" inline. Lo emulamos via row action.
      return [
        { icon: FileText, title: 'Continuar edición', href: `/dashboard/facturas/${doc.id}/editar` },
      ];
    }
    return [
      { icon: FileText, title: 'Ver PDF', href: `/api/pdf/factura/${doc.id}` },
      { icon: Mail,     title: 'Enviar por email', onClick: () => setEmailModal({ id: doc.id, email: doc.emailComprador ?? '' }) },
    ];
  };

  // Derivar bulk/header actions según permisos (default-deny mientras carga)
  const canAnular   = !permLoading && can('facturas:anular');
  const canExportar = !permLoading && can('facturas:exportar');
  const canCrear    = !permLoading && can('facturas:crear');

  return (
    <section className="p-4 sm:p-6 space-y-4">
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
            <Link href="/dashboard/facturas/nueva" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline">
              <Plus className="h-4 w-4" /> Emitir primer comprobante
            </Link>
          ) : undefined,
        }}
        headerActions={
          <>
            {canCrear && (
              <button onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
                <Upload className="h-4 w-4" /> Importar de Alegra
              </button>
            )}
            {canExportar && (
              <button onClick={exportCsv}
                className="flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
                <Download className="h-4 w-4" /> CSV
              </button>
            )}
            {canCrear && (
              <Link href="/dashboard/facturas/nueva"
                className="flex items-center gap-1.5 bg-teal-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-teal-700 font-medium transition-colors">
                <Plus className="h-4 w-4" /> Nueva Factura
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
      {emailModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Enviar factura por email</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email del destinatario</label>
              <input
                type="email"
                value={emailModal.email}
                onChange={e => setEmailModal(m => m ? { ...m, email: e.target.value } : m)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="cliente@empresa.com"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEmailModal(null)}
                className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={sendEmail} disabled={emailLoading || !emailModal.email}
                className="text-sm px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {emailLoading ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Badge helper (uso interno a esta página) ─────────────────────────────────

const BADGE_COLORS = {
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  red:   'bg-red-50 text-red-700 ring-1 ring-red-200',
  gray:  'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
} as const;

function Badge({
  color,
  title,
  children,
}: {
  color: keyof typeof BADGE_COLORS;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${BADGE_COLORS[color]}`}
      title={title}
    >
      {children}
    </span>
  );
}
