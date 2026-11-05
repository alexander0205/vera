import { metadataDeSubpagina, Subpagina } from '../_subpagina';
import { ModuloSeguimiento } from '../_modulos';

export const metadata = metadataDeSubpagina('seguimiento');

export default function Pagina() {
  return <Subpagina clave="seguimiento" modulo={<ModuloSeguimiento />} />;
}
