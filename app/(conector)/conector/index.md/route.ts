import { respuestaMarkdown } from '../_texto-plano';

/** `/index.md` — la página en texto limpio, para quien la lee con un modelo. */
export const dynamic = 'force-static';

export function GET() {
  return respuestaMarkdown('inicio');
}
