/**
 * Crea (idempotente) los 5 products+prices de Stripe TEST del modelo modular.
 * Idempotencia por price.lookup_key = tier.key: si ya existe, lo reutiliza.
 *
 *   npx tsx scripts/crear-prices-modulos.ts
 *
 * Al final imprime las 5 líneas STRIPE_PRICE_* para el .env.
 */
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-04-30.basil' });

interface TierSpec { envKey: string; lookupKey: string; product: string; usd: number; }

const TIERS: TierSpec[] = [
  { envKey: 'STRIPE_PRICE_FACT_250',    lookupKey: 'fact_250', product: 'Facturación 250K', usd: 20 },
  { envKey: 'STRIPE_PRICE_FACT_600',    lookupKey: 'fact_600', product: 'Facturación 600K', usd: 30 },
  { envKey: 'STRIPE_PRICE_POS',         lookupKey: 'pos_std',  product: 'Punto de Venta',   usd: 10 },
  { envKey: 'STRIPE_PRICE_COLEGIO_100', lookupKey: 'col_100',  product: 'Colegio 100',      usd: 90 },
  { envKey: 'STRIPE_PRICE_COLEGIO_200', lookupKey: 'col_200',  product: 'Colegio 200',      usd: 170 },
];

async function upsertPrice(t: TierSpec): Promise<string> {
  // ¿Ya existe un price con este lookup_key? → reutilizar.
  const existing = await stripe.prices.list({ lookup_keys: [t.lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    console.log(`  = ${t.lookupKey} ya existía → ${existing.data[0].id}`);
    return existing.data[0].id;
  }

  const product = await stripe.products.create({
    name: `Zero — ${t.product}`,
    metadata: { modulo_tier: t.lookupKey },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: t.usd * 100, // centavos USD
    currency: 'usd',
    recurring: { interval: 'month' },
    lookup_key: t.lookupKey,
    metadata: { modulo_tier: t.lookupKey },
  });
  console.log(`  + ${t.lookupKey} creado → ${price.id} ($${t.usd}/mes)`);
  return price.id;
}

(async () => {
  const acct = await stripe.accounts.retrieve();
  console.log(`Stripe account: ${acct.id} (${acct.settings?.dashboard?.display_name ?? 'sin nombre'}) — TEST\n`);

  const lines: string[] = [];
  for (const t of TIERS) {
    const id = await upsertPrice(t);
    lines.push(`${t.envKey}="${id}"`);
  }

  console.log('\n─── Pega esto en .env y .env.local ───');
  console.log(lines.join('\n'));
})();
