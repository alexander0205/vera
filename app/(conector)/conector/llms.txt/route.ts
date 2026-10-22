import { llmsTxt } from '@/lib/mcp/docs';
import { respuestaDeTexto } from '../_texto-plano';

/**
 * `mcp.zero.com.do/llms.txt` — el mapa de la documentación del conector para
 * quien la lee con un modelo. Sale del mismo registro de herramientas que el
 * conector: no puede nombrar una que no exista.
 */
export const dynamic = 'force-static';

export function GET() {
  return respuestaDeTexto(llmsTxt(), 'text/plain');
}
