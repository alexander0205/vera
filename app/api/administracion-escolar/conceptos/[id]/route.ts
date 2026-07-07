import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarConceptosPago } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

const TIPOS = ['inscripcion', 'mensualidad', 'uniforme', 'actividad', 'otro'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('administracion-escolar:configurar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id } = await params;
  const { nombre, tipo, recurrente, activo } = await req.json();
  const [row] = await db.update(adminEscolarConceptosPago)
    .set({
      ...(nombre !== undefined ? { nombre: nombre.trim() } : {}),
      ...(tipo !== undefined ? { tipo: TIPOS.includes(tipo) ? tipo : 'otro' } : {}),
      ...(recurrente !== undefined ? { recurrente } : {}),
      ...(activo !== undefined ? { activo } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(adminEscolarConceptosPago.id, parseInt(id)), eq(adminEscolarConceptosPago.teamId, teamId)))
    .returning();
  if (!row) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ concepto: row });
}
