// app/api/mcp/route.ts
/**
 * Endpoint MCP de solo lectura. Cada tool llama por HTTP a su ruta hermana
 * bajo /api/mcp/v1/*, reenviando el mismo Bearer key que llegó en esta
 * request — nunca toca la base de datos directamente desde aquí.
 */
import { NextRequest } from 'next/server';
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { requireApiKey } from '@/lib/auth/api-key-guard';
import { baseDeEnlaces } from '@/lib/config/enlaces';

function construirHandler(origin: string, authHeader: string) {
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

  return createMcpHandler((server) => {
    server.registerTool(
      'list_clients',
      { title: 'Listar clientes', description: 'Lista los clientes del tenant, con búsqueda opcional por nombre/RNC/email.',
        inputSchema: z.object({ q: z.string().optional(), limit: z.number().int().min(1).max(500).optional() }) },
      async ({ q, limit }) => llamar('/clientes', { q, limit: limit?.toString() }),
    );

    server.registerTool(
      'get_client',
      { title: 'Detalle de cliente', description: 'Obtiene un cliente por id.',
        inputSchema: z.object({ id: z.number().int().positive().safe() }) },
      async ({ id }) => llamar(`/clientes/${id}`),
    );

    server.registerTool(
      'list_invoices',
      { title: 'Listar facturas', description: 'Lista facturas con filtros opcionales (estado, estadoPago, clientId, desde, hasta, q).',
        inputSchema: z.object({
          q: z.string().optional(),
          estado: z.string().optional(),
          estadoPago: z.string().optional(),
          clientId: z.number().int().optional(),
          desde: z.string().optional(),
          hasta: z.string().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        }) },
      async (args) => llamar('/facturas', {
        q: args.q, estado: args.estado, estadoPago: args.estadoPago,
        clientId: args.clientId?.toString(), desde: args.desde, hasta: args.hasta,
        limit: args.limit?.toString(),
      }),
    );

    server.registerTool(
      'get_invoice',
      { title: 'Detalle de factura', description: 'Obtiene una factura por id.',
        inputSchema: z.object({ id: z.number().int().positive().safe() }) },
      async ({ id }) => llamar(`/facturas/${id}`),
    );

    server.registerTool(
      'list_recurring_invoices',
      { title: 'Listar facturas recurrentes', description: 'Lista los planes de facturación recurrente, con filtros opcionales (estado, clientId, q).',
        inputSchema: z.object({
          q: z.string().optional(),
          estado: z.string().optional(),
          clientId: z.number().int().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        }) },
      async (args) => llamar('/facturas-recurrentes', {
        q: args.q, estado: args.estado, clientId: args.clientId?.toString(), limit: args.limit?.toString(),
      }),
    );

    server.registerTool(
      'get_recurring_invoice',
      { title: 'Detalle de factura recurrente', description: 'Obtiene un plan de facturación recurrente por id.',
        inputSchema: z.object({ id: z.number().int().positive().safe() }) },
      async ({ id }) => llamar(`/facturas-recurrentes/${id}`),
    );

    server.registerTool(
      'get_accounts_receivable',
      { title: 'Cuentas por cobrar', description: 'Lista cuentas por cobrar con totales y antigüedad de saldo. Filtros opcionales: clientId, soloVencidas.',
        inputSchema: z.object({
          clientId: z.number().int().optional(),
          soloVencidas: z.boolean().optional(),
        }) },
      async (args) => llamar('/cuentas-por-cobrar', {
        clientId: args.clientId?.toString(),
        soloVencidas: args.soloVencidas ? 'true' : undefined,
      }),
    );
  }, {}, { streamableHttpEndpoint: '/api/mcp', disableSse: true });
}

async function manejar(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.response;

  const authHeader = req.headers.get('authorization')!;

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
  const handler = construirHandler(baseDeEnlaces(), authHeader);
  return handler(req);
}

export { manejar as GET, manejar as POST };
