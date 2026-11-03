import { metadataDeSubpagina, Subpagina } from '../_subpagina';
import { ModuloCitas } from '../_modulos';

export const metadata = metadataDeSubpagina('citas');

export default function Pagina() {
  return <Subpagina clave="citas" modulo={<ModuloCitas />} />;
}
