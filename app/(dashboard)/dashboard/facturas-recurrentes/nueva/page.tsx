'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const NuevaFacturaRecurrenteForm = dynamic(
  () => import('./NuevaFacturaRecurrenteForm'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    ),
  },
);

export default function NuevaFacturaRecurrentePage() {
  return <NuevaFacturaRecurrenteForm />;
}
