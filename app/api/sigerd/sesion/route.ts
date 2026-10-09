import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { SigerdClient } from '@/lib/sigerd/client';
import { borrarSesion, leerSesion } from '@/lib/sigerd/sesion-cookie';
import { respuestaError } from '@/lib/sigerd/api-errores';

export const dynamic = 'force-dynamic';

/**
 * Estado de la conexión con SIGERD del usuario actual.
 *
 * `verificar=1` comprueba contra el portal si la cookie sigue viva (cuesta un
 * request). Sin ese parámetro solo mira si tenemos sesión guardada.
 */
export async function GET(req: Request) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const sesion = await leerSesion();
  if (!sesion) return NextResponse.json({ conectado: false, perfil: null });

  const verificar = new URL(req.url).searchParams.get('verificar') === '1';
  if (!verificar) {
    return NextResponse.json({ conectado: true, perfil: sesion.perfil, desde: sesion.actualizadaEn });
  }

  try {
    const vivo = await SigerdClient.desdeSesion(sesion).estaAutenticado();
    if (!vivo) await borrarSesion();
    return NextResponse.json({ conectado: vivo, perfil: vivo ? sesion.perfil : null });
  } catch (e) {
    return respuestaError(e);
  }
}

/** Cierra la sesión en el portal y borra la cookie local. */
export async function DELETE() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const sesion = await leerSesion();
  if (sesion) {
    try {
      await SigerdClient.desdeSesion(sesion).cerrarSesion();
    } catch (e) {
      // El logout remoto es best-effort: lo importante es soltar la cookie local.
      console.warn('[sigerd] fallo al cerrar sesión remota:', e);
    }
  }

  await borrarSesion();
  return NextResponse.json({ conectado: false });
}
