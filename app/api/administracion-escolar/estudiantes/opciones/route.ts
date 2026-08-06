import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

/**
 * Los estudiantes del colegio, en crudo, para llenar un desplegable.
 *
 * El listado normal pagina de 25 en 25 y de paso reconcilia saldos, trae
 * tutores y calcula deuda: todo eso sobra cuando lo único que hay que pintar es
 * un `<option>`. Peor aún, la paginación dejaba los desplegables mudos —un
 * colegio con 465 alumnos mostraba 25— porque quien los llenaba no pedía
 * `limit`.
 *
 * Aquí no hay paginación a propósito: son tres columnas por alumno, y partir la
 * lista rompería justamente lo que se viene a arreglar.
 */
export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  const estudiantes = await db
    .select({
      id: adminEscolarEstudiantes.id,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      codigo: adminEscolarEstudiantes.codigo,
    })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, auth.teamId),
      eq(adminEscolarEstudiantes.estado, 'activo'),
    ))
    .orderBy(asc(adminEscolarEstudiantes.apellidos), asc(adminEscolarEstudiantes.nombres));

  return NextResponse.json({ estudiantes });
}
