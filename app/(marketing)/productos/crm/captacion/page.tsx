import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('captacion');

export default function Pagina() {
  return <Subpagina clave="captacion" />;
}
