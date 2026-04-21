'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { EmpresaPerfil } from '../../nueva/page';
import type { BorradorInicial } from '../../nueva/NuevaFacturaForm';

const NuevaFacturaForm = dynamic(() => import('../../nueva/NuevaFacturaForm'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
    </div>
  ),
});

export default function EditarBorradorClient({
  initialPerfil,
  initialData,
}: {
  initialPerfil: EmpresaPerfil | null;
  initialData:   BorradorInicial;
}) {
  return <NuevaFacturaForm initialPerfil={initialPerfil} initialData={initialData} />;
}
