import { funcionesMarkdown, RUTA_FUNCIONES } from '@/lib/agentes/funciones';
import { SITIO_PUBLICO } from '@/lib/config/enlaces';

/**
 * `/funciones.md` — todo lo que hace Zero, en texto limpio.
 *
 * Es el catálogo que lee un asistente cuando le preguntan si Zero hace algo.
 * Sale de `lib/agentes/funciones.ts`, igual que la página `/funciones`.
 */

export const dynamic = 'force-static';

export function GET() {
  return new Response(funcionesMarkdown(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      Link: `<${SITIO_PUBLICO}${RUTA_FUNCIONES}>; rel="canonical"`,
    },
  });
}
