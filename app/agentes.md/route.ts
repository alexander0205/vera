import { agentesMarkdown, RUTA_AGENTES } from '@/lib/agentes/contenido';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';

/**
 * `/agentes.md` — la página `/agentes` en texto limpio.
 *
 * Un modelo lee esto con una fracción del esfuerzo que le cuesta el HTML: sin
 * menú, sin estilos, sin nada que no sea el dato. El contenido es el mismo de
 * la página porque sale del mismo sitio (`lib/agentes/contenido.ts`).
 *
 * La cabecera `Link` dice cuál es la versión canónica, para que un buscador no
 * las tome por dos páginas que compiten.
 */

export const dynamic = 'force-static';

export function GET() {
  return new Response(agentesMarkdown(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      Link: `<${SITIO_PUBLICO}${RUTA_AGENTES}>; rel="canonical"`,
    },
  });
}
