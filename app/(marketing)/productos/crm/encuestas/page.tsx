import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('encuestas');

export default function Pagina() {
  return <Subpagina clave="encuestas" />;
}
