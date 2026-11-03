import { SITIO_PUBLICO } from '@/lib/config/enlaces';
import { crmMarkdown } from '@/lib/agentes/crm';
import { RUTA_CAPACIDADES } from '@/lib/agentes/crm-capacidades';
import { RUTA_MCP_PUBLICO } from '@/lib/agentes/crm-rutas';
import { preciosAdicionales, preciosDeLineas } from '@/lib/agentes/precios';

/**
 * `/llms-full.txt` — el texto entero de Zero CRM en un solo archivo.
 *
 * `llms.txt` es el mapa; este es el contenido: cada subpágina con el estado de
 * cada función, las preguntas frecuentes y los precios del catálogo. Sale del
 * mismo origen que las páginas (`lib/agentes/crm.ts`), así que no se desfasa.
 */

export const dynamic = 'force-static';

export function GET() {
  const cuerpo = `${crmMarkdown()}
## Precios de Zero

Salen del catálogo publicado en ${SITIO_PUBLICO}/precios.

${preciosDeLineas()}

${preciosAdicionales()}

## Para conectar un asistente

- Capacidades en JSON: ${SITIO_PUBLICO}${RUTA_CAPACIDADES}
- Servidor MCP público, de solo lectura, sin clave y sin datos de clientes: ${SITIO_PUBLICO}${RUTA_MCP_PUBLICO}
`;

  return new Response(cuerpo, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
  });
}
