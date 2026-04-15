import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/payments/stripe';
import { getUser, getTeamIdForUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPlanByPriceId } from '@/lib/config/plans';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getTeam(teamId: number) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  return team ?? null;
}

/** Encuentra el schedule activo vinculado a la suscripción del equipo, si existe */
async function findActiveSchedule(stripeCustomerId: string, subscriptionId: string) {
  const schedules = await stripe.subscriptionSchedules.list({
    customer: stripeCustomerId,
  });
  return schedules.data.find(s => {
    const subId = typeof s.subscription === 'string' ? s.subscription : s.subscription?.id;
    return subId === subscriptionId && s.status === 'active';
  }) ?? null;
}

// ─── POST — cambiar plan ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No hay empresa activa' }, { status: 400 });

  const { newPriceId } = await req.json() as { newPriceId?: string };
  if (!newPriceId) return NextResponse.json({ error: 'newPriceId requerido' }, { status: 400 });

  const team = await getTeam(teamId);
  if (!team?.stripeSubscriptionId || !team.stripeCustomerId) {
    return NextResponse.json({ error: 'No tienes una suscripción activa' }, { status: 400 });
  }

  // Recuperar suscripción actual
  const subscription = await stripe.subscriptions.retrieve(team.stripeSubscriptionId, {
    expand: ['items.data.price'],
  });

  const currentItem   = subscription.items.data[0];
  const currentPrice  = currentItem?.price;
  const currentAmount = currentPrice?.unit_amount ?? 0;

  // Recuperar precio nuevo
  const newPrice  = await stripe.prices.retrieve(newPriceId);
  const newAmount = newPrice.unit_amount ?? 0;

  if (newPriceId === currentPrice?.id) {
    return NextResponse.json({ error: 'Ya estás en este plan' }, { status: 400 });
  }

  const isUpgrade = newAmount > currentAmount;

  // ── UPGRADE: cobrar diferencia prorateada ahora ────────────────────────────
  if (isUpgrade) {
    // Si hay un downgrade pendiente (schedule), liberarlo primero
    const schedule = await findActiveSchedule(team.stripeCustomerId, team.stripeSubscriptionId);
    if (schedule) {
      await stripe.subscriptionSchedules.release(schedule.id);
    }

    await stripe.subscriptions.update(team.stripeSubscriptionId, {
      items: [{ id: currentItem.id, price: newPriceId }],
      proration_behavior: 'always_invoice',
    });

    const newPlan = getPlanByPriceId(newPriceId);
    await db.update(teams).set({ planName: newPlan.name, updatedAt: new Date() })
      .where(eq(teams.id, teamId));

    return NextResponse.json({
      type: 'upgrade',
      plan: newPlan.name,
    });
  }

  // ── DOWNGRADE: programar al final del período actual ───────────────────────
  const periodEnd = currentItem.current_period_end;
  const newPlan   = getPlanByPriceId(newPriceId);

  const existingSchedule = await findActiveSchedule(team.stripeCustomerId, team.stripeSubscriptionId);

  if (existingSchedule) {
    // Actualizar schedule existente (usuario cambió de idea sobre el downgrade)
    await stripe.subscriptionSchedules.update(existingSchedule.id, {
      end_behavior: 'release',
      phases: [
        {
          items:    [{ price: currentPrice!.id, quantity: 1 }],
          end_date: periodEnd,
        },
        {
          items: [{ price: newPriceId, quantity: 1 }],
        },
      ],
    });
  } else {
    // Crear schedule desde la suscripción actual
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: team.stripeSubscriptionId,
    });

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      phases: [
        {
          items:    [{ price: currentPrice!.id, quantity: 1 }],
          end_date: periodEnd,
        },
        {
          items: [{ price: newPriceId, quantity: 1 }],
        },
      ],
    });
  }

  return NextResponse.json({
    type:          'downgrade',
    plan:          newPlan.name,
    effectiveDate: new Date(periodEnd * 1000).toISOString(),
  });
}

// ─── DELETE — cancelar downgrade pendiente ────────────────────────────────────

export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const teamId = await getTeamIdForUser();
  if (!teamId) return NextResponse.json({ error: 'No hay empresa activa' }, { status: 400 });

  const team = await getTeam(teamId);
  if (!team?.stripeSubscriptionId || !team.stripeCustomerId) {
    return NextResponse.json({ error: 'No tienes una suscripción activa' }, { status: 400 });
  }

  const schedule = await findActiveSchedule(team.stripeCustomerId, team.stripeSubscriptionId);
  if (!schedule) {
    return NextResponse.json({ error: 'No hay un cambio de plan pendiente' }, { status: 400 });
  }

  // Liberar el schedule → la suscripción vuelve a ser normal sin cambio programado
  await stripe.subscriptionSchedules.release(schedule.id);

  return NextResponse.json({ success: true });
}
