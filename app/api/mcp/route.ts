// app/api/mcp/route.ts
/**
 * Endpoint MCP de solo lectura. Cada tool llama por HTTP a su ruta hermana
 * bajo /api/mcp/v1/*, reenviando el mismo Bearer key que llegó en esta
 * request — nunca toca la base de datos directamente desde aquí.
 *
 * Qué herramientas hay NO se decide aquí: salen del registro único
 * `lib/mcp/herramientas.ts`, que también alimenta la documentación de
 * mcp.zero.com.do. Se sirve por dos puertas: `app.zero.com.do/api/mcp` (la de
 * siempre) y `mcp.zero.com.do/mcp`, que el proxy reescribe hasta aquí.
 */
import { NextRequest } from 'next/server';
import { createMcpHandler } from 'mcp-handler';
import { requireApiKey } from '@/lib/auth/api-key-guard';
import { baseDeEnlaces } from '@/lib/config/enlaces';
import { SERVIDOR_MCP } from '@/lib/mcp/herramientas';
import { registrarHerramientas } from '@/lib/mcp/registrar';

/** Las dos direcciones públicas del conector. La segunda llega aquí reescrita por `proxy.ts`. */
const ENDPOINT_APP = '/api/mcp';
const ENDPOINT_MCP = '/mcp';

function construirHandler(origin: string, authHeader: string, endpoint: string) {
  async function llamar(path: string, params: Record<string, string | undefined> = {}) {
    const url = new URL(`/api/mcp/v1${path}`, origin);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
    const res = await fetch(url, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
      ...(res.ok ? {} : { isError: true as const }),
    };
  }

  return createMcpHandler(
    (server) => registrarHerramientas(server, llamar),
    // Lo que el conector dice de sí mismo en `initialize`. Sin esto salía
    // «mcp-typescript server on vercel 0.1.0», el valor por defecto de la
    // librería.
    { serverInfo: { name: SERVIDOR_MCP.nombre, version: SERVIDOR_MCP.version } },
    { streamableHttpEndpoint: endpoint, disableSse: true },
  );
}

async function manejar(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;

  const authHeader = req.headers.get('authorization')!;

  /**
   * La librería compara el camino de `req.url` con `streamableHttpEndpoint` y,
   * si no coinciden, contesta 404. Cuando el proxy reescribe `mcp.zero.com.do/mcp`
   * hasta esta ruta, Next conserva en `req.url` el camino que pidió el cliente
   * (`/mcp`), no el destino (`/api/mcp`) — se comprobó con un registro en
   * local —, así que se le dice a la librería cuál de las dos puertas es.
   * Solo hay dos posibles; cualquier otra cosa cae en la de siempre y la
   * librería la rechaza.
   */
  const endpoint = new URL(req.url).pathname === ENDPOINT_MCP ? ENDPOINT_MCP : ENDPOINT_APP;
  /**
   * La base sale del entorno, NO de la petición.
   *
   * Antes era `new URL(req.url).origin`, y eso lo decide quien llama: mandando
   * `X-Forwarded-Proto: https` el origen pasaba a `https://…` y TODAS las tools
   * fallaban («fetch failed»). No es solo un ataque: cualquier proxy que
   * termine TLS —nginx, Cloudflare, el de Vercel— manda esa cabecera de forma
   * legítima, así que en cuanto esto saliera a producción detrás de un proxy el
   * MCP dejaba de funcionar entero, aunque en local fuera perfecto.
   *
   * `baseDeEnlaces()` es justo para esto: el propio módulo dice que se usa
   * «cuando NO hay petición de la que sacarla», y una llamada de servidor a
   * servidor que además lleva la key del cliente encaja ahí. Ninguna cabecera
   * la mueve.
   */
  const handler = construirHandler(baseDeEnlaces(), authHeader, endpoint);
  return handler(req);
}

export { manejar as GET, manejar as POST };
