import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarTutores } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const rows = await db.select().from(adminEscolarTutores)
    .where(eq(adminEscolarTutores.teamId, teamId))
    .orderBy(asc(adminEscolarTutores.nombre));
  return NextResponse.json({ tutores: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { nombre, documento, telefono, email, direccion } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  const [row] = await db.insert(adminEscolarTutores).values({
    teamId,
    nombre: nombre.trim(),
    documento: documento?.trim() || null,
    telefono: telefono?.trim() || null,
    email: email?.trim() || null,
    direccion: direccion?.trim() || null,
  }).returning();
  return NextResponse.json({ tutor: row });
}
