'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Download } from 'lucide-react';
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

export default function NotasCreditoClient({ docs }: { docs: NotaCredito[] }) {
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

  const rowActions = (d: NotaCredito): RowAction[] => [
    { icon: FileText, title: 'Ver detalle',    href: `/dashboard/facturas/${d.id}` },
    { icon: Download, title: 'Descargar PDF',  href: `/api/pdf/factura/${d.id}` },
  ];

  return (
    <section className="bg-[#eef0f7] min-h-full p-6 space-y-6">
      <DataTable<NotaCredito>
        data={docs}
        columns={columns}
        title="Notas de Crédito"
        description="Comprobantes tipo 34 — e-CF Nota de Crédito"
        rowActions={rowActions}
        emptyState={{
          icon: FileText,
          title: 'Sin notas de crédito aún',
          hint: 'Las notas de crédito se usan para revertir o reducir facturas previas',
          cta: (
            <Button asChild size="sm" className="bg-teal-600 hover:bg-teal-700">
              <Link href="/dashboard/facturas/nueva?tipo=34">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Nota de Crédito
              </Link>
            </Button>
          ),
        }}
        headerActions={
          <Button asChild className="bg-teal-600 hover:bg-teal-700 rounded-lg">
            <Link href="/dashboard/facturas/nueva?tipo=34">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Nota de Crédito
            </Link>
          </Button>
        }
      />
    </section>
  );
}
