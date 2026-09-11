/**
 * Qué plan es un item de una suscripción, cuando el precio no es el del catálogo.
 *
 * `getPlanByPriceId` compara el price ID contra `STRIPE_PRICE_*` y con eso
 * bastaba mientras todo el mundo pagara la tarifa publicada. No es el caso: en
 * Stripe se le puede colgar OTRO precio al mismo producto —un descuento
 * negociado, una tarifa vieja que quedó viva en una suscripción— y ahí el
 * emparejamiento por precio no encuentra nada.
 *
 * Cuando eso pasa, `getPlanByPriceId` devuelve FREE_PLAN, y como el plan es de
 * donde salen los módulos con el billing encendido, el cliente PIERDE lo que
 * está pagando. Le pasó a un colegio con Ilimitado + POS a precio negociado:
 * quedó en `free`, sin Punto de Venta, y con la prueba a punto de vencer se
 * habría ido además a solo lectura.
 *
 * El producto sí es estable: es lo que identifica QUÉ se vendió, mientras que
 * el precio dice cuánto se cobró por ello. Así que aquí se resuelve por
 * producto, y el precio se queda como el camino rápido.
 *
 * Los productos no están en `PLANS` —el catálogo no los conoce— así que se
 * preguntan a Stripe una vez y se guardan en memoria mientras viva el proceso.
 * Es una llamada por precio configurado, la primera vez que hace falta.
 */

import 'server-only';
import { stripe } from '@/lib/payments/stripe';
import { PLANS, ADDONS, type PlanDef, type AddonDef } from '@/lib/config/plans';

/**
 * producto → clave del plan / del adicional.
 *
 * Se memoiza la PROMESA y no el resultado: dos webhooks a la vez piden el mapa
 * antes de que el primero conteste, y sin esto cada uno dispararía su propia
 * tanda de llamadas a Stripe.
 */
let mapaEnVuelo: Promise<{
  planes: Map<string, string>;
  adicionales: Map<string, string>;
}> | null = null;

/** El producto de un precio configurado, o null si el precio ya no existe. */
async function productoDe(priceId: string): Promise<string | null> {
  try {
    const price = await stripe.prices.retrieve(priceId);
    return typeof price.product === 'string' ? price.product : (price.product?.id ?? null);
  } catch {
    // Un precio borrado en Stripe, o una variable mal puesta, no puede tumbar
    // la sincronización entera: ese plan se queda sin resolver por producto y
    // los demás siguen.
    return null;
  }
}

function construirMapa() {
  return (async () => {
    const planes = new Map<string, string>();
    const adicionales = new Map<string, string>();

    const entradas = [
      ...PLANS.map(p => ({ tipo: 'plan' as const, clave: p.key, env: p.priceEnvKey })),
      ...ADDONS.map(a => ({ tipo: 'addon' as const, clave: a.key, env: a.priceEnvKey })),
    ].filter(e => e.env && process.env[e.env]);

    const resueltas = await Promise.all(
      entradas.map(async e => ({ ...e, producto: await productoDe(process.env[e.env]!) })),
    );

    for (const r of resueltas) {
      if (!r.producto) continue;
      // El primero gana: si dos claves comparten producto, el orden de PLANS
      // decide, que es el mismo criterio que ya usa el catálogo.
      const destino = r.tipo === 'plan' ? planes : adicionales;
      if (!destino.has(r.producto)) destino.set(r.producto, r.clave);
    }

    return { planes, adicionales };
  })();
}

function mapa() {
  if (!mapaEnVuelo) mapaEnVuelo = construirMapa();
  return mapaEnVuelo;
}

/** Solo para las pruebas: olvida lo aprendido de Stripe. */
export function olvidarCatalogo() {
  mapaEnVuelo = null;
}

/** El id del producto de un item, venga expandido o como string. */
export function productoDelItem(item: {
  price?: { product?: string | { id?: string } | null } | null;
}): string | null {
  const p = item.price?.product;
  if (!p) return null;
  return typeof p === 'string' ? p : (p.id ?? null);
}

/**
 * El plan de un item de suscripción: por precio si coincide, y si no por
 * producto. `null` cuando el item no es ningún plan del catálogo — un
 * adicional, o algo que se vendió fuera de él.
 */
export async function planDelItem(item: {
  price?: { id?: string; product?: string | { id?: string } | null } | null;
}): Promise<PlanDef | null> {
  const priceId = item.price?.id ?? '';
  if (priceId) {
    const porPrecio = PLANS.find(p => p.priceEnvKey && process.env[p.priceEnvKey] === priceId);
    if (porPrecio) return porPrecio;
  }
  const producto = productoDelItem(item);
  if (!producto) return null;
  const clave = (await mapa()).planes.get(producto);
  return clave ? (PLANS.find(p => p.key === clave) ?? null) : null;
}

/**
 * El adicional de un item, por precio o por producto. `null` si no lo es.
 */
export async function adicionalDelItem(item: {
  price?: { id?: string; product?: string | { id?: string } | null } | null;
}): Promise<AddonDef | null> {
  const priceId = item.price?.id ?? '';
  if (priceId) {
    const porPrecio = ADDONS.find(a => a.priceEnvKey && process.env[a.priceEnvKey] === priceId);
    if (porPrecio) return porPrecio;
  }
  const producto = productoDelItem(item);
  if (!producto) return null;
  const clave = (await mapa()).adicionales.get(producto);
  return clave ? (ADDONS.find(a => a.key === clave) ?? null) : null;
}
