/**
 * Billing por módulo (Stripe multi-item).
 *
 * Cada módulo comercializable (facturacion / pos) mapea a un price de Stripe
 * (envs STRIPE_PRICE_MODULO_*). La suscripción del team puede tener varios
 * items — uno por módulo — y `teams.modulosHabilitados` SE DERIVA de esos
 * items en cada webhook (syncModulesFromSubscription). El panel admin puede
 * forzar con `modulosOverride` (comps/demos) sin tocar Stripe.
 *
 * Si los price IDs no están configurados (deploy sin billing por módulo),
 * todo esto es no-op y los módulos se administran manualmente (admin /
 * toggle de configuración) — degradación intencional.
 */

import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teams, type Team } from '@/lib/db/schema';
import { stripe } from '@/lib/payments/stripe';
import { MODULES, sanitizeModules, type ModuleKey } from '@/lib/config/modules';

export const MODULE_PRICE_IDS: Record<ModuleKey, string> = {
  facturacion: process.env.STRIPE_PRICE_MODULO_FACTURACION ?? '',
  pos:         process.env.STRIPE_PRICE_MODULO_POS ?? '',
  // Administración Escolar no tiene price: se habilita a mano (modulosOverride
  // desde el panel admin). Ver isBillableModule.
  escolar:     '',
};

/**
 * ¿Este módulo se cobra por Stripe? Un módulo sin price se administra a mano y
 * NUNCA debe derivarse (ni borrarse) desde una suscripción.
 */
export function isBillableModule(mod: ModuleKey): boolean {
  return Boolean(MODULE_PRICE_IDS[mod]);
}

/** ¿El billing por módulo está configurado en este deploy? */
export function moduleBillingEnabled(): boolean {
  return Object.values(MODULE_PRICE_IDS).some(Boolean);
}

export function moduleForPriceId(priceId: string): ModuleKey | null {
  for (const mod of MODULES) {
    if (MODULE_PRICE_IDS[mod] && MODULE_PRICE_IDS[mod] === priceId) return mod;
  }
  return null;
}

/** Módulos presentes como items en una suscripción de Stripe. */
export function modulesFromSubscription(subscription: Stripe.Subscription): ModuleKey[] {
  const mods = new Set<ModuleKey>();
  for (const item of subscription.items.data) {
    const mod = moduleForPriceId(item.price?.id ?? '');
    if (mod) mods.add(mod);
  }
  return [...mods];
}

/**
 * Deriva y persiste modulosHabilitados desde la suscripción.
 *
 * Reglas:
 *  - Sin billing por módulo configurado, o suscripción sin items de módulo
 *    (solo plan clásico) → no tocar nada (los módulos se administran manual).
 *  - active/trialing → módulos = items de módulo de la suscripción,
 *    garantizando siempre 'facturacion' como base.
 *  - canceled/unpaid → degradar a ['facturacion'] (el POS se apaga al perder
 *    el pago; los datos no se tocan).
 */
export async function syncModulesFromSubscription(
  teamId: number,
  subscription: Stripe.Subscription,
): Promise<void> {
  if (!moduleBillingEnabled()) return;
  const subMods = modulesFromSubscription(subscription);
  if (subMods.length === 0) return; // suscripción de plan clásico — no opina sobre módulos

  // Módulos sin price (ej. escolar) se habilitan a mano; la suscripción no
  // opina sobre ellos, así que se conservan tal cual estaban.
  const [row] = await db
    .select({ habilitados: teams.modulosHabilitados })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  const manuales = sanitizeModules(row?.habilitados).filter(m => !isBillableModule(m));

  const status = subscription.status;
  let next: ModuleKey[];
  if (status === 'active' || status === 'trialing' || status === 'past_due') {
    // past_due: gracia — banner en UI, sin corte inmediato.
    next = Array.from(new Set<ModuleKey>(['facturacion', ...subMods, ...manuales]));
  } else {
    next = Array.from(new Set<ModuleKey>(['facturacion', ...manuales]));
  }

  await db.update(teams)
    .set({
      modulosHabilitados: next,
      // Compat legacy hasta retirar su último consumidor.
      posHabilitado: next.includes('pos'),
      updatedAt: new Date(),
    })
    .where(eq(teams.id, teamId));
}

/**
 * Activa un módulo para el team:
 *  - con suscripción existente → agrega el item del módulo (prorrateado) y
 *    sincroniza módulos de inmediato; devuelve {ok:true}.
 *  - sin suscripción → devuelve {checkoutUrl} para completar el pago.
 */
export async function activarModulo(
  team: Team,
  mod: ModuleKey,
  actorUserId: number,
): Promise<{ ok: true } | { checkoutUrl: string }> {
  const priceId = MODULE_PRICE_IDS[mod];
  if (!priceId) {
    // Sin price no hay nada que cobrar: el módulo se habilita desde el panel
    // admin (modulosOverride), no por checkout.
    throw new Error('Este módulo no se vende por Stripe: habilítalo desde el panel de administración');
  }

  if (team.stripeSubscriptionId) {
    const sub = await stripe.subscriptions.retrieve(team.stripeSubscriptionId, {
      expand: ['items.data.price'],
    });
    const ya = sub.items.data.some(i => i.price?.id === priceId);
    if (!ya) {
      await stripe.subscriptionItems.create({
        subscription: sub.id,
        price: priceId,
        quantity: 1,
        proration_behavior: 'create_prorations',
      });
    }
    const updated = await stripe.subscriptions.retrieve(sub.id, { expand: ['items.data.price'] });
    await syncModulesFromSubscription(team.id, updated);
    return { ok: true };
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/dashboard/configuracion`,
    customer: team.stripeCustomerId || undefined,
    client_reference_id: `${actorUserId}:${team.id}`,
    allow_promotion_codes: true,
  });
  return { checkoutUrl: session.url! };
}

/**
 * Desactiva un módulo: elimina su item de la suscripción (fin de ciclo vía
 * prorrateo none) y sincroniza. 'facturacion' no se puede desactivar.
 */
export async function desactivarModulo(team: Team, mod: ModuleKey): Promise<void> {
  if (mod === 'facturacion') throw new Error('El módulo Facturación no se puede desactivar');
  const priceId = MODULE_PRICE_IDS[mod];
  if (!priceId) {
    throw new Error('Este módulo no se vende por Stripe: desactívalo desde el panel de administración');
  }
  if (!team.stripeSubscriptionId) return;

  const sub = await stripe.subscriptions.retrieve(team.stripeSubscriptionId, {
    expand: ['items.data.price'],
  });
  const item = sub.items.data.find(i => i.price?.id === priceId);
  if (item) {
    await stripe.subscriptionItems.del(item.id, { proration_behavior: 'none' });
  }
  const updated = await stripe.subscriptions.retrieve(sub.id, { expand: ['items.data.price'] });
  await syncModulesFromSubscription(team.id, updated);
}
