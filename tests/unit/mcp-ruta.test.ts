/**
 * La ruta del conector (`app/api/mcp/route.ts`) por sus dos puertas:
 * `app.zero.com.do/api/mcp` y `mcp.zero.com.do/mcp`.
 *
 * El proxy reescribe `/mcp` hasta esta ruta, y Next deja en `req.url` el camino
 * que pidió el cliente (`/mcp`), no el destino. La librería `mcp-handler`
 * compara ese camino con su `streamableHttpEndpoint` y contesta 404 si no
 * coincide, así que la ruta tiene que decirle cuál de las dos puertas es. Aquí
 * se llama a la ruta tal como llegaría la petición de cada una, con el guard de
 * llaves y la red falsos.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { HERRAMIENTAS_MCP, SERVIDOR_MCP } from '@/lib/mcp/herramientas';

vi.mock('@/lib/auth/api-key-guard', () => ({
  requireApiKey: vi.fn(async () => ({ ok: true, teamId: 1, apiKeyId: 1 })),
}));

const { POST, GET } = await import('@/app/api/mcp/route');

const BASE = 'http://base-de-prueba.test';
const AUTORIZACION = 'Bearer emdo_de_prueba';

function llamarRuta(url: string, cuerpo: unknown, metodo = 'POST') {
  return new NextRequest(url, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: AUTORIZACION,
    },
    ...(metodo === 'POST' ? { body: JSON.stringify(cuerpo) } : {}),
  });
}

/** El cuerpo de una respuesta MCP, venga como JSON o como evento `data:`. */
async function leer(res: Response) {
  const texto = await res.text();
  const linea = texto.split('\n').find((l) => l.startsWith('data: '));
  return JSON.parse(linea ? linea.slice(6) : texto);
}

describe('la ruta del conector por sus dos puertas', () => {
  beforeEach(() => {
    vi.stubEnv('PLANTILLAS_BASE_URL', BASE);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  for (const url of ['http://app.localhost/api/mcp', 'http://mcp.localhost/mcp']) {
    describe(url, () => {
      it('initialize anuncia el servidor «zero» con su versión', async () => {
        const res = await POST(llamarRuta(url, {
          jsonrpc: '2.0', id: 1, method: 'initialize',
          params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'prueba', version: '0' } },
        }));
        expect(res.status).toBe(200);
        const j = await leer(res);
        expect(j.result.serverInfo).toEqual({ name: SERVIDOR_MCP.nombre, version: SERVIDOR_MCP.version });
      });

      it('tools/list devuelve las herramientas del registro con sus anotaciones', async () => {
        const res = await POST(llamarRuta(url, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
        expect(res.status).toBe(200);
        const { result } = await leer(res);
        expect(result.tools.map((t: { name: string }) => t.name)).toEqual(HERRAMIENTAS_MCP.map((h) => h.nombre));
        for (const t of result.tools) {
          expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
        }
      });

      it('tools/call llama a la ruta v1 con la misma llave y devuelve su cuerpo', async () => {
        const fetchFalso = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 7, nombre: 'Cliente de prueba' }));
        const res = await POST(llamarRuta(url, {
          jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_client', arguments: { id: 7 } },
        }));
        const { result } = await leer(res);
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.content[0].text)).toEqual({ id: 7, nombre: 'Cliente de prueba' });

        expect(fetchFalso).toHaveBeenCalledTimes(1);
        const [direccion, init] = fetchFalso.mock.calls[0];
        expect(String(direccion)).toBe(`${BASE}/api/mcp/v1/clientes/7`);
        expect((init?.headers as Record<string, string>).Authorization).toBe(AUTORIZACION);
      });

      it('una respuesta de error de la ruta v1 vuelve como error de la herramienta', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: 'no existe' }, { status: 404 }));
        const res = await POST(llamarRuta(url, {
          jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_client', arguments: { id: 1 } },
        }));
        const { result } = await leer(res);
        expect(result.isError).toBe(true);
      });

      it('GET no está permitido (no hay flujo de eventos)', async () => {
        const res = await GET(llamarRuta(url, undefined, 'GET'));
        expect(res.status).toBe(405);
      });
    });
  }

  it('un camino que no es ninguna de las dos puertas no llega al conector', async () => {
    const res = await POST(llamarRuta('http://mcp.localhost/otra-cosa', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    expect(res.status).toBe(404);
  });
});
