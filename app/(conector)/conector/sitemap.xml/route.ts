import { CONECTOR_ACTUALIZADO, PAGINAS_DOCS, urlDocs } from '@/lib/mcp/conector';
import { respuestaDeTexto } from '../_texto-plano';

/** `mcp.zero.com.do/sitemap.xml` — las cuatro páginas de la documentación. */
export const dynamic = 'force-static';

export function GET() {
  const urls = PAGINAS_DOCS.map(
    (p) => `  <url><loc>${urlDocs(p.ruta)}</loc><lastmod>${CONECTOR_ACTUALIZADO}</lastmod></url>`,
  ).join('\n');
  return respuestaDeTexto(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    'application/xml',
  );
}
