import type { Metadata } from 'next';
import { urlDocs } from '@/lib/mcp/conector';
import type { PaginaDoc } from '@/lib/mcp/docs';

/**
 * Los metadatos de una página de la documentación.
 *
 * Todo sale de la propia página (`lib/mcp/docs.ts`) para que título,
 * descripción y gemelo en texto no se escriban dos veces. La dirección canónica
 * es SIEMPRE la del subdominio `mcp.`, aunque la página se sirva por otro host
 * del mismo despliegue.
 */
export function metadatosDe(pagina: PaginaDoc): Metadata {
  const url = urlDocs(pagina.ruta);
  return {
    // `absolute`: el título ya dice «conector MCP de Zero»; una plantilla lo repetiría.
    title: { absolute: pagina.tituloCorto },
    description: pagina.descripcion,
    alternates: {
      canonical: url,
      // El gemelo en texto: un agente que llegue a la página sabe por aquí
      // dónde está la versión que le cuesta menos leer.
      types: { 'text/markdown': urlDocs(pagina.md) },
    },
    openGraph: {
      type: 'article',
      url,
      title: pagina.tituloCorto,
      description: pagina.descripcion,
    },
  };
}
