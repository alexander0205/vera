import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('seguimiento');

export default function Pagina() {
  return <Subpagina clave="seguimiento" />;
}
