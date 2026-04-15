import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users, teams, teamMembers } from '@/lib/db/schema';
import { setSession } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/payments/stripe';
import { getPlanByPriceId } from '@/lib/config/plans';
import Stripe from 'stripe';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.redirect(new URL('/pricing', request.url));
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription'],
    });

    if (!session.customer || typeof session.customer === 'string') {
      throw new Error('Invalid customer data from Stripe.');
    }

    const customerId    = session.customer.id;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) {
      throw new Error('No subscription found for this session.');
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });

    const priceData = subscription.items.data[0]?.price;
    if (!priceData) {
      throw new Error('No plan found for this subscription.');
    }

    const productId = (priceData.product as Stripe.Product).id;
    if (!productId) {
      throw new Error('No product ID found for this subscription.');
    }

    // client_reference_id = "userId:teamId" (o solo "userId" en registros anteriores)
    const ref = session.client_reference_id ?? '';
    if (!ref) {
      throw new Error("No client_reference_id found in Stripe session.");
    }

    const parts  = ref.split(':');
    const userId = parseInt(parts[0], 10);
    const teamIdHint = parts[1] ? parseInt(parts[1], 10) : NaN;

    if (isNaN(userId)) {
      throw new Error(`client_reference_id inválido: "${ref}"`);
    }

    // Buscar usuario
    const [foundUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!foundUser) {
      throw new Error(`User ${userId} not found in database.`);
    }

    // Buscar el team: usar teamIdHint primero (empresa que inició el checkout)
    let teamId: number | null = null;

    if (!isNaN(teamIdHint)) {
      // Verificar que el usuario pertenece exactamente a ese team
      const [member] = await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.teamId, teamIdHint),
        ))
        .limit(1);
      teamId = member?.teamId ?? null;
    }

    // Fallback: primer team del usuario (casos legacy sin teamId en reference)
    if (!teamId) {
      const [member] = await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, userId))
        .limit(1);
      teamId = member?.teamId ?? null;
    }

    if (!teamId) {
      throw new Error(`User ${userId} is not associated with any team.`);
    }

    // Determinar plan usando la config central
    const planDef  = getPlanByPriceId(priceData.id);
    const planName = planDef.name;

    // Actualizar el team con los datos de Stripe
    await db
      .update(teams)
      .set({
        stripeCustomerId:     customerId,
        stripeSubscriptionId: subscriptionId,
        stripeProductId:      productId,
        planName,
        subscriptionStatus:   subscription.status,
        updatedAt:            new Date(),
      })
      .where(eq(teams.id, teamId));

    console.log(`[checkout] team ${teamId} → plan ${planName} (${subscription.status})`);

    // Establecer sesión con la empresa que acaba de pagar como activa
    await setSession(foundUser, teamId);
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('[checkout] Error handling successful checkout:', error);
    // Redirigir a pricing con error en lugar de /error (que no existe)
    return NextResponse.redirect(new URL('/pricing?error=checkout', request.url));
  }
}
