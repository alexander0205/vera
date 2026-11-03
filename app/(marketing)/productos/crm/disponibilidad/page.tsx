import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('disponibilidad');

export default function Pagina() {
  return <Subpagina clave="disponibilidad" />;
}
