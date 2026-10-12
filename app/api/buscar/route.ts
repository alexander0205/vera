/**
 * GET /api/buscar?q=...&modulo=escolar — el buscador de la cabecera.
 *
 * Una sola ruta para TODAS las fuentes: así los permisos y el filtro por
 * empresa se comprueban en un sitio y no ocho, y el navegador hace una
 * petición por pulsación en vez de una por módulo. El reparto por fuente, con
 * su permiso y su módulo, vive en lib/busqueda/global.ts.
 *
 * No lleva `requirePermission` de un permiso concreto a propósito: no hay un
 * permiso «buscar». Cada grupo comprueba el suyo dentro, y quien no tenga
 * ninguno recibe una lista vacía —que es lo correcto— en vez de un 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUser, getTeamIdForUser, getTeamRoleForUser } from '@/lib/db/queries';
import { buscarGlobal, MIN_CARACTERES } from '@/lib/busqueda/global';
import { MODULES, type ModuleKey } from '@/lib/config/modules';

export async function GET(req: NextRequest) {
  // Los tres a la vez y no en fila: van memoizados por request, pero
  // encadenados serían tres idas y vueltas a la base antes de empezar a buscar.
  const [user, teamId, teamRole] = await Promise.all([
    getUser(),
    getTeamIdForUser(),
    getTeamRoleForUser(),
  ]);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!teamId) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').trim();
  if (q.length < MIN_CARACTERES) return NextResponse.json({ grupos: [] });

  const modParam = sp.get('modulo');
  const moduloActual = (MODULES as readonly string[]).includes(modParam ?? '')
    ? (modParam as ModuleKey)
    : null;

  const grupos = await buscarGlobal({
    teamId,
    platformRole: user.platformRole,
    teamRole,
    q,
    moduloActual,
  });

  return NextResponse.json({ grupos });
}
