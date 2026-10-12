import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { buscarEstudiantes } from '@/lib/sigerd/consultas';
import { conSesionSigerdAuto } from '@/lib/sigerd/sesion-auto';

export const dynamic = 'force-dynamic';

/** Criterios con los que el portal acepta buscar. */
const CRITERIOS = ['nombres', 'primerApellido', 'segundoApellido', 'rne', 'nui', 'fechaNacimiento', 'idEstudiante', 'busqueda'] as const;

/**
 * Buscador de estudiantes de SIGERD.
 *
 * `GET /api/sigerd/estudiantes?nombres=&primerApellido=&rne=&nui=&pagina=&porPagina=`
 *
 * Hacia fuera es un GET porque solo lee; por dentro el portal exige POST
 * form-urlencoded.
 *
 * Ojo con el alcance: este endpoint del portal busca en el padrón NACIONAL, no
 * solo en el centro. Buscar "María" devuelve menores de cualquier escuela del
 * país. Por eso pide permiso de gestionar —no de ver—, exige un criterio y
 * limita cuánto trae de golpe.
 */
export async function GET(req: NextRequest) {
  // `gestionar` y no `ver`: esto consulta datos de menores de todo el país,
  // no la ficha de un alumno propio.
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;

  // El portal, sin criterios, devuelve vacío en vez de listar. Se corta aquí
  // para que la pantalla diga qué falta en vez de enseñar cero resultados y
  // dejar al usuario pensando que el alumno no existe.
  const hayCriterio = CRITERIOS.some((c) => (sp.get(c) ?? '').trim() !== '');
  if (!hayCriterio) {
    return NextResponse.json(
      { error: 'Escribe al menos un nombre o apellido para buscar.', codigo: 'sin-criterio' },
      { status: 400 },
    );
  }

  return conSesionSigerdAuto(auth.teamId, (cli) =>
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
