import { Suspense } from 'react';
import EstudiantesClient from './_page-client';

export default function Page() {
  // El listado lee sus filtros y el alumno seleccionado de la query
  // (?q=, ?curso=, ?estado=, ?page=, ?alumno=), y `useSearchParams` exige un
  // límite de Suspense por encima.
  return (
    <Suspense>
      <EstudiantesClient />
    </Suspense>
  );
}
