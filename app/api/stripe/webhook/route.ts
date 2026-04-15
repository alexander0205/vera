import Stripe from 'stripe';
import { stripe } from '@/lib/payments/stripe';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTeamByStripeCustomerId, updateTeamSubscription } from '@/lib/db/queries';
import { getPlanByPriceId } from '@/lib/config/plans';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const payload   = await request.text();
  const signature = request.headers.get('stripe-signature') as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed.', err);
    return NextResponse.json(
      { error: 'Webhook signature verification failed.' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      // ── Checkout completed — first-time subscription ──────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const customerId     = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!customerId || !subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price'],
        });

        const priceId = subscription.items.data[0]?.price?.id ?? '';
        const planName = getPlanByPriceId(priceId).name;

        // Find or create team link by customerId
        let team = await getTeamByStripeCustomerId(customerId);

        if (!team && session.client_reference_id) {
          // client_reference_id = "userId:teamId" o solo userId
          // Soportamos ambos formatos para compatibilidad
          const parts  = session.client_reference_id.split(':');
          const userId = Number(parts[0]);
          const teamIdHint = parts[1] ? Number(parts[1]) : null;

          const { teamMembers } = await import('@/lib/db/schema');
          const { and: _and, eq: _eq } = await import('drizzle-orm');

          // Si tenemos teamId en el reference, usarlo directamente
          const memberRows = await db
            .select({ teamId: teamMembers.teamId })
            .from(teamMembers)
            .where(
              teamIdHint
                ? _and(_eq(teamMembers.userId, userId), _eq(teamMembers.teamId, teamIdHint))
                : _eq(teamMembers.userId, userId)
            )
            .limit(1);

          if (memberRows[0]) {
            await db
              .update(teams)
              .set({ stripeCustomerId: customerId, updatedAt: new Date() })
              .where(eq(teams.id, memberRows[0].teamId));
            // Re-fetch
            team = await getTeamByStripeCustomerId(customerId);
          }
        }

        if (!team) {
          console.error('checkout.session.completed: team not found for customer', customerId);
          break;
        }

        await updateTeamSubscription(team.id, {
          stripeSubscriptionId: subscriptionId,
          stripeProductId: (subscription.items.data[0]?.price?.product as string) ?? null,
          planName,
          subscriptionStatus: subscription.status,
        });

        console.log(`[webhook] checkout completed — team ${team.id} → plan ${planName}`);
        break;
      }

      // ── Subscription updated (upgrade / downgrade / renewal) ──────────────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId   = subscription.customer as string;
        const team         = await getTeamByStripeCustomerId(customerId);

        if (!team) {
          console.error('customer.subscription.updated: team not found for customer', customerId);
          break;
        }

        const priceId  = subscription.items.data[0]?.price?.id ?? '';
        const planName = getPlanByPriceId(priceId).name;
        const status   = subscription.status;

        if (status === 'active' || status === 'trialing') {
          await updateTeamSubscription(team.id, {
            stripeSubscriptionId: subscription.id,
            stripeProductId: (subscription.items.data[0]?.price?.product as string) ?? null,
            planName,
            subscriptionStatus: status,
          });
        } else if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
          await updateTeamSubscription(team.id, {
            stripeSubscriptionId: subscription.id,
            stripeProductId: null,
            planName: 'Gratis',
            subscriptionStatus: status,
          });
        }

        console.log(`[webhook] subscription updated — team ${team.id} → ${planName} (${status})`);
        break;
      }

      // ── Subscription deleted / canceled ───────────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId   = subscription.customer as string;
        const team         = await getTeamByStripeCustomerId(customerId);

        if (!team) {
          console.error('customer.subscription.deleted: team not found for customer', customerId);
          break;
        }

        await updateTeamSubscription(team.id, {
          stripeSubscriptionId: null,
          stripeProductId: null,
          planName: 'Gratis',
          subscriptionStatus: 'canceled',
        });

        console.log(`[webhook] subscription deleted — team ${team.id} → Gratis`);
        break;
      }

      // ── Payment failed ────────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const team       = await getTeamByStripeCustomerId(customerId);

        if (!team) break;

        // Mark subscription as past_due but keep planName so they can fix payment
        await db
          .update(teams)
          .set({ subscriptionStatus: 'past_due', updatedAt: new Date() })
          .where(eq(teams.id, team.id));

        console.log(`[webhook] payment failed — team ${team.id} marked past_due`);
        break;
      }

      default:
        console.log(`[webhook] unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('[webhook] error processing event:', event.type, err);
    // Still return 200 to Stripe to avoid retries for logic errors
  }

  return NextResponse.json({ received: true });
}
