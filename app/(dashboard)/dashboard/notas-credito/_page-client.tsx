'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
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
  fechaEmision:         string;
  ncfModificado:        string | null;
  codigoModificacion:   number | null;
  razonModificacion:    string | null;
  origenDocumentoId:    number | null;
  padreEmitido:         boolean;
}

const COD_MODIFICACION_LABEL: Record<number, string> = {
  1: 'Anula NCF',
  2: 'Corrige texto',
  3: 'Corrige monto',
  4: 'Reemplazo contingencia',
  5: 'Ref. consumo',
};

const ESTADO_OPTIONS = [
  { value: 'ACEPTADO',             label: 'Aceptado' },
  { value: 'ACEPTADO_CONDICIONAL', label: 'Condicional' },
  { value: 'EN_PROCESO',           label: 'En Proceso' },
  { value: 'BORRADOR',             label: 'Borrador' },
  { value: 'RECHAZADO',            label: 'Rechazado' },
  { value: 'ANULADO',              label: 'Anulado' },
];

function EstadoChip({ estado, padreEmitido }: { estado: string; padreEmitido: boolean }) {
  if (estado === 'BORRADOR' && padreEmitido) {
    return <Chip label="Pendiente DGII" size="small" sx={{ bgcolor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '0.6875rem' }} />;
  }
  switch (estado) {
    case 'ACEPTADO':             return <Chip label="Aceptado"    size="small" sx={{ bgcolor: '#16a34a', color: '#fff', fontSize: '0.6875rem' }} />;
    case 'ACEPTADO_CONDICIONAL': return <Chip label="Condicional" size="small" sx={{ bgcolor: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: '0.6875rem' }} />;
    case 'EN_PROCESO':           return <Chip label="En Proceso"  size="small" variant="outlined" sx={{ fontSize: '0.6875rem', borderColor: '#d1d5db', color: '#4b5563' }} />;
    case 'RECHAZADO':            return <Chip label="Rechazado"   size="small" sx={{ bgcolor: '#dc2626', color: '#fff', fontSize: '0.6875rem' }} />;
    case 'BORRADOR':             return <Chip label="Borrador"    size="small" variant="outlined" sx={{ fontSize: '0.6875rem', borderColor: '#d1d5db', color: '#4b5563' }} />;
    case 'ANULADO':              return <Chip label="Anulado"     size="small" sx={{ bgcolor: '#f3f4f6', color: '#6b7280', fontSize: '0.6875rem' }} />;
    default:                     return <Chip label={estado}      size="small" variant="outlined" sx={{ fontSize: '0.6875rem' }} />;
  }
}

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
  Icon:  React.ComponentType<{ size?: number; color?: string }>;
  bgcolor:    string;
  iconColor:  string;
  valueColor: string;
}

function StatCard({ label, value, sub, Icon, bgcolor, iconColor, valueColor }: StatCardProps) {
  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', px: 2, py: 1.75, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ bgcolor, p: 1, borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} color={iconColor} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: valueColor, lineHeight: 1.2 }}>
          {value}
        </Typography>
        <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af' }}>{sub}</Typography>
      </Box>
    </Box>
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
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 600 }}>
          {d.encf && !d.encf.startsWith('BOR-') ? d.encf : (d.codigo ?? `#${d.id}`)}
        </Typography>
      ),
    },
    {
      id: 'origen',
      header: 'Factura origen',
      visibleAt: 'md',
      render: d => {
        if (!d.ncfModificado) return <Typography sx={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</Typography>;
        const inner = (
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#1d4ed8', '&:hover': { color: '#1e3a8a', textDecoration: 'underline' } }}>
            {d.ncfModificado}
          </Typography>
        );
        return d.origenDocumentoId
          ? <Link href={`/dashboard/facturas/${d.origenDocumentoId}`} onClick={e => e.stopPropagation()} style={{ textDecoration: 'none' }}>{inner}</Link>
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
          ? <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: 180 }}>{texto}</Typography>
          : <Typography sx={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</Typography>;
      },
    },
    {
      id: 'comprador',
      header: 'Comprador',
      render: d => d.razonSocialComprador
        ? <Typography variant="body2">{d.razonSocialComprador}</Typography>
        : <Typography variant="body2" sx={{ color: '#9ca3af' }}>Consumidor final</Typography>,
    },
    {
      id: 'monto',
      header: 'Monto',
      align: 'right',
      sortable: true,
      sortAccessor: d => d.montoTotal,
      render: d => <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtDOP(d.montoTotal)}</Typography>,
    },
    {
      id: 'estado',
      header: 'Estado',
      visibleAt: 'md',
      render: d => <EstadoChip estado={d.estado} padreEmitido={d.padreEmitido} />,
    },
    {
      id: 'fechaEmision',
      header: 'Fecha',
      visibleAt: 'md',
      sortable: true,
      sortAccessor: d => d.fechaEmision,
      render: d => <Typography variant="body2" sx={{ color: '#6b7280' }}>{fmtFechaCorta(d.fechaEmision)}</Typography>,
    },
  ];

  const rowActions = (d: NotaCredito): RowAction[] => [
    { icon: FileText, title: 'Ver detalle',   href: `/dashboard/notas-credito/${d.id}` },
    { icon: Download, title: 'Descargar PDF', href: `/api/pdf/factura/${d.id}` },
  ];

  return (
    <Box sx={{ bgcolor: '#eef0f7', minHeight: '100%', p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {docs.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5, '@media (min-width: 1024px)': { gridTemplateColumns: 'repeat(4, 1fr)' } }}>
          <StatCard label="Monto total"    value={fmtDOP(resumen.monto)}     sub="Notas activas"     Icon={TrendingDown}  bgcolor="#f0fdfa" iconColor="#0d9488" valueColor="#0f766e" />
          <StatCard label="Total notas"    value={String(resumen.count)}      sub="No anuladas"       Icon={FileText}      bgcolor="#f9fafb" iconColor="#6b7280" valueColor="#374151" />
          <StatCard label="Enviadas DGII"  value={String(resumen.aceptadas)}  sub="Aceptadas"         Icon={CheckCircle}   bgcolor="#f0fdf4" iconColor="#16a34a" valueColor="#15803d" />
          <StatCard label="Pendiente DGII" value={String(resumen.pendientes)} sub="Borradores listos" Icon={Clock}         bgcolor="#fffbeb" iconColor="#d97706" valueColor="#92400e" />
        </Box>
      )}

      <DataTable<NotaCredito>
        data={filtered}
        columns={columns}
        title="Notas de Crédito"
        description="Comprobantes tipo 34 — e-CF Nota de Crédito"
        rowHref={d => `/dashboard/notas-credito/${d.id}`}
        rowActions={rowActions}
        filters={[
          { type: 'search',    id: 'q',      placeholder: 'Buscar por comprador, e-NCF, motivo…' },
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
            <Link href="/dashboard/notas-credito/nueva" style={{ textDecoration: 'none' }}>
              <Button variant="contained" disableElevation size="small" startIcon={<Plus size={16} />}
                sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}>
                Nueva Nota de Crédito
              </Button>
            </Link>
          ),
        }}
        headerActions={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {docs.length > 0 && (
              <Button variant="outlined" size="small" startIcon={<FileX size={16} />}
                onClick={() => exportCSV(filtered)}
                sx={{ borderRadius: '8px', textTransform: 'none', borderColor: '#d1d5db', color: '#374151', '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' } }}>
                Exportar CSV
              </Button>
            )}
            <Link href="/dashboard/notas-credito/nueva" style={{ textDecoration: 'none' }}>
              <Button variant="contained" disableElevation startIcon={<Plus size={18} />}
                sx={{ borderRadius: '8px', textTransform: 'none', bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}>
                Nueva Nota de Crédito
              </Button>
            </Link>
          </Box>
        }
      />
    </Box>
  );
}
