import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCursos, adminEscolarMatriculas } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { nombre, nivel, orden, activo } = await req.json();
  const [row] = await db.update(adminEscolarCursos)
    .set({
      ...(nombre !== undefined ? { nombre: nombre.trim() } : {}),
      ...(nivel !== undefined ? { nivel: nivel?.trim() || null } : {}),
      ...(orden !== undefined ? { orden } : {}),
      ...(activo !== undefined ? { activo } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarCursos.id, parseInt(id)), eq(adminEscolarCursos.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ curso: row });
}

/** Elimina una sección. Bloquea si tiene matrículas (estudiantes inscritos). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const cursoId = parseInt(id);

  const [mat] = await db.select({ id: adminEscolarMatriculas.id }).from(adminEscolarMatriculas)
    .where(and(eq(adminEscolarMatriculas.cursoId, cursoId), eq(adminEscolarMatriculas.teamId, teamId)))
    .limit(1);
  if (mat) {
    return NextResponse.json(
      { error: 'Esta sección tiene estudiantes matriculados. Muévelos antes de eliminarla.' },
      { status: 409 },
    );
  }

  const [row] = await db.delete(adminEscolarCursos)
    .where(and(eq(adminEscolarCursos.id, cursoId), eq(adminEscolarCursos.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
