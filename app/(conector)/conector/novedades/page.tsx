import { paginaDocs } from '@/lib/mcp/docs';
import { PaginaDocs } from '../_docs';
import { metadatosDe } from '../_metadatos';

const pagina = paginaDocs('novedades');

export const metadata = metadatosDe(pagina);

export default function Pagina() {
  return <PaginaDocs pagina={pagina} />;
}
