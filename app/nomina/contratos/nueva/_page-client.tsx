'use client';

import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { PlantillaWizard } from '../plantilla-wizard';

/**
 * Nueva plantilla de contrato en su propia página (no modal): cerrar por accidente
 * no borra lo configurado (pedido de Alex).
 */
export default function NuevaPlantillaClient() {
  const router = useRouter();
  const volver = () => router.push('/nomina/contratos');

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FileText className="h-6 w-6 text-zero-600" /> Nueva plantilla
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Arma el contrato paso a paso. Lo configurado se conserva mientras estés en esta página.
        </p>
      </div>

      <PlantillaWizard editando={null} onCancel={volver} onSaved={volver} />
    </div>
  );
}
