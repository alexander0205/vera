/**
 * Dónde vive el conector MCP de Zero y su documentación.
 *
 * Constantes sin dependencias: las importan la ruta del conector, el proxy,
 * `lib/agentes/contenido.ts` (la página `/agentes`) y la documentación. Van en
 * su propio archivo para que ninguna de ésas arrastre a las otras.
 */

/** El subdominio. En `/` está la documentación; en `/mcp`, el conector. */
export const MCP_HOST = 'mcp.zero.com.do';
export const MCP_BASE = `https://${MCP_HOST}`;
/** La dirección que se pega en un asistente. */
export const MCP_URL = `${MCP_BASE}/mcp`;

/**
 * El nombre del servidor en el registro oficial de MCP. El espacio `do.com.zero`
 * es el dominio `zero.com.do` al revés, que es como el registro pide que se
 * escriba y lo que se verifica por DNS.
 */
export const NOMBRE_EN_REGISTRO = 'do.com.zero/zero';
/** El esquema de `server.json` contra el que se escribió. */
export const ESQUEMA_SERVER_JSON = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';

/** ISO. La fecha de la última vez que cambió algo de lo que dicen estas páginas. */
export const CONECTOR_ACTUALIZADO = '2026-10-18';

/** A dónde escribir ante un problema de seguridad. Es el mismo correo de soporte del sitio. */
export const CONTACTO_SOPORTE = 'soporte@zero.com.do';

/** Las páginas de la documentación: su ruta pública y la de su gemelo en texto. */
export const PAGINAS_DOCS = [
  { slug: 'inicio', ruta: '/', md: '/index.md', nombre: 'Inicio' },
  { slug: 'herramientas', ruta: '/herramientas', md: '/herramientas.md', nombre: 'Herramientas' },
  { slug: 'seguridad', ruta: '/seguridad', md: '/seguridad.md', nombre: 'Seguridad' },
  { slug: 'novedades', ruta: '/novedades', md: '/novedades.md', nombre: 'Novedades' },
] as const;

export type SlugDeDocs = (typeof PAGINAS_DOCS)[number]['slug'];

/** Dirección absoluta de una ruta de la documentación (`/` queda como `https://mcp.zero.com.do/`). */
export function urlDocs(ruta: string): string {
  return `${MCP_BASE}${ruta}`;
}
