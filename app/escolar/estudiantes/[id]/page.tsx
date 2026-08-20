import { Suspense } from 'react';
import PerfilEstudianteClient from './_perfil-client';

export default async function EstudiantePerfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // La ficha lee la pestaña activa de la query (?tab=, ?v=), y `useSearchParams`
  // exige un límite de Suspense por encima.
  return (
    <Suspense>
      <PerfilEstudianteClient id={parseInt(id)} />
    </Suspense>
  );
}
