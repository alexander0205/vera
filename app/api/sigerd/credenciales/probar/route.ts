import { NextResponse, type NextRequest } from 'next/server';
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
export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;

  // Body opcional `{ idCentro }`: el perfil que el colegio eligió cuando el
  // portal respondió `perfil-requerido` (409, con la lista en `perfiles`). Si
  // entra, queda guardado y las descargas usan ese centro desde entonces.
  const body = await req.json().catch(() => ({}));
  const idCentro = Number(body?.idCentro);
  const elegido = Number.isInteger(idCentro) && idCentro > 0 ? idCentro : undefined;

  try {
    const centro = await probarCredencialesSigerd(auth.teamId, elegido);
    if (centro === null) return respuestaSinCredenciales();
    return NextResponse.json({ ok: true, ...centro });
  } catch (e) {
    return respuestaError(e);
  }
}
