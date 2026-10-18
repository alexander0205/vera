/**
 * Registra en un servidor MCP todas las herramientas del registro.
 *
 * Es lo único que `app/api/mcp/route.ts` sabe de las herramientas: recorre
 * `HERRAMIENTAS_MCP` y, por cada una, la declara con su título, descripción,
 * esquema y anotaciones, y la conecta a la ruta HTTP hermana. Separado de la
 * ruta para poder probarlo sin base de datos ni red (ver
 * `tests/unit/mcp-herramientas.test.ts`): se le pasa un servidor de verdad y una
 * función `llamar` falsa.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { HERRAMIENTAS_MCP, peticionHttp } from './herramientas';

/** Hace la llamada HTTP a `/api/mcp/v1{ruta}` con la llave de quien pregunta. */
export type Llamar = (
  ruta: string,
  consulta: Record<string, string | undefined>,
) => Promise<CallToolResult>;

export function registrarHerramientas(server: McpServer, llamar: Llamar): void {
  for (const h of HERRAMIENTAS_MCP) {
    server.registerTool(
      h.nombre,
      {
        title: h.titulo,
        description: h.descripcion,
        inputSchema: h.inputSchema,
        annotations: h.annotations,
      },
      async (args: Record<string, unknown>) => {
        const { ruta, consulta } = peticionHttp(h, args);
        return llamar(ruta, consulta);
      },
    );
  }
}
