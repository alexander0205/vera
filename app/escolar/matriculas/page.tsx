import { Suspense } from 'react';
import MatriculasClient from './_page-client';

export default function Page() {
  // El listado lee sus filtros, su página y la matrícula seleccionada de la
  // query (?q=, ?periodo=, ?estado=, ?page=, ?matricula=), y `useSearchParams`
  // exige un límite de Suspense por encima.
  return (
    <Suspense>
      <MatriculasClient />
    </Suspense>
  );
}
