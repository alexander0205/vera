import { NextRequest } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { condicionFinalPorSeccion } from '@/lib/sigerd/consultas';
import { conSesionSigerd, faltaParametro, numero } from '@/lib/sigerd/ruta';

export const dynamic = 'force-dynamic';

/**
 * Estudiantes de una sección con su condición académica final.
 *
 * `GET /api/sigerd/condicion-final?idServicioCentro=&idGrado=&idSeccion=&anio=`
 *
 * Solo lectura. La condición sólo está definida en años ya cerrados.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const idServicioCentro = numero(sp, 'idServicioCentro');
  const idGrado = numero(sp, 'idGrado');
  const idSeccion = numero(sp, 'idSeccion');
  const idAnoLectivo = numero(sp, 'anio');

  if (idServicioCentro === null) return faltaParametro('idServicioCentro');
  if (idGrado === null) return faltaParametro('idGrado');
  if (idSeccion === null) return faltaParametro('idSeccion');
  if (idAnoLectivo === null) return faltaParametro('anio');

  return conSesionSigerd((cli) =>
    condicionFinalPorSeccion(cli, { idServicioCentro, idGrado, idSeccion, idAnoLectivo }),
  );
}
