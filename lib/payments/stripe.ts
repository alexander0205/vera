import Stripe from 'stripe';
import { redirect } from 'next/navigation';
import { Team } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getPlanByPriceId, ADDONS, addonIncluido } from '@/lib/config/plans';
import { PRUEBA } from '@/lib/config/suscripcion';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil'
});

// Los cuatro price IDs del esquema anterior (starter/invoice/business/pro) se
// quitaron: no los leía nadie y apuntaban a planes que ya no existen en el
// catálogo. Los de hoy salen de PLANS, cada uno con su priceEnvKey.

export async function createCheckoutSession({
  team,
  priceId,
  addons = [],
}: {
  team: Team | null;
  priceId: string;
  /**
   * Adicionales que van en la MISMA suscripción, como items aparte. Es lo que
   * hace real la línea "Zero POS + ERP": el plan y el POS son dos precios de
   * Stripe, y el cliente ve la suma.
   */
  addons?: string[];
}) {
  const user = await getUser();

  if (!team || !user) {
    redirect(`/sign-up?redirect=checkout&priceId=${priceId}`);
  }

  // Se filtran los que el plan YA incluye: al tramo de colegio no se le cobra
  // el POS aparte, que su precio ya lo trae.
  const planDelPrecio = getPlanByPriceId(priceId);
  const itemsAddon = ADDONS
    .filter(a => addons.includes(a.key) && !addonIncluido(planDelPrecio.key, a.key))
    .map(a => process.env[a.priceEnvKey])
    .filter((p): p is string => Boolean(p))
    .map(price => ({ price, quantity: 1 }));

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1
      },
      ...itemsAddon,
    ],
    mode: 'subscription',
    success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/pricing`,
    // Cliente ya conocido en Stripe, o su correo si es la primera compra.
    //
    // Los dos NO pueden ir juntos: Stripe rechaza la sesión si recibe
    // `customer` y `customer_email` a la vez. Y sin ninguno de los dos, el
    // checkout abre pidiendo el correo a alguien que lleva media hora con la
    // sesión iniciada — un campo de más justo en el paso donde más gente se
    // cae, para preguntar un dato que ya tenemos.
    ...(team.stripeCustomerId
      ? { customer: team.stripeCustomerId }
      : { customer_email: user.email }),
    client_reference_id: `${user.id}:${team.id}`, // "userId:teamId" para el webhook
    allow_promotion_codes: true,
    locale: 'es',
    // SIN `trial_period_days` a propósito.
    //
    // La prueba se abre UNA sola vez, al terminar el onboarding
    // (`crearSuscripcionDePrueba`). Cuando esto lo tenía también, quien pasaba
    // por el onboarding y luego venía aquí a poner tarjeta recibía OTROS 15
    // días: treinta gratis, y encima el webhook pisaba nuestro `trial_end` con
    // el de Stripe. Aquí se llega para empezar a pagar, no para volver a
    // probar.
  });

  redirect(session.url!);
}

/**
 * El portal de Stripe: tarjeta, facturas y cancelar. NADA de cambiar de plan.
 *
 * El cambio de plan se sacó a propósito. El portal ofrecía solo los precios de
 * UN producto —el que el cliente tuviera contratado— así que con ocho planes
 * repartidos en dos familias no había forma de cambiarse de verdad; y, sobre
 * todo, aplicaba la bajada sin mirar nada. Un colegio de 442 estudiantes podía
 * bajarse al tramo de 300 en dos clics, dentro de una pantalla de Stripe donde
 * no tenemos dónde decirle que eso rompe su matrícula.
 *
 * Esa validación vive en nuestro /api/stripe/change-plan (ver
 * lib/suscripcion/cambio-plan.ts). El portal queda para lo que Stripe hace
 * mejor que nosotros y no queremos tocar: los datos de tarjeta, que así nunca
 * pasan por nuestro servidor.
 */
export async function createCustomerPortalSession(team: Team) {
  // Ya no se exige stripeProductId: hacía falta solo para armar la lista de
  // precios del cambio de plan, que aquí no va. Pedirlo dejaba fuera del
  // portal —y por tanto sin poder actualizar su tarjeta— a quien tuviera la
  // columna vacía por un webhook viejo.
  if (!team.stripeCustomerId) {
    redirect('/pricing');
  }

  const configuration = await portalConfiguration();

  return stripe.billingPortal.sessions.create({
    customer: team.stripeCustomerId,
    return_url: `${process.env.BASE_URL}/dashboard/suscripcion`,
    configuration: configuration.id,
    locale: 'es',
  });
}

/** Se crea una vez y se reusa mientras viva el proceso. */
let portalCacheada: Stripe.BillingPortal.Configuration | null = null;

/**
 * La configuración del portal, buscada por su metadata y no por «la primera
 * de la lista».
 *
 * Antes se tomaba `configurations.data[0]`, que es la que Stripe devuelva de
 * primera: cualquier configuración creada a mano en el panel —o la de otro
 * entorno— se colaba y el cliente veía un portal que nadie diseñó. Con la
 * marca en metadata se encuentra la nuestra, y si cambia la versión se crea
 * una nueva sin pisar la anterior.
 */
const PORTAL_VERSION = 'zero-v2';

async function portalConfiguration(): Promise<Stripe.BillingPortal.Configuration> {
  if (portalCacheada) return portalCacheada;

  const existentes = await stripe.billingPortal.configurations.list({ limit: 100 });
  const mia = existentes.data.find(
    c => c.active && c.metadata?.zero_portal === PORTAL_VERSION,
  );
  if (mia) {
    portalCacheada = mia;
    return mia;
  }

  portalCacheada = await stripe.billingPortal.configurations.create({
    metadata: { zero_portal: PORTAL_VERSION },
    business_profile: {
      headline: 'Zero — tu suscripción',
    },
    features: {
      // Lo que el portal SÍ hace.
      payment_method_update: { enabled: true },
      invoice_history:       { enabled: true },
      customer_update: {
        enabled: true,
        // Datos de la factura, no de la suscripción. El correo y la dirección
        // fiscal los cambia él; el plan, no.
        allowed_updates: ['email', 'address', 'name', 'tax_id'],
      },
      subscription_cancel: {
        enabled: true,
        // Al fin del período, nunca en seco: el mes ya está cobrado y cortarlo
        // el mismo día sería quedarse con dinero por un servicio no prestado.
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: [
            'too_expensive',
            'missing_features',
            'switched_service',
            'unused',
            'other',
          ],
        },
      },
      // Y lo que NO: el cambio de plan va por nuestra pantalla, que valida.
      subscription_update: { enabled: false },
    },
  });

  return portalCacheada;
}

// Aquí vivían `handleSubscriptionChange`, `getStripePrices` y
// `getStripeProducts`, del starter. Ninguna la llamaba nadie: el webhook hace
// su propio trabajo y los precios salen de PLANS.
//
// `handleSubscriptionChange` además guardaba `planName: null` al cancelar, y
// duplicaba una lógica que ya vive —correcta y probada— en el webhook. Un
// duplicado dormido de la ruta crítica es exactamente cómo vuelve un bug: el
// día que alguien lo conecte «porque ya estaba», reintroduce el problema sin
// que nadie lo note.

/**
 * Abre la prueba en Stripe al terminar el onboarding.
 *
 * Antes esto se resolvía escribiendo `trial_end = hoy + 15` en nuestra fila y
 * ya: Stripe no se enteraba de que ese cliente existía. Dos consecuencias que
 * no se ven hasta que muerden — el manejador de `trial_will_end` del webhook
 * era código muerto para todo el que se registrara solo, y quien luego pasaba
 * por el checkout recibía OTROS 15 días.
 *
 * Ahora el reloj es de Stripe y hay uno solo.
 *
 * Sin tarjeta: `payment_method_collection` no aplica a suscripciones creadas
 * por API, y lo que permite abrir una prueba sin método de pago es declarar
 * qué pasa cuando termine — eso es `trial_settings.end_behavior`.
 *
 * Se elige `pause` y no `cancel` por una razón concreta: al cancelar, Stripe
 * borra la suscripción y nuestro webhook baja el plan a Gratis el mismo día en
 * que vence la prueba. Pero nuestra ventana de solo-lectura necesita seguir
 * sabiendo QUÉ plan tenía para enseñárselo mientras decide. Con `pause` la
 * suscripción sobrevive, poner la tarjeta la reanuda sin crear nada nuevo, y
 * el corte de acceso lo sigue decidiendo `trial_end` como hasta ahora.
 */
export async function crearSuscripcionDePrueba({
  team, email, priceId, addons = [],
}: {
  team: Team;
  email: string;
  priceId: string;
  addons?: string[];
}): Promise<{ customerId: string; subscription: Stripe.Subscription }> {
  const customerId = team.stripeCustomerId
    ?? (await stripe.customers.create({
      email,
      name: team.razonSocial ?? team.name,
      metadata: { teamId: String(team.id), rnc: team.rnc ?? '' },
    })).id;

  const planDelPrecio = getPlanByPriceId(priceId);
  const itemsAddon = ADDONS
    .filter(a => addons.includes(a.key) && !addonIncluido(planDelPrecio.key, a.key))
    .map(a => process.env[a.priceEnvKey])
    .filter((p): p is string => Boolean(p))
    .map(price => ({ price }));

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }, ...itemsAddon],
    trial_period_days: PRUEBA.dias,
    trial_settings: { end_behavior: { missing_payment_method: 'pause' } },
    metadata: { teamId: String(team.id), origen: 'onboarding' },
  });

  return { customerId, subscription };
}
