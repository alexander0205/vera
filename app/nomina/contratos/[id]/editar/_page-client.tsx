'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlantillaWizard } from '../../plantilla-wizard';
import { Plantilla, fetcher } from '../../shared';

/**
 * Edición de plantilla de contrato en su propia página (no modal). No hay GET por
 * id de plantilla, así que se trae la lista (pequeña) y se busca por id.
 */
export default function EditarPlantillaClient({ id }: { id: string }) {
  const router = useRouter();
  const volver = () => router.push('/nomina/contratos');
  const { data, isLoading } = useSWR<{ plantillas: Plantilla[] }>('/api/nomina/contratos/plantillas', fetcher);
  const plantilla = (data?.plantillas ?? []).find((p) => String(p.id) === id) ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FileText className="h-6 w-6 text-zero-600" /> Editar plantilla
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {plantilla ? plantilla.nombre : 'Ajusta las cláusulas de la plantilla.'}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !plantilla ? (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          <p>No se encontró esta plantilla.</p>
          <Button variant="outline" onClick={volver} className="mt-3">Volver a Contratos</Button>
        </div>
      ) : (
        <PlantillaWizard editando={plantilla} onCancel={volver} onSaved={volver} />
      )}
    </div>
  );
}
