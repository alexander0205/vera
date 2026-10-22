import { respuestaMarkdown } from '../_texto-plano';

/** `/seguridad.md` — la página en texto limpio, para quien la lee con un modelo. */
export const dynamic = 'force-static';

export function GET() {
  return respuestaMarkdown('seguridad');
}
