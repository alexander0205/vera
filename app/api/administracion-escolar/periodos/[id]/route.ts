import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarPeriodos } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { nombre, fechaInicio, fechaFin, activo } = await req.json();
  const [row] = await db.update(adminEscolarPeriodos)
    .set({
      ...(nombre !== undefined ? { nombre: nombre.trim() } : {}),
      ...(fechaInicio !== undefined ? { fechaInicio: fechaInicio || null } : {}),
      ...(fechaFin !== undefined ? { fechaFin: fechaFin || null } : {}),
      ...(activo !== undefined ? { activo } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarPeriodos.id, parseInt(id)), eq(adminEscolarPeriodos.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ periodo: row });
}
