'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, Download, Mail, Ban, FileText, Upload, Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { NotasMoraTable } from '@/components/notas-mora-table';
import { ImportModal } from '@/components/import-modal';
import { fmtDOP, fmtFechaCorta, fmtFechaRD, diasVencido } from '@/lib/utils/format';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { calcularEstadoPago } from '@/lib/facturas/estado-pago-calc';

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

// Color del TEXTO del comprobante según estado DGII (no badge, solo texto)
const ESTADO_TEXT: Record<string, string> = {
  ACEPTADO:             'text-emerald-700',
  ACEPTADO_CONDICIONAL: 'text-amber-700',
  EN_PROCESO:           'text-sky-700',
  RECHAZADO:            'text-red-700',
  BORRADOR:             'text-gray-400',
  ANULADO:              'text-gray-400 line-through',
  HISTORICA:            'text-indigo-600',
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
  moraPendiente?: number;
  /** Saldo vivo de notas de débito manuales (cargo adicional) de esta factura. */
  ndPendiente?: number;
  moraAplicada?: number;
  moraNotas?: {
    id: number; codigo: string | null; montoTotal: number; saldo: number;
    estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA';
    fechaEmision?: string | null; periodo?: string | null;
  }[];
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
          className="block whitespace-nowrap font-mono text-xs font-semibold leading-tight tabular-nums text-gray-700 hover:text-teal-700 hover:underline"
          title={doc.codigo ?? `#${doc.id}`}
        >
          {doc.codigo ?? `#${doc.id}`}
        </Link>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      sortable: true,
      sortAccessor: doc => doc.razonSocialComprador ?? '',
      // Una línea por celda: el RNC vive en su propia columna y el beneficiario
      // en el detalle. Apilar tres textos grises debajo del nombre convertía la
      // tabla en un muro y no dejaba comparar filas de un vistazo.
      render: doc => (
        <p
          className="max-w-[220px] truncate text-sm font-medium leading-tight text-gray-900"
          title={doc.razonSocialComprador ?? 'Consumidor Final'}
        >
          {doc.razonSocialComprador ?? <span className="text-gray-400 font-normal">Consumidor Final</span>}
        </p>
      ),
    },
    {
      id: 'rnc',
      header: 'RNC / Cédula',
      visibleAt: 'lg',
      sortable: true,
      sortAccessor: doc => doc.rncComprador ?? '',
      render: doc => (
        <span className="font-mono text-xs tabular-nums text-gray-600">
          {doc.rncComprador ?? <span className="text-gray-300">—</span>}
        </span>
      ),
    },
    {
      id: 'fechaEmision',
      header: 'Emisión',
      visibleAt: 'md',
      sortable: true,
      sortAccessor: doc => doc.createdAt,
      render: doc => (
        <div className="whitespace-nowrap tabular-nums leading-tight">
          {/* Solo la fecha: la hora del alta no ayuda a ubicar una factura en
              un listado y competía con el dato que sí importa. Sigue visible
              en el detalle del documento. */}
          <span className="text-xs text-gray-600">{fmtFechaRD(doc.createdAt)}</span>
        </div>
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
        // De contado no tiene vencimiento; a crédito, la fecha ES el dato — la
        // palabra "Crédito" sobra al lado de una fecha de vencimiento.
        if (!esCredito || !doc.fechaLimitePago) {
          return <span className="text-xs text-gray-500 whitespace-nowrap">{TIPO_PAGO_LABEL[doc.tipoPago ?? 1] ?? '—'}</span>;
        }
        return (
          <span className={`text-xs tabular-nums whitespace-nowrap ${vencida ? 'font-semibold text-red-600' : 'text-gray-600'}`}>
            {fmtFechaCorta(doc.fechaLimitePago)}
            {vencida && <span className="ml-1 font-normal text-red-500">· {dias}d</span>}
          </span>
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
        // Cualquier nota de débito viva sobre esta factura —mora automática o
        // cargo manual— es deuda de la misma cuenta.
        const ndPend = Number(doc.moraPendiente ?? 0) + Number(doc.ndPendiente ?? 0);
        if (ep === 'GRATUITA') return <Badge color="gray">Gratuita</Badge>;
        if (ep === 'USO')      return <Badge color="gray">Uso</Badge>;
        // Capital saldado pero con notas de débito sin pagar: la factura no
        // está cobrada del todo, así que no puede anunciarse como Pagada.
        if (ep === 'PAGADA' && ndPend > 0) {
          return <Badge color="orange" title={`Capital pagado; falta ${fmtDOP(ndPend)} en notas de débito`}>Parcial</Badge>;
        }
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
        <span className="text-xs text-gray-500 truncate max-w-[120px] block" title={doc.createdByName ?? undefined}>
          {doc.createdByName ?? '—'}
        </span>
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
        const compacto = fmtEncf(doc.encf);
        const color    = ESTADO_TEXT[doc.estado] ?? 'text-gray-400';
        return (
          <Link
            href={`/dashboard/facturas/${doc.id}`}
            className={`font-mono text-xs font-semibold hover:underline leading-tight block whitespace-nowrap ${color}`}
            title={`${doc.encf && !doc.encf.startsWith('BOR-') ? doc.encf : 'Sin comprobante'} · ${ESTADO_LABEL[doc.estado] ?? doc.estado}`}
          >
            {compacto ?? (doc.encf && !doc.encf.startsWith('BOR-') ? doc.encf : '—')}
          </Link>
        );
      },
    },
  ];

  const rowActions = (doc: Doc): RowAction[] => {
    // Sin ojito: el código de la fila ya es el enlace al detalle y el botón
    // repetía ese mismo destino ocupando una columna.
    // Recibo POS: solo para ventas sin-ncf (ticket de mostrador). Reabre el recibo 80mm.
    const recibo: RowAction[] = doc.tipoEcf === 'sin-ncf'
      ? [{ icon: Printer, title: 'Reimprimir recibo', onClick: () => window.open(`/pos-ticket/${doc.id}`, '_blank', 'width=420,height=680') }]
      : [];
    if (doc.estado === 'BORRADOR') {
      return [
        { icon: FileText, title: 'Continuar edición', href: `/dashboard/facturas/${doc.id}/editar` },
        ...recibo,
      ];
    }
    return [
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
        // Solo se despliega la factura que tiene notas de mora colgando: sin
        // ellas el panel repetía la propia factura y su saldo, que ya están en
        // la fila. Una flecha que no aporta nada al abrirse educa a no abrirla.
        rowExpandable={doc => (doc.moraNotas?.length ?? 0) > 0}
        renderExpanded={doc => <ResumenFactura doc={doc} />}
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

// ─── Fila hija: resumen general de una factura (montos + cobro + mora) ────────

function ResumenFactura({ doc }: { doc: Doc }) {
  return (
    <NotasMoraTable notas={doc.moraNotas ?? []} />
  );
}

// ─── Badge helper (uso interno a esta página) ─────────────────────────────────

const BADGE_COLORS = {
  green:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  amber:  'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  orange: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  red:    'bg-red-50 text-red-700 ring-1 ring-red-200',
  gray:   'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
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
