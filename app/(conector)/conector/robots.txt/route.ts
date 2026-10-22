import { MCP_BASE } from '@/lib/mcp/conector';
import { respuestaDeTexto } from '../_texto-plano';

/**
 * `mcp.zero.com.do/robots.txt`. Propio del subdominio: el del sitio público
 * apunta a su propio mapa y cierra rutas de la aplicación que aquí no existen.
 *
 * La documentación está abierta para todos, buscadores y rastreadores de IA
 * incluidos —es justo para que la lean—. `/mcp` no es una página sino el
 * conector, que solo contesta a POST con una llave: no hay nada que indexar.
 */
export const dynamic = 'force-static';

export function GET() {
  return respuestaDeTexto(
    `User-agent: *\nAllow: /\nDisallow: /mcp\n\nSitemap: ${MCP_BASE}/sitemap.xml\n`,
    'text/plain',
  );
}
