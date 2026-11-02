import { Suspense } from 'react';
import PanelAvisosClient from './_panel-client';

export default function Page() {
  // La pestaña se lee de la URL (useSearchParams).
  return (
    <Suspense>
      <PanelAvisosClient />
    </Suspense>
  );
}
