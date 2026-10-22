import { urlDocs, type SlugDeDocs } from '@/lib/mcp/conector';
import { aMarkdown, paginaDocs } from '@/lib/mcp/docs';

/** Una respuesta de texto plano con las cabeceras que comparten todos los gemelos y archivos. */
export function respuestaDeTexto(cuerpo: string, tipo: string, canonica?: string): Response {
  return new Response(cuerpo, {
    headers: {
      'Content-Type': `${tipo}; charset=utf-8`,
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      ...(canonica ? { Link: `<${canonica}>; rel="canonical"` } : {}),
    },
  });
}

/**
 * El gemelo en texto de una página: el mismo contenido en Markdown, sin menú ni
 * estilos. La cabecera `Link` dice cuál es la versión canónica, para que un
 * buscador no las tome por dos páginas que compiten.
 */
export function respuestaMarkdown(slug: SlugDeDocs): Response {
  const pagina = paginaDocs(slug);
  return respuestaDeTexto(aMarkdown(pagina), 'text/markdown', urlDocs(pagina.ruta));
}
