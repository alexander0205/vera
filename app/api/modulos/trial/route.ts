import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/api-guard';
import { MODULES } from '@/lib/config/modules';
import { startTrial } from '@/lib/payments/module-subscriptions';

/**
 * Inicia la prueba local de 15 días de un módulo para la empresa activa.
 * Sin tarjeta, sin Stripe. Un módulo se prueba una sola vez por empresa.
 *
 *   POST { modulo, tier } → { ok:true, trialEndsAt } | 400 { error }
 *
 * Requiere suscripcion:gestionar (owner).
 */
const bodySchema = z.object({
  modulo: z.enum(MODULES),
  tier: z.string().min(1).max(30),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission('suscripcion:gestionar');
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const result = await startTrial(auth.teamId, parsed.data.modulo, parsed.data.tier);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, trialEndsAt: result.trialEndsAt });
}
