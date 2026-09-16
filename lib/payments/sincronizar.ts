/**
 * La verdad es Stripe; esto la copia.
 *
 * Cada webhook trae un objeto que puede llegar viejo o fuera de orden —
 * Stripe no garantiza el orden de entrega. Por eso el evento se trata como un
 * toque en el hombro: en vez de escribir lo que dice el sobre, se le pregunta
 * a la API qué hay AHORA y se copia eso. Con una sola función escribiendo, el
 * webhook, el botón de resync del panel admin y la reconciliación del cron no
 * pueden contarse historias distintas.
 *
 * Qué escribe: plan (derivado del price ID), estado, fechas del ciclo,
 * adicionales y módulos — todo lo que la app cachea de Stripe.
 *
 * Qué NO toca:
 *  - `subscription_status = 'admin'`: acceso manual nuestro, fuera del dominio
 *    de Stripe. Sincronizarlo lo borraría.
 *  - `morosoDesde`: solo `invoice.payment_failed` sabe cuál fue el PRIMER
 *    fallo; aquí únicamente se limpia al volver a estar al día (vía
 *    fechasDelCiclo).
 */

import 'server-only';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { stripe } from '@/lib/payments/stripe';
import { syncModulesFromSubscription } from '@/lib/payments/modulos';
import { FREE_PLAN } from '@/lib/config/plans';
import { planDelItem, productoDelItem } from '@/lib/payments/catalogo-stripe';

export type ResultadoSync =
  | { aplicado: false; motivo: 'team-no-existe' | 'acceso-admin' | 'sin-customer' }
  | { aplicado: true; status: string | null; plan: string | null };

/**
 * Entre varias suscripciones del mismo cliente, cuál manda.
 *
 * Un cliente puede acumular más de una: la prueba pausada de hace meses, un
 * checkout abandonado a medias, la que compró ayer. Se elige la más viva; a
 * igual estado, la más nueva.
 */
const PRIORIDAD: Record<string, number> = {
  active: 0, trialing: 1, past_due: 2, paused: 3,
  unpaid: 4, canceled: 5, incomplete: 6, incomplete_expired: 7,
};

function mejorSuscripcion(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  if (subs.length === 0) return null;
  return [...subs].sort((a, b) =>
    (PRIORIDAD[a.status] ?? 9) - (PRIORIDAD[b.status] ?? 9) || b.created - a.created,
  )[0];
}

/** Estados en los que el plan sigue siendo SU plan y se le debe seguir enseñando. */
function sigueVigente(status: Stripe.Subscription.Status): boolean {
  return status === 'active' || status === 'trialing'
    || status === 'past_due' || status === 'paused';
}

export async function sincronizarConStripe(teamId: number): Promise<ResultadoSync> {
  const [team] = await db
    .select({
      id:                 teams.id,
      stripeCustomerId:   teams.stripeCustomerId,
      subscriptionStatus: teams.subscriptionStatus,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) return { aplicado: false, motivo: 'team-no-existe' };
  if (team.subscriptionStatus === 'admin') return { aplicado: false, motivo: 'acceso-admin' };

  // Nunca tocó Stripe. Si la fila dice otra cosa (un plan sembrado a mano),
  // dice mentira, y la sincronización existe para que la fila no mienta.
  if (!team.stripeCustomerId) {
    await db.update(teams)
      .set({
        stripeSubscriptionId: null,
        stripeProductId: null,
        planName: null,
        subscriptionStatus: null,
        trialEnd: null,
        periodoFin: null,
        cancelarAlFin: false,
        adicionales: [],
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId));
    return { aplicado: false, motivo: 'sin-customer' };
  }

  const { data: subs } = await stripe.subscriptions.list({
    customer: team.stripeCustomerId,
    status: 'all',
    limit: 10,
    expand: ['data.items.data.price'],
  });

  const sub = mejorSuscripcion(subs);

  // Cliente en Stripe pero sin ninguna suscripción: sin plan. Es distinto de
  // «canceló» — nunca hubo nada que cancelar.
  if (!sub) {
    await db.update(teams)
      .set({
        stripeSubscriptionId: null,
        stripeProductId: null,
        planName: null,
        subscriptionStatus: null,
        trialEnd: null,
        periodoFin: null,
        cancelarAlFin: false,
        adicionales: [],
        updatedAt: new Date(),
      })
      .where(eq(teams.id, teamId));
    return { aplicado: true, status: null, plan: null };
  }

  const vigente = sigueVigente(sub.status);

  /**
   * Cuál de los items es el PLAN.
   *
   * Antes se daba por hecho que era el primero y que su precio sería uno del
   * catálogo. Las dos cosas fallan: una suscripción con adicional trae varios
   * items y Stripe no promete el orden, y el precio puede ser uno negociado
   * que no está en ninguna variable de entorno. Cuando cualquiera de las dos
   * pasaba, el plan salía `free` y el cliente perdía los módulos que paga.
   *
   * Se busca entre TODOS los items el primero que resuelva a un plan —por
   * precio, y si no por producto—. Si ninguno resuelve se conserva el primer
   * item para `stripeProductId`, que sigue siendo el dato más fiel de qué se
   * le vendió.
   */
  const items = sub.items.data;
  const resueltos = await Promise.all(items.map(async it => ({ it, plan: await planDelItem(it) })));
  const delPlan = resueltos.find(r => r.plan) ?? { it: items[0], plan: null };

  // past_due y paused CONSERVAN el plan: son «arregla el pago», no «no tienes
  // nada», y la ventana de solo-lectura necesita seguir enseñando cuál era.
  const planName = vigente ? (delPlan.plan ?? FREE_PLAN).key : FREE_PLAN.key;

  await db.update(teams)
    .set({
      stripeSubscriptionId: sub.id,
      stripeProductId: vigente ? productoDelItem(delPlan.it ?? {}) : null,
      planName,
      subscriptionStatus: sub.status,
      updatedAt: new Date(),
    })
    .where(eq(teams.id, teamId));

  // Fechas del ciclo, adicionales y módulos, por el mismo camino que siempre.
  await syncModulesFromSubscription(teamId, sub);

  return { aplicado: true, status: sub.status, plan: planName };
}

/**
 * Resuelve el team de un customer y sincroniza. Es la forma que usa el
 * webhook: todos sus eventos traen el customer, ninguno trae el team.
 */
export async function sincronizarPorCustomer(customerId: string): Promise<ResultadoSync> {
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.stripeCustomerId, customerId))
    .limit(1);

  if (!team) return { aplicado: false, motivo: 'team-no-existe' };
  return sincronizarConStripe(team.id);
}
