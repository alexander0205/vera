/**
 * PATCH  /api/secuencias/[id]  — Actualiza siguiente número + vencimiento (desde modal NCF)
 * PUT    /api/secuencias/[id]  — Actualiza rango/vencimiento/nombre/pieDeFactura de una secuencia
 * DELETE /api/secuencias/[id]  — Elimina una secuencia
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { sequences } from '@/lib/db/schema';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { eq, and } from 'drizzle-orm';

const updateSchema = z.object({
  hasta:            z.number().int().positive().optional(),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido').optional(),
  nombre:           z.string().min(1).max(200).optional(),
  pieDeFactura:     z.string().max(2000).optional(),
  preferida:        z.boolean().optional(),
  sucursal:         z.string().max(100).optional(),
});

const patchSchema = z.object({
  siguiente:        z.number().int().positive().optional(),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nombre:           z.string().min(1).max(200).optional(),
  pieDeFactura:     z.string().max(2000).nullable().optional(),
  preferida:        z.boolean().optional(),
});

// ─── PATCH — actualiza siguiente número y/o vencimiento (modal NCF) ──────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const seqId = parseInt(id);
  if (isNaN(seqId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detalles: parsed.error.flatten() }, { status: 400 });
  }

  const [seq] = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.id, seqId), eq(sequences.teamId, teamId)))
    .limit(1);

  if (!seq) return NextResponse.json({ error: 'Secuencia no encontrada' }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (parsed.data.siguiente !== undefined) {
    if (BigInt(parsed.data.siguiente) < seq.secuenciaActual) {
      return NextResponse.json(
        { error: `El siguiente número no puede ser menor al actual (${seq.secuenciaActual})` },
        { status: 400 }
      );
    }
    updates.secuenciaActual = BigInt(parsed.data.siguiente);
  }

  if (parsed.data.fechaVencimiento) {
    updates.fechaVencimiento = new Date(parsed.data.fechaVencimiento + 'T23:59:59');
  }

  if (parsed.data.nombre !== undefined) {
    updates.nombre = parsed.data.nombre;
  }

  if (parsed.data.pieDeFactura !== undefined) {
    updates.pieDeFactura = parsed.data.pieDeFactura;
  }

  if (parsed.data.preferida !== undefined) {
    updates.preferida = parsed.data.preferida;
  }

  await db.update(sequences).set(updates).where(eq(sequences.id, seqId));

  return NextResponse.json({ ok: true });
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const seqId = parseInt(id);
  if (isNaN(seqId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', detalles: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verificar propiedad (solo el team propietario puede modificar)
  const [seq] = await db
    .select({ id: sequences.id, secuenciaActual: sequences.secuenciaActual })
    .from(sequences)
    .where(and(eq(sequences.id, seqId), eq(sequences.teamId, teamId)))
    .limit(1);

  if (!seq) return NextResponse.json({ error: 'Secuencia no encontrada' }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (parsed.data.hasta !== undefined) {
    if (BigInt(parsed.data.hasta) < seq.secuenciaActual) {
      return NextResponse.json(
        { error: `El nuevo límite (${parsed.data.hasta}) no puede ser menor a la secuencia actual (${seq.secuenciaActual})` },
        { status: 400 }
      );
    }
    updates.secuenciaHasta = BigInt(parsed.data.hasta);
  }

  if (parsed.data.fechaVencimiento) {
    updates.fechaVencimiento = new Date(parsed.data.fechaVencimiento + 'T23:59:59');
  }

  if (parsed.data.nombre !== undefined) {
    updates.nombre = parsed.data.nombre;
  }

  if (parsed.data.pieDeFactura !== undefined) {
    updates.pieDeFactura = parsed.data.pieDeFactura;
  }

  if (parsed.data.preferida !== undefined) {
    updates.preferida = parsed.data.preferida;
  }

  if (parsed.data.sucursal !== undefined) {
    updates.sucursal = parsed.data.sucursal;
  }

  await db.update(sequences).set(updates).where(eq(sequences.id, seqId));

  return NextResponse.json({ ok: true });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'Sin equipo' }, { status: 403 });

  const { id } = await params;
  const seqId = parseInt(id);
  if (isNaN(seqId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

  const [seq] = await db
    .select({ id: sequences.id })
    .from(sequences)
    .where(and(eq(sequences.id, seqId), eq(sequences.teamId, teamId)))
    .limit(1);

  if (!seq) return NextResponse.json({ error: 'Secuencia no encontrada' }, { status: 404 });

  await db.delete(sequences).where(eq(sequences.id, seqId));

  return NextResponse.json({ ok: true });
}
