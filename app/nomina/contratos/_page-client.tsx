'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { toast } from '@/lib/toast';
import { FileText, Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { Plantilla, fetcher, resumenClausulas } from './shared';

export default function ContratosClient() {
  const router = useRouter();
  const { can } = usePermissions();
  const puedeConfig = can('nomina:configurar');
  const { data, isLoading, mutate } = useSWR<{ plantillas: Plantilla[] }>('/api/nomina/contratos/plantillas', fetcher);

  const [aBorrar, setABorrar] = useState<Plantilla | null>(null);

  const plantillas = data?.plantillas ?? [];

  // La creación y edición de la plantilla viven en su propia página (no modal):
  // cerrar por accidente no borra lo configurado (pedido de Alex).
  const irNueva = () => router.push('/nomina/contratos/nueva');
  const irEditar = (id: number) => router.push(`/nomina/contratos/${id}/editar`);

  async function borrar() {
    if (!aBorrar) return;
    try {
      const res = await fetch(`/api/nomina/contratos/plantillas?id=${aBorrar.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo borrar');
      toast.success('Plantilla borrada');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setABorrar(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileText className="h-6 w-6 text-zero-600" /> Plantillas de contrato
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Arma el contrato paso a paso: eliges las cláusulas y el sistema lo redacta. Se llena solo con los datos del empleado.
          </p>
        </div>
        {puedeConfig && (
          <Button onClick={irNueva} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nueva plantilla
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : plantillas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p>Aún no hay plantillas de contrato.</p>
          {puedeConfig && (
            <Button variant="outline" onClick={irNueva} className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" /> Crear la primera
            </Button>
          )}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {plantillas.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.nombre}</span>
                    {!p.activa && <Badge variant="secondary">Inactiva</Badge>}
                    {!p.config && p.cuerpo && <Badge variant="outline">Texto (formato anterior)</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p.config ? resumenClausulas(p.config) : (p.cuerpo ?? '').replace(/\s+/g, ' ').slice(0, 90) + '…'}
                  </div>
                </div>
                {puedeConfig && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => irEditar(p.id)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setABorrar(p)} aria-label="Borrar">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(o) => !o && setABorrar(null)}
        title="Borrar plantilla"
        description={aBorrar ? `Se borrará "${aBorrar.nombre}". Los contratos ya generados con ella se conservan.` : ''}
        confirmLabel="Borrar"
        onConfirm={borrar}
        destructive
      />
    </div>
  );
}
