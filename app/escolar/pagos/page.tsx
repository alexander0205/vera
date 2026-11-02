import { Suspense } from 'react';
import PagosEscolaresClient from './_page-client';

export default function PagosEscolaresPage() {
  // La pestaña y el comprobante abierto se leen de la URL (useSearchParams).
  return (
    <Suspense>
      <PagosEscolaresClient />
    </Suspense>
  );
}
