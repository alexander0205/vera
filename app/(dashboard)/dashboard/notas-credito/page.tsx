import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { getTeamIdForUser, getEcfDocuments } from '@/lib/db/queries';

const ESTADO_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ACEPTADO:             { label: 'Aceptado',    variant: 'default' },
  ACEPTADO_CONDICIONAL: { label: 'Condicional', variant: 'secondary' },
  EN_PROCESO:           { label: 'En Proceso',  variant: 'outline' },
  RECHAZADO:            { label: 'Rechazado',   variant: 'destructive' },
  BORRADOR:             { label: 'Borrador',    variant: 'outline' },
  ANULADO:              { label: 'Anulado',     variant: 'secondary' },
};

export default async function NotasCreditoPage() {
  const teamId = await getTeamIdForUser();
  if (!teamId) redirect('/sign-in');

  const allDocs = await getEcfDocuments(teamId, 500);
  const docs = allDocs.filter(d => d.tipoEcf === '34');

  return (
    <section className="bg-[#eef0f7] min-h-full p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notas de Crédito</h1>
          <p className="text-sm text-gray-500 mt-0.5">Comprobantes tipo 34 — e-CF Nota de Crédito</p>
        </div>
        <Button asChild className="bg-teal-600 hover:bg-teal-700 rounded-lg">
          <Link href="/dashboard/facturas/nueva?tipo=34">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Nota de Crédito
          </Link>
        </Button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {docs.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Sin notas de crédito aún</p>
            <p className="text-sm text-gray-400 mt-1">
              Las notas de crédito se usan para revertir o reducir facturas previas
            </p>
            <Button asChild size="sm" className="mt-4 bg-teal-600 hover:bg-teal-700">
              <Link href="/dashboard/facturas/nueva?tipo=34">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Nota de Crédito
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>e-NCF</TableHead>
                <TableHead>Comprador</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => {
                const badge = ESTADO_BADGE[doc.estado] ?? { label: doc.estado, variant: 'outline' as const };
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="font-mono text-sm font-medium">
                      {doc.encf}
                    </TableCell>
                    <TableCell className="text-sm">
                      {doc.razonSocialComprador ?? (
                        <span className="text-gray-400">Consumidor final</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      DOP {(doc.montoTotal / 100).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(doc.fechaEmision).toLocaleDateString('es-DO')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" asChild title="Ver detalle">
                          <Link href={`/dashboard/facturas/${doc.id}`}>
                            <FileText className="h-4 w-4 text-gray-500" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild title="Descargar PDF">
                          <a href={`/api/pdf/factura/${doc.id}`} target="_blank" rel="noreferrer">
                            <Download className="h-4 w-4 text-teal-600" />
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
