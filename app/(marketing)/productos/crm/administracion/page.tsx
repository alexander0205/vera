import { metadataDeSubpagina, Subpagina } from '../_subpagina';
import { ModuloAdministracion } from '../_modulos';

export const metadata = metadataDeSubpagina('administracion');

export default function Pagina() {
  return <Subpagina clave="administracion" modulo={<ModuloAdministracion />} />;
}
