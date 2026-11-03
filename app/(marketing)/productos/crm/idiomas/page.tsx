import { metadataDeSubpagina, Subpagina } from '../_subpagina';
import { ModuloIdiomas } from '../_modulos';

export const metadata = metadataDeSubpagina('idiomas');

export default function Pagina() {
  return <Subpagina clave="idiomas" modulo={<ModuloIdiomas />} />;
}
