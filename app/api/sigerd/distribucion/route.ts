import { NextRequest } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { distribucionEstudiantes } from '@/lib/sigerd/consultas';
import { conSesionSigerd, faltaParametro, numero } from '@/lib/sigerd/ruta';

export const dynamic = 'force-dynamic';

/**
 * Distribución de estudiantes por sección, paginada.
 *
 * `GET /api/sigerd/distribucion?idServicioCentro=&idTipoPeriodo=&opcion=&pagina=&porPagina=`
 *
 * `opcion` la fija el portal según la pestaña del grid (sin distribuir vs.
 * distribuidos). No hay catálogo documentado, así que se pasa tal cual.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const idServicioCentro = numero(sp, 'idServicioCentro');
  const idTipoPeriodo = numero(sp, 'idTipoPeriodo');
  const opcion = numero(sp, 'opcion');

  if (idServicioCentro === null) return faltaParametro('idServicioCentro');
  if (idTipoPeriodo === null) return faltaParametro('idTipoPeriodo');
  if (opcion === null) return faltaParametro('opcion');

  return conSesionSigerd((cli) =>
    distribucionEstudiantes(cli, {
      idServicioCentro,
      idTipoPeriodo,
      opcion,
      pagina: Number(sp.get('pagina')) || 1,
      porPagina: Number(sp.get('porPagina')) || 25,
    }),
  );
}
