'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Download, TrendingDown, CheckCircle, Clock, FileX } from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

export interface NotaCredito {
  id:                   number;
  encf:                 string;
  codigo:               string | null;
  estado:               string;
  razonSocialComprador: string | null;
  montoTotal:           number;
  fechaEmision:         string; // ISO
  ncfModificado:        string | null;
  codigoModificacion:   number | null;
  razonModificacion:    string | null;
  origenDocumentoId:    number | null;
  /** Padre con e-CF emitido → nota borrador "puede" enviarse a DGII. */
  padreEmitido:         boolean;
}

const COD_MODIFICACION_LABEL: Record<number, string> = {
  1: 'Anula NCF',
  2: 'Corrige texto',
  3: 'Corrige monto',
  4: 'Reemplazo contingencia',
  5: 'Ref. consumo',
};

const ESTADO_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ACEPTADO:             { label: 'Aceptado',    variant: 'default' },
  ACEPTADO_CONDICIONAL: { label: 'Condicional', variant: 'secondary' },
  EN_PROCESO:           { label: 'En Proceso',  variant: 'outline' },
  RECHAZADO:            { label: 'Rechazado',   variant: 'destructive' },
  BORRADOR:             { label: 'Borrador',    variant: 'outline' },
  ANULADO:              { label: 'Anulado',     variant: 'secondary' },
};

const ESTADO_OPTIONS = [
  { value: 'ACEPTADO',             label: 'Aceptado' },
  { value: 'ACEPTADO_CONDICIONAL', label: 'Condicional' },
  { value: 'EN_PROCESO',           label: 'En Proceso' },
  { value: 'BORRADOR',             label: 'Borrador' },
  { value: 'RECHAZADO',            label: 'Rechazado' },
  { value: 'ANULADO',              label: 'Anulado' },
];

function exportCSV(rows: NotaCredito[]) {
  const headers = ['e-NCF', 'Factura origen', 'Motivo', 'Comprador', 'Monto (DOP)', 'Estado', 'Fecha'];
  const body = rows.map(r => [
    r.encf && !r.encf.startsWith('BOR-') ? r.encf : (r.codigo ?? `#${r.id}`),
    r.ncfModificado ?? '',
    r.razonModificacion || (r.codigoModificacion != null ? (COD_MODIFICACION_LABEL[r.codigoModificacion] ?? '') : ''),
    r.razonSocialComprador ?? 'Consumidor final',
    r.montoTotal.toFixed(2),
    r.estado,
    r.fechaEmision.slice(0, 10),
  ]);
  const csv = [headers, ...body]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'notas-credito.csv'; a.click();
  URL.revokeObjectURL(url);
}

interface StatCardProps {
  label: string;
  value: string;
  sub:   string;
  icon:  React.ComponentType<{ className?: string }>;
  color: 'teal' | 'green' | 'amber' | 'gray';
}

const COLOR_MAP = {
  teal:  { bg: 'bg-teal-50',   icon: 'text-teal-600',  val: 'text-teal-700'  },
  green: { bg: 'bg-green-50',  icon: 'text-green-600', val: 'text-green-700' },
  amber: { bg: 'bg-amber-50',  icon: 'text-amber-600', val: 'text-amber-700' },
  gray:  { bg: 'bg-gray-50',   icon: 'text-gray-400',  val: 'text-gray-700'  },
};

function StatCard({ label, value, sub, icon: Icon, color }: StatCardProps) {
  const c = COLOR_MAP[color];
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3.5 flex items-center gap-3">
      <div className={`${c.bg} p-2 rounded-lg shrink-0`}>
        <Icon className={`h-4 w-4 ${c.icon}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className={`text-lg font-bold leading-tight ${c.val}`}>{value}</p>
        <p className="text-[11px] text-gray-400">{sub}</p>
      </div>
    </div>
  );
}

export default function NotasCreditoClient({ docs }: { docs: NotaCredito[] }) {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const resumen = useMemo(() => {
    const activas = docs.filter(d => d.estado !== 'ANULADO');
    return {
      monto:      activas.reduce((s, d) => s + d.montoTotal, 0),
      count:      activas.length,
      aceptadas:  docs.filter(d => d.estado === 'ACEPTADO' || d.estado === 'ACEPTADO_CONDICIONAL').length,
      pendientes: docs.filter(d => d.estado === 'BORRADOR' && d.padreEmitido).length,
    };
  }, [docs]);

  const filtered = useMemo(() => {
    let d = docs;
    const q      = filterValues['q']?.toLowerCase();
    const estado = filterValues['estado'];
    const desde  = filterValues['fecha_desde'];
    const hasta  = filterValues['fecha_hasta'];

    if (q) d = d.filter(x =>
      x.razonSocialComprador?.toLowerCase().includes(q) ||
      x.encf?.toLowerCase().includes(q) ||
      x.ncfModificado?.toLowerCase().includes(q) ||
      x.razonModificacion?.toLowerCase().includes(q) ||
      x.codigo?.toLowerCase().includes(q),
    );
    if (estado) d = d.filter(x => x.estado === estado);
    if (desde)  d = d.filter(x => x.fechaEmision >= desde);
    if (hasta)  d = d.filter(x => x.fechaEmision.slice(0, 10) <= hasta);
    return d;
  }, [docs, filterValues]);

  const columns: DataTableColumn<NotaCredito>[] = [
    {
      id: 'encf',
      header: 'e-NCF',
      sortable: true,
      render: d => (
        <span className="font-mono text-sm font-medium">
          {d.encf && !d.encf.startsWith('BOR-') ? d.encf : (d.codigo ?? `#${d.id}`)}
        </span>
      ),
    },
    {
      id: 'origen',
      header: 'Factura origen',
      visibleAt: 'md',
      render: d => {
        if (!d.ncfModificado) return <span className="text-xs text-gray-300">—</span>;
        const inner = (
          <span className="font-mono text-xs text-blue-700 hover:text-blue-900 hover:underline">
            {d.ncfModificado}
          </span>
        );
        return d.origenDocumentoId
          ? <Link href={`/dashboard/facturas/${d.origenDocumentoId}`} onClick={e => e.stopPropagation()}>{inner}</Link>
          : inner;
      },
    },
    {
      id: 'motivo',
      header: 'Motivo',
      visibleAt: 'lg',
      render: d => {
        const texto = d.razonModificacion?.trim() ||
          (d.codigoModificacion != null ? COD_MODIFICACION_LABEL[d.codigoModificacion] : null);
        return texto
          ? <span className="text-xs text-gray-600 line-clamp-2 max-w-[180px]">{texto}</span>
          : <span className="text-xs text-gray-300">—</span>;
      },
    },
    {
      id: 'comprador',
      header: 'Comprador',
      render: d => d.razonSocialComprador
        ? <span className="text-sm">{d.razonSocialComprador}</span>
        : <span className="text-sm text-gray-400">Consumidor final</span>,
    },
    {
      id: 'monto',
      header: 'Monto',
      align: 'right',
      sortable: true,
      sortAccessor: d => d.montoTotal,
      render: d => <span className="text-sm font-medium whitespace-nowrap">{fmtDOP(d.montoTotal)}</span>,
    },
    {
      id: 'estado',
      header: 'Estado',
      visibleAt: 'md',
      render: d => {
        if (d.estado === 'BORRADOR' && d.padreEmitido) {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200">
              Pendiente DGII
            </span>
          );
        }
        const badge = ESTADO_BADGE[d.estado] ?? { label: d.estado, variant: 'outline' as const };
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    {
      id: 'fechaEmision',
      header: 'Fecha',
      visibleAt: 'md',
      sortable: true,
      sortAccessor: d => d.fechaEmision,
      render: d => <span className="text-sm text-gray-500">{fmtFechaCorta(d.fechaEmision)}</span>,
    },
  ];

  const rowActions = (d: NotaCredito): RowAction[] => [
    { icon: FileText, title: 'Ver detalle',   href: `/dashboard/notas-credito/${d.id}` },
    { icon: Download, title: 'Descargar PDF', href: `/api/pdf/factura/${d.id}` },
  ];

  return (
    <section className="bg-[#eef0f7] min-h-full p-6 space-y-4">
      {/* Tarjetas resumen */}
      {docs.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Monto total"    value={fmtDOP(resumen.monto)}       sub="Notas activas"    icon={TrendingDown}  color="teal"  />
          <StatCard label="Total notas"    value={String(resumen.count)}        sub="No anuladas"      icon={FileText}      color="gray"  />
          <StatCard label="Enviadas DGII"  value={String(resumen.aceptadas)}    sub="Aceptadas"        icon={CheckCircle}   color="green" />
          <StatCard label="Pendiente DGII" value={String(resumen.pendientes)}   sub="Borradores listos" icon={Clock}        color="amber" />
        </div>
      )}

      <DataTable<NotaCredito>
        data={filtered}
        columns={columns}
        title="Notas de Crédito"
        description="Comprobantes tipo 34 — e-CF Nota de Crédito"
        rowHref={d => `/dashboard/notas-credito/${d.id}`}
        rowActions={rowActions}
        filters={[
          { type: 'search',    id: 'q',     placeholder: 'Buscar por comprador, e-NCF, motivo…' },
          { type: 'select',    id: 'estado', label: 'Estado', options: ESTADO_OPTIONS, placeholder: 'Todos los estados' },
          { type: 'daterange', id: 'fecha' },
        ]}
        filterValues={filterValues}
        onFilterChange={setFilterValues}
        emptyState={{
          icon: FileText,
          title: filtered.length === 0 && docs.length > 0 ? 'Sin resultados para estos filtros' : 'Sin notas de crédito aún',
          hint: filtered.length === 0 && docs.length > 0
            ? 'Intenta ajustar la búsqueda o los filtros'
            : 'Las notas de crédito se usan para revertir o reducir facturas previas',
          cta: filtered.length === 0 && docs.length > 0 ? undefined : (
            <Button asChild size="sm" className="bg-teal-600 hover:bg-teal-700">
              <Link href="/dashboard/notas-credito/nueva">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Nota de Crédito
              </Link>
            </Button>
          ),
        }}
        headerActions={
          <div className="flex items-center gap-2">
            {docs.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)}>
                <FileX className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            )}
            <Button asChild className="bg-teal-600 hover:bg-teal-700 rounded-lg">
              <Link href="/dashboard/notas-credito/nueva">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Nota de Crédito
              </Link>
            </Button>
          </div>
        }
      />
    </section>
  );
}
