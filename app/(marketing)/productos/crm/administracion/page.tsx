import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('administracion');

export default function Pagina() {
  return <Subpagina clave="administracion" />;
}
