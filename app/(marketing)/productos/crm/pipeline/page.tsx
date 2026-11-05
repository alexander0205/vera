import { metadataDeSubpagina, Subpagina } from '../_subpagina';
import { ModuloPipeline } from '../_modulos';

export const metadata = metadataDeSubpagina('pipeline');

export default function Pagina() {
  return <Subpagina clave="pipeline" modulo={<ModuloPipeline />} />;
}
