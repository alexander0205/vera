/**
 * PUT /api/administracion-escolar/estudiantes/[id]/facturar-a  { clientId: number | null }
 *
 * Fija a quién se le factura este alumno cuando no es el tutor responsable —el
 * caso típico es la empresa del padre, que quiere la mensualidad a su RNC para
 * deducirla y no es tutor de nadie.
 *
 * `clientId: null` lo quita y se vuelve al tutor responsable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adminEscolarEstudiantes, clients } from '@/lib/db/schema';
import { requireModuleAndPermission } from '@/lib/auth/api-guard';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireModuleAndPermission('escolar', 'administracion-escolar:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const estudianteId = Number(id);
  if (!Number.isInteger(estudianteId) || estudianteId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const crudo = body.clientId;
  const clientId = crudo == null ? null : Number(crudo);
  if (clientId !== null && (!Number.isInteger(clientId) || clientId <= 0)) {
    return NextResponse.json({ error: 'clientId inválido' }, { status: 400 });
  }

  // El contacto tiene que ser de esta empresa. Sin esto, un id de otra empresa
  // dejaría al alumno facturando contra un cliente que no se puede ni ver.
  if (clientId !== null) {
    const [cli] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.teamId, teamId)))
      .limit(1);
    if (!cli) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });
  }

  const [fila] = await db
    .update(adminEscolarEstudiantes)
    .set({ facturarAClientId: clientId, updatedAt: new Date() })
    .where(and(
      eq(adminEscolarEstudiantes.id, estudianteId),
      eq(adminEscolarEstudiantes.teamId, teamId),
    ))
    .returning({ id: adminEscolarEstudiantes.id });

  if (!fila) return NextResponse.json({ error: 'Estudiante no encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true, clientId });
}
