/**
 * GET  /api/clientes/[id]/dependientes  — Lista dependientes del cliente
 * POST /api/clientes/[id]/dependientes  — Crea un dependiente
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { clients, dependientes } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { requirePermission } from '@/lib/auth/api-guard';
import { eq, and } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

const dependienteSchema = z.object({
  nombre:   z.string().min(1, 'El nombre es obligatorio').max(120).transform(v => v.trim()),
  apellido: z.string().min(1, 'El apellido es obligatorio').max(120).transform(v => v.trim()),
});

async function resolveClient(clientId: number, teamId: number) {
  const [cliente] = await db.select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.teamId, teamId)))
    .limit(1);
  return cliente ?? null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const clientId = parseInt(id);
  if (isNaN(clientId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const cliente = await resolveClient(clientId, teamId);
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

  const rows = await db.select().from(dependientes)
    .where(and(eq(dependientes.clientId, clientId), eq(dependientes.teamId, teamId)))
    .orderBy(dependientes.createdAt);

  return NextResponse.json({ dependientes: rows });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requirePermission('clientes:gestionar');
  if (!auth.ok) return auth.response;
  const { teamId } = auth;

  const { id } = await params;
  const clientId = parseInt(id);
  if (isNaN(clientId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const cliente = await resolveClient(clientId, teamId);
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

  const body = await req.json();
  const parsed = dependienteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });

  const [created] = await db.insert(dependientes).values({
    teamId,
    clientId,
    nombre:   parsed.data.nombre,
    apellido: parsed.data.apellido,
  }).returning();

  return NextResponse.json({ ok: true, dependiente: created }, { status: 201 });
}
