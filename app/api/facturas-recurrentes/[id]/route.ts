/**
 * GET    /api/facturas-recurrentes/[id]  — Detalle de una factura recurrente
 * PUT    /api/facturas-recurrentes/[id]  — Actualiza (pausa/reanuda/edita)
 * DELETE /api/facturas-recurrentes/[id]  — Elimina
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { facturasRecurrentes } from '@/lib/db/schema';
import { getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [row] = await db
    .select()
    .from(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)));

  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ facturaRecurrente: row });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();

  const [row] = await db
    .update(facturasRecurrentes)
    .set({
      ...(body.nombre        != null && { nombre: body.nombre }),
      ...(body.tipoEcf       != null && { tipoEcf: body.tipoEcf }),
      ...(body.tipoPago      != null && { tipoPago: body.tipoPago }),
      ...(body.frecuencia    != null && { frecuencia: body.frecuencia }),
      ...(body.fechaInicio   != null && { fechaInicio: body.fechaInicio }),
      ...(body.fechaFin      !== undefined && { fechaFin: body.fechaFin ?? null }),
      ...(body.proximaEmision != null && { proximaEmision: body.proximaEmision }),
      ...(body.estado        != null && { estado: body.estado }),
      ...(body.items         != null && { items: JSON.stringify(body.items) }),
      ...(body.notas         !== undefined && { notas: body.notas ?? null }),
      ...(body.clientId      !== undefined && { clientId: body.clientId ?? null }),
      ...(body.totalEstimado != null && { totalEstimado: Math.round(body.totalEstimado * 100) }),
      ...(body.facturasEmitidas != null && { facturasEmitidas: body.facturasEmitidas }),
      updatedAt: new Date(),
    })
    .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)))
    .returning();

  if (!row) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ facturaRecurrente: row });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { id } = await params;
  const numId = parseInt(id);
  if (isNaN(numId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  await db
    .delete(facturasRecurrentes)
    .where(and(eq(facturasRecurrentes.id, numId), eq(facturasRecurrentes.teamId, teamId)));

  return NextResponse.json({ ok: true });
}
