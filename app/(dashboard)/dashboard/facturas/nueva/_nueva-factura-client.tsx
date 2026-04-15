'use client';

/**
 * Wrapper cliente con ssr:false para evitar el mismatch de aria-ids
 * de Radix UI durante la hidratación en Next.js 15.
 * Recibe los datos del perfil de empresa desde el server component padre.
 */
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { EmpresaPerfil } from './page';

const NuevaFacturaForm = dynamic(() => import('./NuevaFacturaForm'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
    </div>
  ),
});

export default function NuevaFacturaFormClient({ initialPerfil }: { initialPerfil: EmpresaPerfil | null }) {
  return <NuevaFacturaForm initialPerfil={initialPerfil} />;
}
