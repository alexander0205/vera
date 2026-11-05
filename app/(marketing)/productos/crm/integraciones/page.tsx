import { metadataDeSubpagina, Subpagina } from '../_subpagina';
import { CatalogoIntegraciones } from '../_integraciones';

export const metadata = metadataDeSubpagina('integraciones');

export default function Pagina() {
  return <Subpagina clave="integraciones" despues={<CatalogoIntegraciones />} />;
}
