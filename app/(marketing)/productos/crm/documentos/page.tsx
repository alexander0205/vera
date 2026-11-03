import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('documentos');

export default function Pagina() {
  return <Subpagina clave="documentos" />;
}
