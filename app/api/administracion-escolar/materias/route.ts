import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarMaterias } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:ver');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const rows = await db.select().from(adminEscolarMaterias)
    .where(eq(adminEscolarMaterias.teamId, teamId))
    .orderBy(asc(adminEscolarMaterias.nombre));
  return NextResponse.json({ materias: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { nombre, activo } = await req.json();
  if (!nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
  const [row] = await db.insert(adminEscolarMaterias).values({
    teamId,
    nombre: nombre.trim(),
    activo: activo ?? true,
  }).returning();
  return NextResponse.json({ materia: row });
}
