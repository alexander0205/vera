/**
 * GET  /api/impresoras  — Lista impresoras del equipo
 * POST /api/impresoras  — Crea una nueva impresora
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { impresoras } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const rows = await db
    .select()
    .from(impresoras)
    .where(eq(impresoras.teamId, teamId))
    .orderBy(asc(impresoras.createdAt));

  return NextResponse.json({ impresoras: rows });
}

export async function POST(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await req.json();

  const nombre = (body.nombre ?? '').trim();
  if (!nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

  const tipo    = body.tipo    ?? 'a4';
  const backend = body.backend ?? 'browser';

  // Si es la primera impresora del team → marcar default automáticamente
  const existing = await db
    .select({ id: impresoras.id })
    .from(impresoras)
    .where(eq(impresoras.teamId, teamId))
    .limit(1);

  const esDefault = body.esDefault === true || existing.length === 0;

  // Si marcamos esta como default → desmarcar las otras
  if (esDefault) {
    await db
      .update(impresoras)
      .set({ esDefault: false })
      .where(eq(impresoras.teamId, teamId));
  }

  const [row] = await db
    .insert(impresoras)
    .values({
      teamId,
      nombre,
      tipo,
      esDefault,
      ip:      body.ip      ? String(body.ip).trim()  : null,
      backend,
    })
    .returning();

  return NextResponse.json({ impresora: row }, { status: 201 });
}
