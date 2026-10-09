'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmpleadoWizard } from '../../wizard';
import { Empleado, fetcher, nombreCompleto } from '../../shared';

/**
 * Edición de empleado en su PROPIA página (no modal), igual que el alta. Trae la
 * ficha por id y la pasa al mismo asistente; al guardar o cancelar vuelve al
 * listado.
 */
export default function EditarEmpleadoClient({ id }: { id: string }) {
  const router = useRouter();
  const volver = () => router.push('/nomina/empleados');
  const { data, isLoading } = useSWR<{ empleado?: Empleado; error?: string }>(
    `/api/nomina/empleados/${id}`, fetcher,
  );
  const empleado = data?.empleado ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Pencil className="h-6 w-6 text-zero-600" /> Editar empleado
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {empleado ? nombreCompleto(empleado) : 'Actualiza los datos del empleado.'}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !empleado ? (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          <p>No se encontró este empleado.</p>
          <Button variant="outline" onClick={volver} className="mt-3">Volver al listado</Button>
        </div>
      ) : (
        <EmpleadoWizard
          editando={empleado}
          onCancel={volver}
          onSaved={volver}
        />
      )}
    </div>
  );
}
