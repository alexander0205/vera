import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarCursos } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:configurar');
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
