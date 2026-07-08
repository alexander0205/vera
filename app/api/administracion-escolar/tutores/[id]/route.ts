import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarTutores, clients } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { nombre, documento, telefono, email, direccion, clientId } = await req.json();

  // clientId: null desvincula; si viene un id, debe pertenecer al team.
  if (clientId !== undefined && clientId !== null) {
    const [c] = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.teamId, teamId)))
      .limit(1);
    if (!c) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
  }

  const [row] = await db.update(adminEscolarTutores)
    .set({
      ...(nombre !== undefined ? { nombre: nombre.trim() } : {}),
      ...(documento !== undefined ? { documento: documento?.trim() || null } : {}),
      ...(telefono !== undefined ? { telefono: telefono?.trim() || null } : {}),
      ...(email !== undefined ? { email: email?.trim() || null } : {}),
      ...(direccion !== undefined ? { direccion: direccion?.trim() || null } : {}),
      ...(clientId !== undefined ? { clientId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarTutores.id, parseInt(id)), eq(adminEscolarTutores.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ tutor: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const [row] = await db.delete(adminEscolarTutores)
    .where(and(eq(adminEscolarTutores.id, parseInt(id)), eq(adminEscolarTutores.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
