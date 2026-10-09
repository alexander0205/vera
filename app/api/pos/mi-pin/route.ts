/**
 * PIN de autorización del POS del usuario actual (supervisor).
 *
 * GET  → { tienePin } — si el supervisor ya configuró un PIN.
 * PUT  { pin: string | null } — fija (4–6 dígitos) o borra (null) su PIN.
 *
 * Gate: pos:anular. Solo un supervisor (admin/owner o rol equivalente) tiene un
 * PIN útil: es el que autoriza a un cajero a quitar un ítem de un recibo cobrado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';

export async function GET() {
  const auth = await requirePermission('pos:anular');
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;

  const [row] = await db
    .select({ posPin: teamMembers.posPin })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)))
    .limit(1);

  return NextResponse.json({ tienePin: !!row?.posPin });
}

const schema = z.object({ pin: z.string().regex(/^\d{4,6}$/).nullable() });

export async function PUT(req: NextRequest) {
  const auth = await requirePermission('pos:anular');
  if (!auth.ok) return auth.response;
  const { teamId, user } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'El PIN debe ser de 4 a 6 dígitos' }, { status: 400 });
  }

  await db.update(teamMembers)
    .set({ posPin: parsed.data.pin })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)));

  return NextResponse.json({ ok: true, tienePin: parsed.data.pin != null });
}
