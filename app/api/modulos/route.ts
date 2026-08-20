import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/api-guard';
import { getTeamModules } from '@/lib/auth/modules';
import { MODULES } from '@/lib/config/modules';
import { activarModulo, desactivarModulo, moduleBillingEnabled } from '@/lib/payments/modulos';

/**
 * Self-service de módulos del negocio (owner):
 *
 *   GET    → módulos activos + si el billing por módulo está configurado
 *   POST   {modulo}         → activar (item Stripe o checkout)
 *   DELETE {modulo}         → desactivar (quita item; facturacion no se puede)
 *
 * Requiere suscripcion:gestionar (solo owner). Con billing sin configurar,
 * POST/DELETE devuelven 409 — los módulos se activan vía admin plataforma.
 */

const bodySchema = z.object({ modulo: z.enum(MODULES) });

export async function GET() {
  const auth = await requirePermission('suscripcion:gestionar');
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    modules: await getTeamModules(auth.teamId),
    billingEnabled: moduleBillingEnabled(),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission('suscripcion:gestionar');
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Módulo inválido' }, { status: 400 });

  if (!moduleBillingEnabled()) {
    return NextResponse.json(
      { error: 'La activación de módulos aún no está disponible en autoservicio. Contacta a soporte.' },
      { status: 409 },
    );
  }

  const [team] = await db.select().from(teams).where(eq(teams.id, auth.teamId)).limit(1);
  if (!team) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

  try {
    const result = await activarModulo(team, parsed.data.modulo, auth.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo activar el módulo' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission('suscripcion:gestionar');
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Módulo inválido' }, { status: 400 });

  if (!moduleBillingEnabled()) {
    return NextResponse.json(
      { error: 'La gestión de módulos aún no está disponible en autoservicio. Contacta a soporte.' },
      { status: 409 },
    );
  }

  const [team] = await db.select().from(teams).where(eq(teams.id, auth.teamId)).limit(1);
  if (!team) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

  try {
    await desactivarModulo(team, parsed.data.modulo);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo desactivar el módulo' },
      { status: 400 },
    );
  }
}
