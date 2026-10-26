import { NextResponse } from 'next/server';
import { and, asc, eq, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes, adminEscolarMatriculas } from '@/lib/db/schema';
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
export async function GET(req: Request) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;

  // Con `periodoId` (lo usa «Matricular en lote») se dejan fuera los que ya
  // tienen matrícula activa en ese año: no se pueden volver a matricular y solo
  // ensuciaban la lista —la revisión los marcaba «ya matriculados» después de
  // elegirlos—. Sin el parámetro, la lista es la de siempre (todos los activos).
  const periodoId = Number(new URL(req.url).searchParams.get('periodoId')) || null;
  let yaMatriculados: number[] = [];
  if (periodoId) {
    const filas = await db
      .select({ id: adminEscolarMatriculas.estudianteId })
      .from(adminEscolarMatriculas)
      .where(and(
        eq(adminEscolarMatriculas.teamId, auth.teamId),
        eq(adminEscolarMatriculas.periodoId, periodoId),
        eq(adminEscolarMatriculas.estado, 'activa'),
      ));
    yaMatriculados = filas.map((f) => f.id);
  }

  const estudiantes = await db
    .select({
      id: adminEscolarEstudiantes.id,
      nombres: adminEscolarEstudiantes.nombres,
      apellidos: adminEscolarEstudiantes.apellidos,
      codigo: adminEscolarEstudiantes.codigo,
      // Aunque aquí solo salen los activos, la pantalla que llena el
      // desplegable vuelve a filtrar por estado. Sin esta columna el filtro
      // dejaba la lista vacía y bloqueaba el botón de matricular.
      estado: adminEscolarEstudiantes.estado,
    })
    .from(adminEscolarEstudiantes)
    .where(and(
      eq(adminEscolarEstudiantes.teamId, auth.teamId),
      eq(adminEscolarEstudiantes.estado, 'activo'),
      yaMatriculados.length ? notInArray(adminEscolarEstudiantes.id, yaMatriculados) : undefined,
    ))
    .orderBy(asc(adminEscolarEstudiantes.apellidos), asc(adminEscolarEstudiantes.nombres));

  return NextResponse.json({ estudiantes });
}
