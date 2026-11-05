import { metadataDeSubpagina, Subpagina } from '../_subpagina';
import { ModuloReportes } from '../_modulos';

export const metadata = metadataDeSubpagina('reportes');

export default function Pagina() {
  return <Subpagina clave="reportes" modulo={<ModuloReportes />} />;
}
