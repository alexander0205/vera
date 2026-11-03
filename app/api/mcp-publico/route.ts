/**
 * MCP público del sitio: para que un asistente de IA consulte lo que dice
 * zero.com.do sobre Zero CRM y los precios, sin clave.
 *
 * Solo lectura y solo contenido publicado: las mismas páginas, capacidades y
 * precios que cualquiera ve en el sitio. No toca la base de datos ni conoce
 * clientes. El MCP del ERP, con llave por empresa, es otro: `app/api/mcp`.
 *
 * Tope por IP en memoria: en Vercel cada instancia lleva su cuenta, así que es
 * una primera barrera y no un límite exacto. Basta, porque aquí no hay nada que
 * proteger más allá del costo de atender.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';
import { ESTADOS, crmMarkdown, subpaginaMarkdown, type EstadoCrm } from '@/lib/agentes/crm';
import { PAGINAS_CRM, RUTA_MCP_PUBLICO, type ClaveCrm } from '@/lib/agentes/crm-rutas';
import { FUNCIONES_CRM, buscarCapacidades } from '@/lib/agentes/crm-capacidades';
import { preciosAdicionales, preciosDeLineas } from '@/lib/agentes/precios';

const POR_MINUTO = 60;

const texto = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const json = (v: unknown) => texto(JSON.stringify(v, null, 2));
const CLAVES = PAGINAS_CRM.map(p => p.clave) as [ClaveCrm, ...ClaveCrm[]];
const ESTADOS_CLAVE = Object.keys(ESTADOS) as [EstadoCrm, ...EstadoCrm[]];

const handler = createMcpHandler(server => {
  server.registerTool(
    'listar_paginas',
    {
      title: 'Listar las páginas de Zero CRM',
      description: 'Las partes de Zero CRM publicadas en zero.com.do, con su resumen, su dirección y su versión en texto.',
      inputSchema: z.object({}),
    },
    async () => json(PAGINAS_CRM.map(p => ({ pagina: p.clave, titulo: p.menu, resumen: p.resumen, url: `${SITIO_PUBLICO}${p.ruta}`, markdown: `${SITIO_PUBLICO}${p.ruta}.md` }))),
  );

  server.registerTool(
    'leer_pagina',
    {
      title: 'Leer una página de Zero CRM',
      description: 'El texto completo de una página, con el estado de cada función. Usa «resumen» para todas las partes juntas.',
      inputSchema: z.object({ pagina: z.enum(['resumen', ...CLAVES]).describe('Clave de la página, por ejemplo «seguimiento», o «resumen».') }),
    },
    async ({ pagina }) => texto(pagina === 'resumen' ? crmMarkdown() : subpaginaMarkdown(pagina as ClaveCrm)),
  );

  server.registerTool(
    'buscar_capacidades',
    {
      title: 'Buscar capacidades',
      description: 'Busca capacidades de Zero CRM por palabras y, si quieres, por estado. Cada resultado dice su estado, su página y las funciones del catálogo que cubre.',
      inputSchema: z.object({
        texto: z.string().max(200).optional().describe('Palabras a buscar, por ejemplo «encuesta» o «cita whatsapp».'),
        estado: z.enum(ESTADOS_CLAVE).optional().describe('disponible, activa (se activa por cliente), implementar (se conecta al implementar) o medida.'),
        limite: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ texto: t, estado, limite }) => json(buscarCapacidades(t, estado).slice(0, limite ?? 25)),
  );

  server.registerTool(
    'estado_capacidad',
    {
      title: 'Estado de una capacidad',
      description: 'Dice si una capacidad está disponible, se activa por cliente, se conecta al implementar o es a medida, y qué significa ese estado.',
      inputSchema: z.object({ capacidad: z.string().min(2).max(200).describe('Nombre o descripción corta, por ejemplo «consulta de estado».') }),
    },
    async ({ capacidad }) => {
      const hallazgos = buscarCapacidades(capacidad).slice(0, 5);
      if (!hallazgos.length) return texto(`No encontré «${capacidad}» en las páginas publicadas de Zero CRM. Prueba con otras palabras o usa listar_paginas.`);
      return json(hallazgos.map(c => ({ capacidad: c.titulo, estado: c.estadoNombre, significa: ESTADOS[c.estado].detalle, detalle: c.detalle, url: c.url })));
    },
  );

  server.registerTool(
    'catalogo_funciones',
    {
      title: 'Catálogo de funciones',
      description: 'El catálogo numerado de funciones de Zero CRM, que usan las capacidades para decir qué cubren.',
      inputSchema: z.object({}),
    },
    async () => json(FUNCIONES_CRM),
  );

  server.registerTool(
    'precios',
    {
      title: 'Precios de Zero',
      description: 'Los planes y precios publicados en zero.com.do/precios. Zero CRM se contrata aparte y se cotiza.',
      inputSchema: z.object({}),
    },
    async () => texto(`Precios publicados en ${SITIO_PUBLICO}/precios\n\n${preciosDeLineas()}\n\n${preciosAdicionales()}`),
  );
}, {
  serverInfo: { name: 'zero-sitio-publico', version: '1.0.0' },
  instructions: 'Contenido publicado en zero.com.do sobre Zero CRM y los precios de Zero. Solo lectura, sin datos de clientes. Cada capacidad dice su estado; repítelo tal cual.',
}, { streamableHttpEndpoint: RUTA_MCP_PUBLICO, disableSse: true, maxDuration: 30 });

function ipDe(req: NextRequest): string {
  return req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'sin-ip';
}

async function manejar(req: NextRequest) {
  const r = rateLimit(`mcp-publico:${ipDe(req)}`, POR_MINUTO, 60_000);
  if (!r.allowed) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32000, message: 'Demasiadas peticiones. Intenta de nuevo en un minuto.' }, id: null },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((r.reset - Date.now()) / 1000)) } },
    );
  }
  return handler(req);
}

export { manejar as GET, manejar as POST };
