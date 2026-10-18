import { paginaDocs } from '@/lib/mcp/docs';
import { PaginaDocs } from './_docs';
import { metadatosDe } from './_metadatos';

/** `mcp.zero.com.do/` — qué es el conector y cómo conectarlo. */
const pagina = paginaDocs('inicio');

export const metadata = metadatosDe(pagina);

export default function Inicio() {
  return <PaginaDocs pagina={pagina} />;
}
