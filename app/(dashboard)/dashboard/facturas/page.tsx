'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, Download, Mail, Ban, FileText, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { ImportModal } from '@/components/import-modal';
import { fmtDOP, fmtFechaCorta, diasVencido } from '@/lib/utils/format';

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
const ESTADO_BADGE: Record<string, string> = {
  ACEPTADO:             'bg-green-100 text-green-700',
  ACEPTADO_CONDICIONAL: 'bg-yellow-100 text-yellow-700',
  EN_PROCESO:           'bg-blue-100 text-blue-700',
  RECHAZADO:            'bg-red-100 text-red-700',
  BORRADOR:             'bg-gray-100 text-gray-600',
  ANULADO:              'bg-gray-100 text-gray-400 line-through',
  HISTORICA:            'bg-indigo-100 text-indigo-700',
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
      header: 'e-NCF / Tipo',
      sortable: true,
      render: doc => (
        <div>
          <Link href={`/dashboard/facturas/${doc.id}`} className="font-mono text-xs font-medium text-teal-700 hover:underline">
            {doc.encf}
          </Link>
          <p className="text-[11px] text-gray-400 mt-0.5">{TIPO_LABELS[doc.tipoEcf] ?? doc.tipoEcf}</p>
        </div>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente / RNC',
      sortable: true,
      sortAccessor: doc => doc.razonSocialComprador ?? '',
      render: doc => (
        <div className="max-w-[200px]">
          <p className="text-sm text-gray-900 truncate">{doc.razonSocialComprador ?? 'Consumidor Final'}</p>
          {doc.rncComprador && <p className="text-[11px] text-gray-400 font-mono">{doc.rncComprador}</p>}
        </div>
      ),
    },
    {
      id: 'fechaEmision',
      header: 'Emisión',
      visibleAt: 'md',
      sortable: true,
      sortAccessor: doc => doc.fechaEmision,
      render: doc => <span className="text-xs text-gray-600">{fmtFechaCorta(doc.fechaEmision)}</span>,
    },
    {
      id: 'pagoVence',
      header: 'Pago / Vence',
      visibleAt: 'lg',
      render: doc => {
        const esCredito = doc.tipoPago === 2;
        const dias = diasVencido(doc.fechaLimitePago);
        const saldo = doc.montoTotal - (doc.pagado ?? 0);
        const vencida = esCredito && saldo > 0 && dias > 0 && ['ACEPTADO','ACEPTADO_CONDICIONAL','EN_PROCESO'].includes(doc.estado);
        return (
          <div>
            <p className={`text-xs font-medium ${esCredito ? 'text-amber-700' : 'text-gray-600'}`}>
              {TIPO_PAGO_LABEL[doc.tipoPago ?? 1] ?? '—'}
            </p>
            {esCredito && doc.fechaLimitePago && (
              <p className={`text-[11px] mt-0.5 ${vencida ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {fmtFechaCorta(doc.fechaLimitePago)}
                {vencida && ` · ${dias}d vencida`}
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
      render: doc => <span className="text-xs text-gray-600 whitespace-nowrap">{fmtDOP(doc.montoTotal - doc.totalItbis)}</span>,
    },
    {
      id: 'itbis',
      header: 'ITBIS',
      visibleAt: 'xl',
      align: 'right',
      render: doc => <span className="text-xs text-gray-600 whitespace-nowrap">{doc.totalItbis > 0 ? fmtDOP(doc.totalItbis) : '—'}</span>,
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      sortable: true,
      sortAccessor: doc => doc.montoTotal,
      render: doc => <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{fmtDOP(doc.montoTotal)}</span>,
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
        // Gratuita / uso
        if (doc.tipoPago === 3) return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">Gratuita</span>;
        if (doc.tipoPago === 4) return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">Uso</span>;
        // Pagada (full)
        if (doc.montoTotal > 0 && pagado >= doc.montoTotal) {
          return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">Pagada</span>;
        }
        // Parcial
        if (pagado > 0) {
          return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700" title={`Falta ${fmtDOP(saldo)}`}>Parcial</span>;
        }
        // Sin pago: crédito vencido (rojo) vs pendiente (amber) vs contado sin cobro (rojo)
        if (esCredito) {
          const dias = diasVencido(doc.fechaLimitePago);
          if (dias > 0) return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700" title={`Vencida hace ${dias}d`}>Vencida</span>;
          return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">Pendiente</span>;
        }
        return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700" title="Contado sin cobro registrado">Sin pago</span>;
      },
    },
    {
      id: 'estado',
      header: 'Estado DGII',
      align: 'center',
      render: doc => (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${ESTADO_BADGE[doc.estado] ?? 'bg-gray-100 text-gray-600'}`}>
          {doc.estado}
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
          { label: 'Anular seleccionados', icon: Ban, variant: 'danger', onClick: ids => bulkAnular(ids) },
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
          cta: (
            <Link href="/dashboard/facturas/nueva" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline">
              <Plus className="h-4 w-4" /> Emitir primer comprobante
            </Link>
          ),
        }}
        headerActions={
          <>
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-700">
              <Upload className="h-4 w-4" /> Importar de Alegra
            </button>
            <button onClick={exportCsv}
              className="flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-700">
              <Download className="h-4 w-4" /> CSV
            </button>
            <Link href="/dashboard/facturas/nueva"
              className="flex items-center gap-1.5 bg-teal-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-teal-700 font-medium">
              <Plus className="h-4 w-4" /> Nueva Factura
            </Link>
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
