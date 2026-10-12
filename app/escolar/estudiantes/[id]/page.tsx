import { Suspense } from 'react';
import { getEmpresaPerfil } from '@/lib/facturas/empresa-perfil';
import PerfilEstudianteClient from './_perfil-client';

export default async function EstudiantePerfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /*
    El emisor se resuelve AQUÍ, en el servidor, igual que en la ficha de la
    familia y en /dashboard/facturas/nueva: el cajón de facturar necesita RNC,
    razón social y secuencias ya resueltos. Pidiéndolos desde el cliente al
    abrirlo, se añadiría una espera justo en el gesto de facturar, que es el
    que tiene que ser inmediato.
  */
  const perfil = await getEmpresaPerfil();
  // La ficha lee la pestaña activa de la query (?tab=, ?v=), y `useSearchParams`
  // exige un límite de Suspense por encima.
  return (
    <Suspense>
      <PerfilEstudianteClient id={parseInt(id)} perfilEmpresa={perfil} />
    </Suspense>
  );
}
