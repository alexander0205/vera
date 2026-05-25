import { getUser } from '@/lib/db/queries';
import { me } from '@/lib/ecf-api/client';

/**
 * Ambiente DGII bajo el que opera el software (TesteCF/CerteCF/Produccion).
 * Fuente de verdad: ecf-api /me → software.ambienteDefault.
 * El nav muestra un badge de advertencia cuando no es Produccion.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json(null, { status: 401 });

  try {
    const info = await me();
    return Response.json({ ambiente: info.software.ambienteDefault });
  } catch (e) {
    console.error('[api/sistema/ambiente] ecf-api /me error:', e);
    return Response.json({ ambiente: null });
  }
}
