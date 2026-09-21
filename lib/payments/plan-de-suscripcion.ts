/**
 * lib/payments/plan-de-suscripcion.ts — qué plan de Zero hay dentro de una
 * suscripción de Stripe, y en qué item está.
 *
 * Antes se miraba solo el PRIMER item y solo su precio EXACTO. Dos maneras de
 * quedarse en «Gratis» pagando, las dos vistas en producción:
 *
 *  - El primer item era un adicional. Pérez Rivera paga Zero Negocio (US$19),
 *    pero su primer item es «Zero Punto de Venta»: sin plan.
 *  - Precio especial. Yomalia paga Zero Ilimitado a US$30 en vez de US$65: es
 *    otro precio del MISMO producto, y no coincidía con STRIPE_PRICE_ILIMITADO.
 *
 * Gratis es un usuario y cero comprobantes con NCF, y la pantalla de
 * suscripción le decía «sin plan activo» a quien estaba pagando.
 *
 * Ahora se recorren todos los items: primero por precio exacto y, si ninguno
 * coincide, por producto —cada plan tiene su producto en Stripe, así que un
 * precio especial de ese producto sigue siendo ese plan—.
 */

import type Stripe from 'stripe';
import { stripe } from '@/lib/payments/stripe';
import { PLANS, FREE_PLAN, getPlanByPriceId, type PlanDef } from '@/lib/config/plans';

/** Lo que hace falta de un item de suscripción. */
export interface ItemConPrecio {
  price?: { id?: string; product?: string | { id: string } | null } | null;
}

export interface PlanEncontrado<I extends ItemConPrecio> {
  plan: PlanDef;
  /** El item que trae el plan. Null si ninguno es un plan de Zero. */
  item: I | null;
}

export function productoDelItem(item: ItemConPrecio | null | undefined): string | null {
  const producto = item?.price?.product;
  if (!producto) return null;
  return typeof producto === 'string' ? producto : producto.id;
}

/**
 * Elige el plan entre los items. El precio exacto manda sobre el producto: si
 * un item tiene el precio de lista de un plan, ese es el plan aunque otro item
 * sea de otro producto de plan.
 */
export function elegirPlan<I extends ItemConPrecio>(
  items: readonly I[],
  planPorProducto: ReadonlyMap<string, PlanDef>,
): PlanEncontrado<I> {
  for (const item of items) {
    const plan = getPlanByPriceId(item.price?.id ?? '');
    if (plan.key !== FREE_PLAN.key) return { plan, item };
  }
  for (const item of items) {
    const producto = productoDelItem(item);
    const plan = producto ? planPorProducto.get(producto) : undefined;
    if (plan) return { plan, item };
  }
  return { plan: FREE_PLAN, item: null };
}

/**
 * Producto de Stripe → plan, leído de los precios de lista configurados.
 *
 * Se arma una vez por instancia: son unas pocas llamadas y los precios de lista
 * no cambian sin un despliegue. Si Stripe falla se olvida la promesa, para que
 * la próxima sincronización lo vuelva a intentar en vez de heredar el error.
 *
 * Un producto que resultara ser de DOS planes no se usa: adivinar entre ellos
 * sería peor que no reconocerlo.
 */
let productosDePlanes: Promise<Map<string, PlanDef>> | null = null;

export function planesPorProducto(): Promise<Map<string, PlanDef>> {
  productosDePlanes ??= (async () => {
    const pares = await Promise.all(
      PLANS
        .filter(p => p.priceEnvKey && process.env[p.priceEnvKey])
        .map(async (p) => {
          const precio = await stripe.prices.retrieve(process.env[p.priceEnvKey]!);
          return [productoDelItem({ price: precio }), p] as const;
        }),
    );

    const mapa = new Map<string, PlanDef>();
    const repetidos = new Set<string>();
    for (const [producto, plan] of pares) {
      if (!producto) continue;
      if (mapa.has(producto) && mapa.get(producto)!.key !== plan.key) repetidos.add(producto);
      mapa.set(producto, plan);
    }
    for (const producto of repetidos) {
      console.warn('[planes] el producto', producto, 'es de más de un plan; no se usa para reconocer precios especiales');
      mapa.delete(producto);
    }
    return mapa;
  })().catch((e) => {
    productosDePlanes = null;
    throw e;
  });
  return productosDePlanes;
}

/** Solo para pruebas: olvida el mapa armado. */
export function olvidarPlanesPorProducto(): void {
  productosDePlanes = null;
}

/**
 * El plan de una suscripción y el item que lo trae. Solo pregunta a Stripe por
 * los productos cuando ningún item tiene un precio de lista.
 */
export async function planDeLaSuscripcion(
  sub: Stripe.Subscription,
): Promise<PlanEncontrado<Stripe.SubscriptionItem>> {
  const items = sub.items.data;
  const exacto = elegirPlan(items, new Map());
  if (exacto.item) return exacto;
  return elegirPlan(items, await planesPorProducto());
}
