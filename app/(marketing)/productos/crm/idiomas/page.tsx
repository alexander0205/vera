import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('idiomas');

export default function Pagina() {
  return <Subpagina clave="idiomas" />;
}
