import Stripe from 'stripe';
import { stripe } from '@/lib/payments/stripe';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getTeamByStripeCustomerId, updateTeamSubscription } from '@/lib/db/queries';
import { getPlanByPriceId, FREE_PLAN } from '@/lib/config/plans';
import { syncModulesFromSubscription } from '@/lib/payments/modulos';
import { MORA } from '@/lib/config/suscripcion';
import {
  destinatarioDeSuscripcion, type DestinatarioSuscripcion,
} from '@/lib/suscripcion/destinatario';
import {
  enviarCobroFallido, enviarPruebaPorVencer, enviarCancelacionProgramada,
} from '@/lib/email/suscripcion';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Manda un correo de suscripción sin poder tumbar el webhook.
 *
 * Un fallo de Resend NO debe devolverle un 500 a Stripe: Stripe reintentaría
 * el evento, y el reintento volvería a aplicar el cambio de plan que ya se
 * aplicó. Perder un correo es molesto; procesar dos veces un cambio de
 * suscripción corrompe el estado. Por eso se traga el error y se loguea.
 */
async function avisar(
  teamId: number,
  enviar: (d: DestinatarioSuscripcion) => Promise<void>,
): Promise<void> {
  try {
    const destinatario = await destinatarioDeSuscripcion(teamId);
    if (!destinatario) {
      console.warn(`[webhook] team ${teamId} sin destinatario para el aviso`);
      return;
    }
    await enviar(destinatario);
  } catch (err) {
    console.error(`[webhook] no se pudo avisar al team ${teamId}:`, err);
  }
}

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
        // La CLAVE, no el nombre: `getPlan` resuelve por clave y «Avanzado» no
        // es `colegio-avanzado`. Guardar el nombre dejaba a cinco de los ocho
        // planes cayendo a FREE_PLAN justo después de pagar.
        const planName = getPlanByPriceId(priceId).key;

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

        // Billing por módulo: deriva modulosHabilitados de los items.
        await syncModulesFromSubscription(team.id, subscription);

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
        // La CLAVE, no el nombre: `getPlan` resuelve por clave y «Avanzado» no
        // es `colegio-avanzado`. Guardar el nombre dejaba a cinco de los ocho
        // planes cayendo a FREE_PLAN justo después de pagar.
        const planName = getPlanByPriceId(priceId).key;
        const status   = subscription.status;

        if (status === 'active' || status === 'trialing' || status === 'past_due' || status === 'paused') {
          // past_due CONSERVA el plan. Es el estado de «se me venció la
          // tarjeta», y quien decide si todavía puede trabajar es la gracia de
          // MORA.diasGracia, no esta línea. Ponerlo en 'Gratis' aquí lo dejaba
          // sin módulos y con cupo cero el mismo día del primer cobro fallido,
          // que es justo lo que la gracia existe para evitar.
          //
          // `paused` es lo que Stripe pone cuando se acaba la prueba sin
          // tarjeta (`trial_settings.end_behavior: pause`), y conserva el plan
          // por la misma razón: durante los días de solo-lectura hay que poder
          // seguir enseñándole CUÁL era su plan mientras decide si paga. Sin
          // esta rama caía entre las dos y no se actualizaba nada — funcionaba
          // de casualidad, que es como se rompe al primer cambio.
          await updateTeamSubscription(team.id, {
            stripeSubscriptionId: subscription.id,
            stripeProductId: (subscription.items.data[0]?.price?.product as string) ?? null,
            planName,
            subscriptionStatus: status,
          });
        } else if (status === 'canceled' || status === 'unpaid') {
          await updateTeamSubscription(team.id, {
            stripeSubscriptionId: subscription.id,
            stripeProductId: null,
            planName: FREE_PLAN.key,
            subscriptionStatus: status,
          });
        }

        // Billing por módulo: deriva modulosHabilitados de los items/estado.
        await syncModulesFromSubscription(team.id, subscription);

        // Cancelación recién programada. Se compara contra lo que había en la
        // fila ANTES de sincronizar: `subscription.updated` llega por muchos
        // motivos —renovación, cambio de precio, actualización de tarjeta— y
        // sin esta comparación se mandaría el correo de cancelación en cada
        // uno de ellos.
        const acabaDeCancelar = subscription.cancel_at_period_end && !team.cancelarAlFin;
        const finPeriodo = subscription.items.data[0]?.current_period_end;
        if (acabaDeCancelar && finPeriodo) {
          await avisar(team.id, d => enviarCancelacionProgramada({
            ...d, activoHasta: new Date(finPeriodo * 1000),
          }));
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
          planName: FREE_PLAN.key,
          subscriptionStatus: 'canceled',
        });

        // Billing por módulo: al cancelar todo, degrada a solo facturación.
        await syncModulesFromSubscription(team.id, subscription);

        console.log(`[webhook] subscription deleted — team ${team.id} → Gratis`);
        break;
      }

      // ── Payment failed ────────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const team       = await getTeamByStripeCustomerId(customerId);

        if (!team) break;

        // ¿Es el PRIMER fallo? Se mira antes de escribir, porque después de
        // el UPDATE ya no se distingue: Stripe reintenta la tarjeta varias
        // veces y manda este evento en cada intento. Un correo por reintento
        // convierte un aviso útil en spam nuestro.
        const primerFallo = team.morosoDesde == null;

        // Se conserva el planName para que pueda entrar a arreglar el pago.
        //
        // `morosoDesde` se escribe SOLO si estaba vacío. Stripe reintenta la
        // tarjeta varias veces durante la semana y cada intento fallido manda
        // otro invoice.payment_failed; sobrescribirlo movería el arranque de la
        // gracia hacia adelante en cada reintento y la mora no vencería nunca.
        // Se limpia al volver a cobrar bien (ver fechasDelCiclo).
        await db
          .update(teams)
          .set({
            subscriptionStatus: 'past_due',
            morosoDesde: sql`COALESCE(${teams.morosoDesde}, NOW())`,
            updatedAt: new Date(),
          })
          .where(eq(teams.id, team.id));

        if (primerFallo) {
          await avisar(team.id, d => enviarCobroFallido({ ...d, diasDeGracia: MORA.diasGracia }));
        }

        console.log(`[webhook] payment failed — team ${team.id} marked past_due (primero: ${primerFallo})`);
        break;
      }

      // ── Cobro exitoso ─────────────────────────────────────────────────────────
      // Cierra la mora en cuanto el dinero entra. Sin esto había que esperar a
      // que llegara un `subscription.updated`, y mientras tanto una empresa que
      // YA PAGÓ seguía viendo el banner de «actualiza tu tarjeta» y contando
      // los días de una gracia que ya no le aplicaba.
      case 'invoice.payment_succeeded': {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const team       = await getTeamByStripeCustomerId(customerId);

        if (!team || team.morosoDesde == null) break;

        await db
          .update(teams)
          .set({ morosoDesde: null, subscriptionStatus: 'active', updatedAt: new Date() })
          .where(eq(teams.id, team.id));

        console.log(`[webhook] payment succeeded — team ${team.id} sale de mora`);
        break;
      }

      // ── La prueba se acaba ────────────────────────────────────────────────────
      // Stripe lo manda tres días antes. Es el ÚNICO aviso que llega antes de
      // perder el acceso: el banner solo lo ve quien entra, y quien está a
      // punto de no pagar es justo el que no está entrando.
      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription;
        const team = await getTeamByStripeCustomerId(subscription.customer as string);
        if (!team || !subscription.trial_end) break;

        const venceEl = new Date(subscription.trial_end * 1000);
        const dias = Math.max(1, Math.ceil((venceEl.getTime() - Date.now()) / 86_400_000));

        await avisar(team.id, d => enviarPruebaPorVencer({ ...d, diasRestantes: dias, venceEl }));

        console.log(`[webhook] trial_will_end — team ${team.id}, ${dias} días`);
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
