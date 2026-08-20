import { NextRequest } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { estudiantesPorSeccion } from '@/lib/sigerd/consultas';
import { conSesionSigerd, faltaParametro, numero } from '@/lib/sigerd/ruta';

export const dynamic = 'force-dynamic';

/**
 * Estudiantes de una sección concreta.
 *
 * `GET /api/sigerd/estudiantes/por-seccion?idCentro=&idSeccion=`
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const idCentro = numero(sp, 'idCentro');
  const idSeccion = numero(sp, 'idSeccion');

  if (idCentro === null) return faltaParametro('idCentro');
  if (idSeccion === null) return faltaParametro('idSeccion');

  return conSesionSigerd((cli) => estudiantesPorSeccion(cli, { idCentro, idSeccion }));
}
