import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCursos } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const rows = await db.select().from(adminEscolarCursos)
    .where(eq(adminEscolarCursos.teamId, teamId))
    .orderBy(asc(adminEscolarCursos.orden), asc(adminEscolarCursos.nombre));
  return NextResponse.json({ cursos: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { nombre, nivel, orden, activo } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  const [row] = await db.insert(adminEscolarCursos).values({
    teamId,
    nombre: nombre.trim(),
    nivel: nivel?.trim() || null,
    orden: orden ?? 0,
    activo: activo ?? true,
  }).returning();
  return NextResponse.json({ curso: row });
}
