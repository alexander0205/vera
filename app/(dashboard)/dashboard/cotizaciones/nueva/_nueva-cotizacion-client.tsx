'use client';

/**
 * Wrapper cliente con ssr:false — evita el mismatch de aria-ids de Radix UI
 * durante la hidratación (mismo patrón que Nueva Factura).
 */
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { EmpresaPerfil } from '../../facturas/nueva/utils/types';
import type { CotizacionInicial } from './NuevaCotizacionForm';

const NuevaCotizacionForm = dynamic(() => import('./NuevaCotizacionForm'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-zero-600" />
    </div>
  ),
});

export default function NuevaCotizacionFormClient({
  initialPerfil,
  initialData,
}: {
  initialPerfil: EmpresaPerfil | null;
  initialData?: CotizacionInicial | null;
}) {
  return <NuevaCotizacionForm initialPerfil={initialPerfil} initialData={initialData} />;
}
