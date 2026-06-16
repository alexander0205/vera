/**
 * GET    /api/clientes/[id]  — Detalle de un cliente
 * PUT    /api/clientes/[id]  — Actualiza un cliente
 * DELETE /api/clientes/[id]  — Elimina un cliente
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { clients, ecfDocuments } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and, desc } from 'drizzle-orm';
import { clienteSchema } from '@/lib/clientes/schema';

// Mismo schema que crear: email vacío → null, RNC/cédula/pasaporte normaliza guiones y valida formato.
const updateSchema = clienteSchema;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const clientId = parseInt(id);
  if (isNaN(clientId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [cliente] = await db.select().from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.teamId, teamId))).limit(1);
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

  // Facturas del cliente (últimas 20)
  const facturas = await db.select({
    id: ecfDocuments.id,
    encf: ecfDocuments.encf,
    tipoEcf: ecfDocuments.tipoEcf,
    estado: ecfDocuments.estado,
    montoTotal: ecfDocuments.montoTotal,
    fechaEmision: ecfDocuments.fechaEmision,
  }).from(ecfDocuments)
    .where(and(eq(ecfDocuments.clientId, clientId), eq(ecfDocuments.teamId, teamId)))
    .orderBy(desc(ecfDocuments.fechaEmision))
    .limit(20);

  return NextResponse.json({ cliente, facturas });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const clientId = parseInt(id);
  if (isNaN(clientId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

  const [existing] = await db.select({ id: clients.id }).from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.teamId, teamId))).limit(1);
  if (!existing) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

  const { razonSocial, rnc, email, telefono, direccion, descripcion } = parsed.data;
  const [updated] = await db.update(clients)
    .set({ razonSocial, rnc: rnc || null, email: email || null, telefono: telefono || null, direccion: direccion || null, descripcion: descripcion ?? null, updatedBy: user.id, updatedAt: new Date() })
    .where(eq(clients.id, clientId))
    .returning();

  return NextResponse.json({ ok: true, cliente: updated });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const clientId = parseInt(id);
  if (isNaN(clientId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [existing] = await db.select({ id: clients.id }).from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.teamId, teamId))).limit(1);
  if (!existing) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

  await db.delete(clients).where(eq(clients.id, clientId));
  return NextResponse.json({ ok: true });
}
