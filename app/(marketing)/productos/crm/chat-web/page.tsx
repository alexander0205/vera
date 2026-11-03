import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('chat-web');

export default function Pagina() {
  return <Subpagina clave="chat-web" />;
}
