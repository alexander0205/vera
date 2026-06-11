'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Download } from 'lucide-react';
import { DataTable, type DataTableColumn, type RowAction } from '@/components/data-table';
import { fmtDOP, fmtFechaCorta } from '@/lib/utils/format';

export interface NotaDebito {
  id:                   number;
  encf:                 string;
  codigo:               string | null;
  estado:               string;
  estadoPago:           string;
  moraOrigenId:         number | null;
  razonSocialComprador: string | null;
  montoTotal:           number;
  fechaEmision:         string; // ISO
  ncfModificado:        string | null;
  codigoModificacion:   number | null;
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

const COBRO_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PAGADA:    { label: 'Pagada',    variant: 'default' },
  PARCIAL:   { label: 'Parcial',   variant: 'secondary' },
  PENDIENTE: { label: 'Pendiente', variant: 'outline' },
  ANULADA:   { label: '—',         variant: 'secondary' },
};

export default function NotasDebitoClient({ docs }: { docs: NotaDebito[] }) {
  const columns: DataTableColumn<NotaDebito>[] = [
    {
      id: 'codigo',
      header: 'Código',
      sortable: true,
      sortAccessor: d => d.codigo ?? '',
      render: d => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-xs font-semibold text-orange-700">{d.codigo ?? `#${d.id}`}</span>
          {d.moraOrigenId != null && (
            <span className="text-[10px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full">
              Mora
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'comprador',
      header: 'Cliente',
      render: d => d.razonSocialComprador
        ? <span className="text-sm">{d.razonSocialComprador}</span>
        : <span className="text-sm text-gray-400">—</span>,
    },
    {
      id: 'modifica',
      header: 'Modifica',
      visibleAt: 'lg',
      render: d => d.ncfModificado ? (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-gray-700">{d.ncfModificado}</span>
          {d.codigoModificacion != null && (
            <span className="text-[10px] text-gray-400">
              {COD_MODIFICACION_LABEL[d.codigoModificacion] ?? `Cód. ${d.codigoModificacion}`}
            </span>
          )}
        </div>
      ) : <span className="text-xs text-gray-300">—</span>,
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
      id: 'cobro',
      header: 'Cobro',
      align: 'center',
      visibleAt: 'md',
      render: d => {
        const b = COBRO_BADGE[d.estadoPago] ?? { label: d.estadoPago, variant: 'outline' as const };
        return <Badge variant={b.variant}>{b.label}</Badge>;
      },
    },
    {
      id: 'estado',
      header: 'Estado',
      visibleAt: 'lg',
      render: d => {
        // Borrador con padre ya emitido → resaltar que puede enviarse a DGII
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

  const rowActions = (d: NotaDebito): RowAction[] => [
    { icon: FileText, title: 'Ver detalle',    href: `/dashboard/facturas/${d.id}` },
    { icon: Download, title: 'Descargar PDF',  href: `/api/pdf/factura/${d.codigo ?? d.id}` },
  ];

  return (
    <section className="bg-[#eef0f7] min-h-full p-6 space-y-6">
      <DataTable<NotaDebito>
        data={docs}
        columns={columns}
        title="Notas de Débito"
        description="Comprobantes tipo 33 — e-CF Nota de Débito (incluye recargos por mora)"
        rowActions={rowActions}
        emptyState={{
          icon: FileText,
          title: 'Sin notas de débito aún',
          hint: 'Las notas de débito se usan para cargos adicionales sobre una factura (ej. mora)',
          cta: (
            <Button asChild size="sm" className="bg-teal-600 hover:bg-teal-700">
              <Link href="/dashboard/facturas/nueva?tipo=33">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Nota de Débito
              </Link>
            </Button>
          ),
        }}
        headerActions={
          <Button asChild className="bg-teal-600 hover:bg-teal-700 rounded-lg">
            <Link href="/dashboard/facturas/nueva?tipo=33">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Nota de Débito
            </Link>
          </Button>
        }
      />
    </section>
  );
}
