import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('citas');

export default function Pagina() {
  return <Subpagina clave="citas" />;
}
