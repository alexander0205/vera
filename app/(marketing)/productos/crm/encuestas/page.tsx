import { metadataDeSubpagina, Subpagina } from '../_subpagina';
import { ModuloEncuestas } from '../_modulos';

export const metadata = metadataDeSubpagina('encuestas');

export default function Pagina() {
  return <Subpagina clave="encuestas" modulo={<ModuloEncuestas />} />;
}
