import { NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { revisarCambiosSigerd } from '@/lib/administracion-escolar/cambios-sigerd';

// Lee el volcado de SIGERD (varios MB con las fichas): sin caché de ruta, pero
// tampoco se llama al portal.
export const dynamic = 'force-dynamic';

/**
 * «Revisar cambios de SIGERD»: qué es distinto entre la ÚLTIMA DESCARGA y lo que
 * hay en Zero, en el año escolar activo.
 *
 * No toca el portal. Para comparar contra lo de hoy hay que volver a bajar
 * (`POST /api/sigerd/obtener`); la respuesta trae la fecha de la descarga que
 * se está comparando para que la pantalla lo diga.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  return NextResponse.json(await revisarCambiosSigerd(auth.teamId));
}
