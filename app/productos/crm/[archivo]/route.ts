/**
 * Los archivos de Zero CRM para quien lo lee con un modelo, junto a cada página:
 *
 *  - `/productos/crm/<página>.md`: la subpágina en texto limpio.
 *  - `/productos/crm/capacidades.json`: cada capacidad con su estado, su página
 *    y las funciones del catálogo que cubre, y su esquema en
 *    `capacidades.schema.json`.
 *
 * Todo se genera al compilar desde `lib/agentes/crm.ts`: el mismo contenido que
 * se ve en las páginas, nunca uno paralelo. Lo que no está en la lista es 404.
 */

import { PAGINAS_CRM, type ClaveCrm } from '@/lib/agentes/crm-rutas';
import { subpaginaMarkdown } from '@/lib/agentes/crm';
import { ESQUEMA_CAPACIDADES, capacidadesJson } from '@/lib/agentes/crm-capacidades';

export const dynamic = 'force-static';
export const dynamicParams = false;

const CAPACIDADES = 'capacidades.json';
const ESQUEMA = 'capacidades.schema.json';

export function generateStaticParams() {
  return [...PAGINAS_CRM.map(p => ({ archivo: `${p.clave}.md` })), { archivo: CAPACIDADES }, { archivo: ESQUEMA }];
}

const CACHE = 'public, max-age=3600, s-maxage=86400';

export async function GET(_req: Request, { params }: { params: Promise<{ archivo: string }> }) {
  const { archivo } = await params;

  if (archivo === CAPACIDADES || archivo === ESQUEMA) {
    const cuerpo = archivo === CAPACIDADES ? capacidadesJson() : ESQUEMA_CAPACIDADES;
    return new Response(JSON.stringify(cuerpo, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': CACHE, 'Access-Control-Allow-Origin': '*' },
    });
  }

  const clave = archivo.endsWith('.md') ? archivo.slice(0, -3) : '';
  if (!PAGINAS_CRM.some(p => p.clave === clave)) return new Response('No encontrado', { status: 404 });

  return new Response(subpaginaMarkdown(clave as ClaveCrm), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': CACHE },
  });
}
