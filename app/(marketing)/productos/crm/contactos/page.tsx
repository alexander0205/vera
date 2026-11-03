import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('contactos');

export default function Pagina() {
  return <Subpagina clave="contactos" />;
}
