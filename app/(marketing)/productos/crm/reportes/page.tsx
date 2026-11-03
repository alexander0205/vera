import { metadataDeSubpagina, Subpagina } from '../_subpagina';

export const metadata = metadataDeSubpagina('reportes');

export default function Pagina() {
  return <Subpagina clave="reportes" />;
}
