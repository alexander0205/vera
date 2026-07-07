import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { listarEstudiantesEnriquecidos } from '@/lib/administracion-escolar/queries';

const ESTADOS = ['activo', 'inactivo', 'retirado', 'graduado'];

export async function GET() {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const estudiantes = await listarEstudiantesEnriquecidos(teamId);
  return NextResponse.json({ estudiantes });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { codigo, nombres, apellidos, fechaNacimiento, estado } = await req.json();
  if (!nombres?.trim()) return NextResponse.json({ error: 'Nombres requeridos' }, { status: 400 });
  if (!apellidos?.trim()) return NextResponse.json({ error: 'Apellidos requeridos' }, { status: 400 });
  const [row] = await db.insert(adminEscolarEstudiantes).values({
    teamId,
    codigo: codigo?.trim() || null,
    nombres: nombres.trim(),
    apellidos: apellidos.trim(),
    fechaNacimiento: fechaNacimiento || null,
    estado: ESTADOS.includes(estado) ? estado : 'activo',
  }).returning();
  return NextResponse.json({ estudiante: row });
}
