/**
 * DELETE /api/clientes/[id]/dependientes/[depId]  — Elimina un dependiente
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { clients, dependientes } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string; depId: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requirePermission('clientes:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id, depId } = await params;
  const clientId = parseInt(id);
  const dependienteId = parseInt(depId);
  if (isNaN(clientId) || isNaN(dependienteId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  // Validate client belongs to team
  const [cliente] = await db.select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.teamId, teamId)))
    .limit(1);
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

  // Validate dependiente belongs to this client + team
  const [dep] = await db.select({ id: dependientes.id })
    .from(dependientes)
    .where(and(
      eq(dependientes.id, dependienteId),
      eq(dependientes.clientId, clientId),
      eq(dependientes.teamId, teamId),
    ))
    .limit(1);
  if (!dep) return NextResponse.json({ error: 'Dependiente no encontrado' }, { status: 404 });

  await db.delete(dependientes).where(eq(dependientes.id, dependienteId));
  return NextResponse.json({ ok: true });
}
