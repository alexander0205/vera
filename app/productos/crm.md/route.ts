import { crmMarkdown } from '@/lib/agentes/crm';
import { RUTA_CRM } from '@/lib/agentes/crm-rutas';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';

/**
 * `/productos/crm.md` — Zero CRM por partes, en texto limpio.
 *
 * Es lo que lee un asistente cuando le preguntan si el CRM hace algo. Sale de
 * `lib/agentes/crm.ts`, igual que las subpáginas.
 */

export const dynamic = 'force-static';

export function GET() {
  return new Response(crmMarkdown(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      Link: `<${SITIO_PUBLICO}${RUTA_CRM}>; rel="canonical"`,
    },
  });
}
