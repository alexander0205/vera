import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarMaterias } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { nombre, activo } = await req.json();
  const [row] = await db.update(adminEscolarMaterias)
    .set({
      ...(nombre !== undefined ? { nombre: nombre.trim() } : {}),
      ...(activo !== undefined ? { activo } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarMaterias.id, parseInt(id)), eq(adminEscolarMaterias.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ materia: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const [row] = await db.delete(adminEscolarMaterias)
    .where(and(eq(adminEscolarMaterias.id, parseInt(id)), eq(adminEscolarMaterias.teamId, teamId)))
    .returning({ id: adminEscolarMaterias.id });
  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
