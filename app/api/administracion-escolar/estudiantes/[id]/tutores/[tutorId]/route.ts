import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudianteTutores } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

/** Desvincula un tutor de un estudiante (no borra el tutor). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tutorId: string }> },
) {
  const auth = await requirePermission('administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;
  const { id, tutorId } = await params;
  const [row] = await db.delete(adminEscolarEstudianteTutores)
    .where(and(
      eq(adminEscolarEstudianteTutores.teamId, teamId),
      eq(adminEscolarEstudianteTutores.estudianteId, parseInt(id)),
      eq(adminEscolarEstudianteTutores.tutorId, parseInt(tutorId)),
    ))
    .returning();
  if (!row) return NextResponse.json({ error: 'Vínculo no encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
