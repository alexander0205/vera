import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCursos, adminEscolarGrados } from '@/lib/db/schema';
import { cachearPorTag, invalidarEstructura, tagEstructura } from '@/lib/cache/escolar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, and, asc } from 'drizzle-orm';

/**
 * Secciones (A, B, C…). Tabla física `admin_escolar_cursos`; en producto es la
 * SECCIÓN de un grado. `?gradoId=N` filtra las de un grado.
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const gradoId = Number(req.nextUrl.searchParams.get('gradoId')) || null;

  const rows = await cachearPorTag(
    () => db.select().from(adminEscolarCursos)
      .where(gradoId
        ? and(eq(adminEscolarCursos.teamId, teamId), eq(adminEscolarCursos.gradoId, gradoId))
        : eq(adminEscolarCursos.teamId, teamId))
      .orderBy(asc(adminEscolarCursos.orden), asc(adminEscolarCursos.nombre)),
    ['escolar', 'cursos', String(teamId), String(gradoId ?? 'todos')],
    [tagEstructura(teamId)],
  )();
  return NextResponse.json({ cursos: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { gradoId, nombre, nivel, orden, activo, cupo } = await req.json();

  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  const gId = Number(gradoId);
  if (!gId) return NextResponse.json({ error: 'Grado requerido' }, { status: 400 });

  // El grado debe ser del mismo team.
  const [grado] = await db.select({ id: adminEscolarGrados.id }).from(adminEscolarGrados)
    .where(and(eq(adminEscolarGrados.id, gId), eq(adminEscolarGrados.teamId, teamId))).limit(1);
  if (!grado) return NextResponse.json({ error: 'Grado no encontrado' }, { status: 404 });

  const [row] = await db.insert(adminEscolarCursos).values({
    teamId,
    gradoId: gId,
    nombre: nombre.trim(),
    nivel: nivel?.trim() || null,
    cupo: cupo != null ? Number(cupo) || null : null,
    orden: orden ?? 0,
    activo: activo ?? true,
  }).returning();
  invalidarEstructura(teamId);
  return NextResponse.json({ curso: row });
}
