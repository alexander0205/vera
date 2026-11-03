import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('bandeja');

export default function Pagina() {
  return <Subpagina clave="bandeja" />;
}
