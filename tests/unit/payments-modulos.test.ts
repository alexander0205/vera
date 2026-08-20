/**
 * Unit tests — billing por módulo (lib/payments/modulos.ts).
 *
 * MODULE_PRICE_IDS se computa al importar el módulo, así que cada caso
 * stubbea envs y usa vi.resetModules + import dinámico.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Stripe from 'stripe';

// El módulo importa lib/db/drizzle (crea cliente postgres al importar) y
// lib/payments/stripe (crea cliente Stripe). Ninguno conecta hasta usarse,
// pero necesitan envs presentes.
function stubBaseEnvs() {
  vi.stubEnv('POSTGRES_URL', 'postgresql://postgres:postgres@localhost:54322/emitedo_test');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_dummy');
  vi.stubEnv('AUTH_SECRET', 'test');
}

function fakeSub(priceIds: string[], status: Stripe.Subscription.Status = 'active'): Stripe.Subscription {
  return {
    status,
    items: { data: priceIds.map(id => ({ price: { id } })) },
  } as unknown as Stripe.Subscription;
}

describe('billing por módulo', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    stubBaseEnvs();
  });

  it('sin envs de precio: moduleBillingEnabled=false y sin módulos derivados', async () => {
    vi.stubEnv('STRIPE_PRICE_MODULO_FACTURACION', '');
    vi.stubEnv('STRIPE_PRICE_MODULO_POS', '');
    const m = await import('@/lib/payments/modulos');
    expect(m.moduleBillingEnabled()).toBe(false);
    expect(m.modulesFromSubscription(fakeSub(['price_x']))).toEqual([]);
  });

  it('con envs: deriva módulos desde los items de la suscripción', async () => {
    vi.stubEnv('STRIPE_PRICE_MODULO_FACTURACION', 'price_fact');
    vi.stubEnv('STRIPE_PRICE_MODULO_POS', 'price_pos');
    const m = await import('@/lib/payments/modulos');
    expect(m.moduleBillingEnabled()).toBe(true);
    expect(m.moduleForPriceId('price_pos')).toBe('pos');
    expect(m.moduleForPriceId('price_fact')).toBe('facturacion');
    expect(m.moduleForPriceId('price_otro')).toBeNull();

    expect(m.modulesFromSubscription(fakeSub(['price_pos']))).toEqual(['pos']);
    expect(m.modulesFromSubscription(fakeSub(['price_fact', 'price_pos'])))
      .toEqual(expect.arrayContaining(['facturacion', 'pos']));
    // items de plan clásico no aportan módulos
    expect(m.modulesFromSubscription(fakeSub(['price_starter_plan']))).toEqual([]);
  });

  it('items duplicados del mismo módulo colapsan', async () => {
    vi.stubEnv('STRIPE_PRICE_MODULO_POS', 'price_pos');
    const m = await import('@/lib/payments/modulos');
    expect(m.modulesFromSubscription(fakeSub(['price_pos', 'price_pos']))).toEqual(['pos']);
  });
});
