import Stripe from 'stripe';
import { stripe } from '@/lib/payments/stripe';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getTeamByStripeCustomerId } from '@/lib/db/queries';
import { sincronizarConStripe, sincronizarPorCustomer } from '@/lib/payments/sincronizar';
import { MORA } from '@/lib/config/suscripcion';
import {
  destinatarioDeSuscripcion, type DestinatarioSuscripcion,
} from '@/lib/suscripcion/destinatario';
import {
  enviarCobroFallido, enviarPruebaPorVencer, enviarCancelacionProgramada,
} from '@/lib/email/suscripcion';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * El evento es un toque en el hombro, no el dato.
 *
 * Stripe no garantiza el orden de entrega: un `updated` de hace una hora puede
 * llegar después del de hace un minuto. Escribir lo que trae el sobre dejaba
 * la fila con el estado VIEJO hasta el siguiente evento. Por eso cada caso
 * llama a `sincronizarConStripe`, que ignora el sobre y le pregunta a la API
 * qué hay ahora — llegue el evento en el orden que llegue, lo escrito es lo
 * vigente. De paso, cualquier cosa hecha a mano en el dashboard de Stripe
 * (regalar días de prueba, crear una suscripción de cortesía, cambiar el
 * precio) entra por esta misma puerta sin código nuevo.
 */

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
      // ── Checkout completed — primera compra ───────────────────────────────────
      // Lo único que este evento hace y ningún otro puede: ATAR el customer al
      // team. El checkout es el único momento donde viaja el
      // client_reference_id; sin esta atadura, todos los demás eventos de ese
      // cliente caerían en «team not found».
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const customerId = session.customer as string;
        if (!customerId) break;

        let team = await getTeamByStripeCustomerId(customerId);

        if (!team && session.client_reference_id) {
          // client_reference_id = "userId:teamId" o solo userId
          // Soportamos ambos formatos para compatibilidad
          const parts  = session.client_reference_id.split(':');
          const userId = Number(parts[0]);
          const teamIdHint = parts[1] ? Number(parts[1]) : null;

          const { teamMembers } = await import('@/lib/db/schema');
          const { and: _and, eq: _eq } = await import('drizzle-orm');

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
            team = await getTeamByStripeCustomerId(customerId);
          }
        }

        if (!team) {
          console.error('checkout.session.completed: team not found for customer', customerId);
          break;
        }

        const r = await sincronizarConStripe(team.id);
        console.log(`[webhook] checkout completed — team ${team.id} →`, r);
        break;
      }

      // ── La suscripción cambió, nació o murió ─────────────────────────────────
      // `created` incluido: es lo que dispara una suscripción hecha A MANO en
      // el dashboard de Stripe (una cortesía, una demo). Sin este caso, ese
      // regalo no se reflejaba hasta el próximo `updated` — que podía tardar
      // un mes en llegar.
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId   = subscription.customer as string;

        // Se lee ANTES de sincronizar, para detectar la cancelación recién
        // programada: `updated` llega por muchos motivos —renovación, cambio
        // de precio, tarjeta— y sin comparar contra lo que había, el correo
        // de cancelación saldría en cada uno de ellos.
        const team = await getTeamByStripeCustomerId(customerId);
        if (!team) {
          console.error(`${event.type}: team not found for customer`, customerId);
          break;
        }
        const acabaDeCancelar = event.type === 'customer.subscription.updated'
          && subscription.cancel_at_period_end
          && !team.cancelarAlFin;

        const r = await sincronizarConStripe(team.id);

        const finPeriodo = subscription.items.data[0]?.current_period_end;
        if (acabaDeCancelar && finPeriodo) {
          await avisar(team.id, d => enviarCancelacionProgramada({
            ...d, activoHasta: new Date(finPeriodo * 1000),
          }));
        }

        console.log(`[webhook] ${event.type} — team ${team.id} →`, r);
        break;
      }

      // ── Cobro fallido ─────────────────────────────────────────────────────────
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

        // El estado (past_due) y el resto de la fila, por la puerta común.
        // PRIMERO el sync y DESPUÉS el marcador: si Stripe aún no movió la
        // suscripción a past_due cuando llega este evento, el sync la vería
        // «al día» y limpiaría el morosoDesde recién puesto.
        await sincronizarConStripe(team.id);

        // `morosoDesde` se escribe SOLO si estaba vacío, y SOLO aquí: este
        // evento es el único que sabe cuál fue el primer fallo. Sobrescribirlo
        // en cada reintento movería el arranque de la gracia hacia adelante y
        // la mora no vencería nunca. Se limpia al volver a cobrar bien.
        await db
          .update(teams)
          .set({
            morosoDesde: sql`COALESCE(${teams.morosoDesde}, NOW())`,
            updatedAt: new Date(),
          })
          .where(eq(teams.id, team.id));

        if (primerFallo) {
          await avisar(team.id, d => enviarCobroFallido({ ...d, diasDeGracia: MORA.diasGracia }));
        }

        console.log(`[webhook] payment failed — team ${team.id} (primero: ${primerFallo})`);
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

        const r = await sincronizarPorCustomer(customerId);
        console.log(`[webhook] payment succeeded — team ${team.id} sale de mora →`, r);
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
