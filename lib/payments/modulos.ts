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
import { teams, users, type Team } from '@/lib/db/schema';
import { stripe } from '@/lib/payments/stripe';
import { MODULES, sanitizeModules, type ModuleKey } from '@/lib/config/modules';
import { adicionalDelItem } from '@/lib/payments/catalogo-stripe';

export const MODULE_PRICE_IDS: Record<ModuleKey, string> = {
  facturacion: process.env.STRIPE_PRICE_MODULO_FACTURACION ?? '',
  pos:         process.env.STRIPE_PRICE_MODULO_POS ?? '',
  // Módulos sin price: se habilitan a mano (modulosOverride desde el panel
  // admin) y ninguna suscripción opina sobre ellos. Ver isBillableModule.
  // Administración es base — toda empresa la tiene, nunca se cobra.
  administracion: '',
  escolar:        '',
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
 * Adicionales contratados, leídos de los items de la suscripción.
 *
 * Un adicional y un "módulo facturable" son el mismo item de Stripe visto
 * desde dos épocas del producto: el POS se vende hoy como el adicional de
 * US$9 sobre cualquier plan de la línea e-CF, y comparte el price
 * (STRIPE_PRICE_MODULO_POS) con el esquema anterior de billing por módulo.
 *
 * Se resuelve por precio primero y por PRODUCTO después, igual que el plan: a
 * un adicional también se le puede colgar un precio negociado en Stripe, y
 * comparando solo el price ID el POS de ese cliente desaparecía de la lista
 * aunque lo estuviera pagando todos los meses.
 */
export async function addonsFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string[]> {
  const encontrados = await Promise.all(
    subscription.items.data.map(item => adicionalDelItem(item)),
  );
  return [...new Set(encontrados.filter(Boolean).map(a => a!.key))];
}

/** Segundos de época de Stripe → Date. null cuando el campo no viene. */
function aFecha(segundos: number | null | undefined): Date | null {
  return segundos ? new Date(segundos * 1000) : null;
}

/**
 * Las fechas del ciclo de vida, sacadas de la suscripción.
 *
 * Stripe las tiene todas, pero preguntárselas en cada carga de página sería un
 * viaje de red para pintar un banner. Se copian aquí, en el webhook, que es
 * exactamente cuando cambian. Ver migración 0133.
 *
 * Exportada para `sincronizarConStripe`: la reconciliación escribe las mismas
 * fechas por el mismo camino, o el resync y el webhook se separarían.
 */
export function fechasDelCiclo(subscription: Stripe.Subscription) {
  const status = subscription.status;

  // `morosoDesde` marca el PRIMER fallo, no el último intento. Stripe reintenta
  // la tarjeta varias veces durante la semana y cada reintento vuelve a poner
  // past_due: si se reescribiera en cada uno, el reloj de la gracia se
  // reiniciaría solo y no se agotaría nunca. Por eso aquí solo se LIMPIA (al
  // volver a cobrar bien); ponerlo es cosa del evento invoice.payment_failed,
  // que es el único que sabe cuál fue el primero.
  const alDia = status === 'active' || status === 'trialing';

  return {
    trialEnd:      aFecha(subscription.trial_end),
    periodoFin:    aFecha(subscription.items.data[0]?.current_period_end),
    cancelarAlFin: Boolean(subscription.cancel_at_period_end),
    // Al volver a estar al día se limpian las dos marcas. La del aviso de
    // solo-lectura también: si no, quien se cae una segunda vez meses después
    // no recibiría el correo, porque el sistema seguiría creyendo que ya se
    // lo mandó.
    ...(alDia ? { morosoDesde: null, avisoSoloLecturaEn: null } : {}),
  };
}

/**
 * Deriva y persiste desde la suscripción: los adicionales SIEMPRE, y
 * modulosHabilitados solo cuando hay billing por módulo configurado.
 *
 * Los adicionales van aparte y primero porque son la vía viva: con el billing
 * encendido, getTeamModules arma la lista con `plan + adicionales` y no mira
 * modulosHabilitados. Un colegio que contrata el POS necesita que su addon
 * quede escrito aunque este deploy no tenga el billing por módulo montado.
 *
 * Para modulosHabilitados (esquema anterior, aún vivo con el billing apagado):
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
  // `paused` cuenta como vigente. Es lo que Stripe pone cuando se acaba la
  // prueba sin tarjeta, y en ese momento la empresa entra en solo-lectura: el
  // acceso de ESCRITURA lo corta `bloquearSiSoloLectura`, no esta función.
  // Quitarle además los adicionales le apagaba el POS de la cafetería a un
  // colegio que todavía puede —y debe— consultar su cartera.
  const vigente = subscription.status === 'active'
    || subscription.status === 'trialing'
    || subscription.status === 'past_due'
    || subscription.status === 'paused';

  await db.update(teams)
    .set({
      // Al perder la suscripción los adicionales se caen: son items de esa
      // suscripción y sin ella no hay nada contratado.
      adicionales: vigente ? await addonsFromSubscription(subscription) : [],
      ...fechasDelCiclo(subscription),
      updatedAt: new Date(),
    })
    .where(eq(teams.id, teamId));

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
  if (status === 'active' || status === 'trialing' || status === 'past_due' || status === 'paused') {
    // past_due: gracia — banner en UI, sin corte inmediato.
    //
    // paused: se acabó la prueba sin tarjeta. Los módulos SE QUEDAN. Sin esta
    // rama, a un colegio se le caía «escolar» el día que vencía la prueba y
    // dejaba de ver a sus propios estudiantes — justo lo contrario de lo que
    // promete el modo solo-lectura, que es poder consultar, imprimir y
    // exportar. Lo que se corta es escribir, y de eso se encarga el guard.
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

  // El correo de quien está comprando, para no pedírselo en el checkout
  // teniéndolo ya. Va condicional porque Stripe rechaza `customer` y
  // `customer_email` juntos. Ver createCheckoutSession.
  const [actor] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, actorUserId))
    .limit(1);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/dashboard/configuracion`,
    ...(team.stripeCustomerId
      ? { customer: team.stripeCustomerId }
      : actor?.email ? { customer_email: actor.email } : {}),
    client_reference_id: `${actorUserId}:${team.id}`,
    // Mismo marcado que el checkout principal: la suscripción sabe de quién es.
    subscription_data: { metadata: { teamId: String(team.id), origen: 'modulo' } },
    allow_promotion_codes: true,
    locale: 'es',
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
