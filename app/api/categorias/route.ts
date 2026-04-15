import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { categorias } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const rows = await db.select().from(categorias)
    .where(eq(categorias.teamId, teamId))
    .orderBy(asc(categorias.nombre));
  return NextResponse.json({ categorias: rows });
}

export async function POST(req: NextRequest) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { nombre, descripcion } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  const [row] = await db.insert(categorias).values({
    teamId,
    nombre: nombre.trim(),
    descripcion: descripcion?.trim() || null,
  }).returning();
  return NextResponse.json({ categoria: row });
}
