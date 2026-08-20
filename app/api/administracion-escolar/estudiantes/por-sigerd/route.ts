import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

/**
 * ¿Cuáles de estos alumnos de SIGERD ya están en nuestra base?
 *
 * `GET /api/administracion-escolar/estudiantes/por-sigerd?ids=37471945,37471946`
 *
 * Lo usa el buscador de SIGERD para marcar los resultados que ya existen. Sin
 * esto, la secretaria vuelve a crear un alumno que el cruce de SIGERD ya había
 * importado, y el colegio acaba con dos fichas del mismo niño —cada una con la
 * mitad de sus pagos.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const ids = (req.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Number.isInteger);

  if (ids.length === 0) return NextResponse.json({ existentes: [] });

  const filas = await db
    .select({
      id: adminEscolarEstudiantes.id,
      sigerdId: adminEscolarEstudiantes.sigerdId,
      codigo: adminEscolarEstudiantes.codigo,
    })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, auth.teamId),
      // Tope defensivo: la lista viene de una página del buscador, que como
      // mucho trae 25. Recortar evita un IN gigante si alguien llama a mano.
      inArray(adminEscolarEstudiantes.sigerdId, ids.slice(0, 100)),
    ));

  return NextResponse.json({ existentes: filas });
}
