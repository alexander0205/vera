import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const rows = await db.select().from(adminEscolarPeriodos)
    .where(eq(adminEscolarPeriodos.teamId, teamId))
    .orderBy(desc(adminEscolarPeriodos.activo), desc(adminEscolarPeriodos.fechaInicio));
  return NextResponse.json({ periodos: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { nombre, fechaInicio, fechaFin, activo } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  const [row] = await db.insert(adminEscolarPeriodos).values({
    teamId,
    nombre: nombre.trim(),
    fechaInicio: fechaInicio || null,
    fechaFin: fechaFin || null,
    activo: activo ?? true,
  }).returning();
  return NextResponse.json({ periodo: row });
}
