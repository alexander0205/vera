import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { categorias } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;
  const { nombre, descripcion } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  const [row] = await db.update(categorias)
    .set({ nombre: nombre.trim(), descripcion: descripcion?.trim() || null })
    .where(and(eq(categorias.id, parseInt(id)), eq(categorias.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ categoria: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;
  await db.delete(categorias).where(
    and(eq(categorias.id, parseInt(id)), eq(categorias.teamId, teamId))
  );
  return NextResponse.json({ ok: true });
}
