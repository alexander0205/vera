import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarGrados, adminEscolarCursos } from '@/lib/db/schema';
import { invalidarEstructura } from '@/lib/cache/escolar';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { nombre, nivel, orden, activo } = await req.json();

  const [row] = await db.update(adminEscolarGrados)
    .set({
      ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
      ...(nivel !== undefined ? { nivel: nivel?.trim() || null } : {}),
      ...(orden !== undefined ? { orden: Number(orden) || 0 } : {}),
      ...(activo !== undefined ? { activo: !!activo } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarGrados.id, parseInt(id)), eq(adminEscolarGrados.teamId, auth.teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  invalidarEstructura(auth.teamId);
  return NextResponse.json({ grado: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const gradoId = parseInt(id);

  // No borrar un grado que aún tiene secciones (matrículas cuelgan de ellas).
  const [seccion] = await db.select({ id: adminEscolarCursos.id }).from(adminEscolarCursos)
    .where(and(eq(adminEscolarCursos.gradoId, gradoId), eq(adminEscolarCursos.teamId, auth.teamId)))
    .limit(1);
  if (seccion) {
    return NextResponse.json(
      { error: 'Este grado tiene secciones. Elimina las secciones primero.' },
      { status: 409 },
    );
  }

  const [row] = await db.delete(adminEscolarGrados)
    .where(and(eq(adminEscolarGrados.id, gradoId), eq(adminEscolarGrados.teamId, auth.teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  invalidarEstructura(auth.teamId);
  return NextResponse.json({ ok: true });
}
