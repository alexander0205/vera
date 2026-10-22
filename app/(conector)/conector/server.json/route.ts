import { serverJson } from '@/lib/mcp/server-json';

/**
 * `mcp.zero.com.do/server.json` — la ficha del servidor en el formato del
 * registro oficial de MCP. Ver `lib/mcp/server-json.ts` para qué exige el
 * registro antes de aceptarla.
 */
export const dynamic = 'force-static';

export function GET() {
  return new Response(JSON.stringify(serverJson(), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      // Un cliente de navegador (un registro, una herramienta de validación) puede leerlo.
      'Access-Control-Allow-Origin': '*',
    },
  });
}
