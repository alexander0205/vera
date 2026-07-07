import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { deudaEstudiante } from '@/lib/administracion-escolar/queries';
import { eq, and } from 'drizzle-orm';

const ESTADOS = ['activo', 'inactivo', 'retirado', 'graduado'];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id } = await params;
  const [estudiante] = await db.select().from(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, parseInt(id)), eq(adminEscolarEstudiantes.teamId, teamId)))
    .limit(1);
  if (!estudiante) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const deudaCentavos = await deudaEstudiante(teamId, estudiante.id);
  return NextResponse.json({ estudiante: { ...estudiante, deudaCentavos } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { codigo, nombres, apellidos, fechaNacimiento, estado } = await req.json();
  const [row] = await db.update(adminEscolarEstudiantes)
    .set({
      ...(codigo !== undefined ? { codigo: codigo?.trim() || null } : {}),
      ...(nombres !== undefined ? { nombres: nombres.trim() } : {}),
      ...(apellidos !== undefined ? { apellidos: apellidos.trim() } : {}),
      ...(fechaNacimiento !== undefined ? { fechaNacimiento: fechaNacimiento || null } : {}),
      ...(estado !== undefined && ESTADOS.includes(estado) ? { estado } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarEstudiantes.id, parseInt(id)), eq(adminEscolarEstudiantes.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ estudiante: row });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const [row] = await db.delete(adminEscolarEstudiantes)
    .where(and(eq(adminEscolarEstudiantes.id, parseInt(id)), eq(adminEscolarEstudiantes.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
