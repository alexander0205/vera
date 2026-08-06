import { NextRequest } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { buscarEstudiantes } from '@/lib/sigerd/consultas';
import { conSesionSigerd } from '@/lib/sigerd/ruta';

export const dynamic = 'force-dynamic';

/**
 * Buscador de estudiantes de SIGERD.
 *
 * `GET /api/sigerd/estudiantes?nombres=&primerApellido=&rne=&nui=&pagina=&porPagina=`
 *
 * Hacia fuera es un GET porque solo lee; por dentro el portal exige POST
 * form-urlencoded. El portal requiere al menos un criterio: sin filtros
 * devuelve vacío en lugar del centro entero.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;

  return conSesionSigerd((cli) =>
    buscarEstudiantes(cli, {
      nombres: sp.get('nombres') ?? undefined,
      primerApellido: sp.get('primerApellido') ?? undefined,
      segundoApellido: sp.get('segundoApellido') ?? undefined,
      rne: sp.get('rne') ?? undefined,
      nui: sp.get('nui') ?? undefined,
      fechaNacimiento: sp.get('fechaNacimiento') ?? undefined,
      idEstudiante: sp.get('idEstudiante') ?? undefined,
      busqueda: sp.get('busqueda') ?? undefined,
      pagina: Number(sp.get('pagina')) || 1,
      porPagina: Number(sp.get('porPagina')) || 25,
    }),
  );
}
