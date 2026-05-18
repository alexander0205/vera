/**
 * PUT    /api/impresoras/[id]  — Actualiza una impresora (incluyendo marcar default)
 * DELETE /api/impresoras/[id]  — Elimina una impresora
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { impresoras } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { and, eq } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();

  // Si se marca como default → primero desmarcar todas las del team
  if (body.esDefault === true) {
    await db
      .update(impresoras)
      .set({ esDefault: false })
      .where(eq(impresoras.teamId, teamId));
  }

  const [row] = await db
    .update(impresoras)
    .set({
      ...(body.nombre    != null && { nombre:    String(body.nombre).trim() }),
      ...(body.tipo      != null && { tipo:      body.tipo }),
      ...(body.esDefault != null && { esDefault: Boolean(body.esDefault) }),
      ...(body.ip        != null && { ip:        body.ip || null }),
      ...(body.backend   != null && { backend:   body.backend }),
    })
    .where(and(eq(impresoras.id, numId), eq(impresoras.teamId, teamId)))
    .returning();

  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ impresora: row });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  await db
    .delete(impresoras)
    .where(and(eq(impresoras.id, numId), eq(impresoras.teamId, teamId)));

  return NextResponse.json({ ok: true });
}
