import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('seguridad');

export default function Pagina() {
  return <Subpagina clave="seguridad" />;
}
