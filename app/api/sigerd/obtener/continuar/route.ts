import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { SigerdError } from '@/lib/sigerd/types';
import { respuestaError } from '@/lib/sigerd/api-errores';
import { conClienteSigerd, respuestaSinCredenciales } from '@/lib/sigerd/sesion-auto';
import { continuarObtencion, SinTandaError } from '@/lib/administracion-escolar/obtener-sigerd';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Sigue una «Obtener información» que no cupo en una llamada: pide la siguiente
 * tanda de fichas y la guarda. La pantalla la llama mientras la respuesta sea
 * `corriendo`.
 *
 * Respuestas:
 *   200 `{ estado:'corriendo', hechos, total }` (quedan fichas: volver a llamar)
 *   200 `{ estado:'completado', … }`
 *   200 `{ estado:'error', mensaje }`           (SIGERD caído — reintentar luego)
 *   409 `{ codigo:'tanda-en-curso' | 'nada-en-curso', error }`
 *   401 sin sesión SIGERD ni credenciales guardadas (`codigo: 'sin-credenciales'`)
 */
export async function POST() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  try {
    const r = await conClienteSigerd(
      auth.teamId,
      (cli) => continuarObtencion(cli, { teamId: auth.teamId }),
      { verificarCookie: true },
    );
    if (r === null) return respuestaSinCredenciales();
    return NextResponse.json(r.datos);
  } catch (e) {
    if (e instanceof SinTandaError) {
      return NextResponse.json({ error: e.message, codigo: e.motivo }, { status: 409 });
    }
    if (e instanceof SigerdError) return respuestaError(e);
    console.error('[sigerd/obtener/continuar] fallo:', e);
    return NextResponse.json({ error: 'No se pudo seguir la descarga.', codigo: 'error' }, { status: 500 });
  }
}
