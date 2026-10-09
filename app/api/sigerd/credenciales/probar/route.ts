import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { respuestaError } from '@/lib/sigerd/api-errores';
import { probarCredencialesSigerd, respuestaSinCredenciales } from '@/lib/sigerd/sesion-auto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sigerd/credenciales/probar — ¿el portal acepta las credenciales
 * guardadas? Y si las acepta, ¿de qué centro son?
 *
 * Es lo que le da sentido a «Conectar» en el asistente. Antes el paso salía
 * marcado con ✓ con solo haber guardado usuario y contraseña, sin que nadie
 * las hubiera probado jamás: en producción, las tres empresas con credenciales
 * seguían «sin probar contra el portal».
 *
 * Entra SOLO con lo guardado —no con la cookie del navegador—, porque lo que se
 * prueba es la contraseña. El resultado queda anotado en la ficha
 * (`verificado_en` + centro, o `ultimo_error`).
 *
 * Mismo permiso que guardar las credenciales.
 */
export async function POST() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  try {
    const centro = await probarCredencialesSigerd(auth.teamId);
    if (centro === null) return respuestaSinCredenciales();
    return NextResponse.json({ ok: true, ...centro });
  } catch (e) {
    return respuestaError(e);
  }
}
