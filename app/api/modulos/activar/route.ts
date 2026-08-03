import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { MODULES } from '@/lib/config/modules';
import { activarModulo } from '@/lib/payments/module-subscriptions';

/**
 * Activa/cambia un módulo con COBRO (tier-aware):
 *
 *   POST { modulo, tier }
 *     → { ok:true }            (item agregado/cambiado en la suscripción)
 *     → { checkoutUrl }        (sin suscripción — completar pago en Stripe)
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
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const [team] = await db.select().from(teams).where(eq(teams.id, auth.teamId)).limit(1);
  if (!team) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

  try {
    const result = await activarModulo(team, parsed.data.modulo, parsed.data.tier, auth.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo activar el módulo' },
      { status: 400 },
    );
  }
}
