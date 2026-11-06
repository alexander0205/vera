/**
 * Sigue los trabajos de «Completar familias desde SIGERD» que quedaron a medias
 * (`lib/administracion-escolar/trabajo-familias-sigerd.ts`). La petición que
 * los empieza avanza la primera tanda; esto sigue el resto aunque nadie tenga
 * la pantalla abierta. Sin trabajos en marcha no hace nada.
 */

import { NextRequest, NextResponse } from 'next/server';
import { llamadaDeCronValida } from '@/lib/seguridad/cron';
import { avanzarFamiliasPendientes } from '@/lib/administracion-escolar/trabajo-familias-sigerd';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!llamadaDeCronValida(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  // Holgura antes del tope de la función: la última escritura tiene que entrar.
  return NextResponse.json(await avanzarFamiliasPendientes(240_000));
}
