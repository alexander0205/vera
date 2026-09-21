/**
 * Unit tests — qué plan de Zero trae una suscripción de Stripe.
 *
 * Casos reales de producción (2026-09-18): cuatro empresas figuraban como
 * «Gratis» —un usuario, cero comprobantes con NCF— aunque tenían plan:
 *
 *  - Pérez Rivera paga Zero Negocio, pero su PRIMER item es el Punto de Venta.
 *  - Yomalia paga Zero Ilimitado a US$30 (precio especial, no el de lista).
 *  - Peke Kings, Ilimitado a US$20; My Kids Place, Pro a US$30.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Stripe from 'stripe';

const retrieve = vi.fn();
vi.mock('@/lib/payments/stripe', () => ({ stripe: { prices: { retrieve } } }));

vi.stubEnv('STRIPE_PRICE_NEGOCIO', 'price_negocio_lista');
vi.stubEnv('STRIPE_PRICE_ILIMITADO', 'price_ilimitado_lista');
vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro_lista');

const {
  elegirPlan, planDeLaSuscripcion, olvidarPlanesPorProducto, productoDelItem,
} = await import('@/lib/payments/plan-de-suscripcion');
const { PLANS } = await import('@/lib/config/plans');

const plan = (key: string) => PLANS.find(p => p.key === key)!;
const item = (price: string, product: string) => ({ id: `si_${price}`, price: { id: price, product } });
const sub = (...items: ReturnType<typeof item>[]) =>
  ({ status: 'active', items: { data: items } }) as unknown as Stripe.Subscription;

/** Producto de cada precio de lista, como lo devolvería Stripe. */
const PRODUCTO_DE_LISTA: Record<string, string> = {
  price_negocio_lista: 'prod_negocio',
  price_ilimitado_lista: 'prod_ilimitado',
  price_pro_lista: 'prod_pro',
};

beforeEach(() => {
  olvidarPlanesPorProducto();
  retrieve.mockReset();
  retrieve.mockImplementation(async (id: string) => ({ id, product: PRODUCTO_DE_LISTA[id] ?? 'prod_otro' }));
});

describe('elegirPlan', () => {
  it('encuentra el plan aunque el primer item sea un adicional (Pérez Rivera)', () => {
    const items = [item('price_pos_0', 'prod_pos'), item('price_negocio_lista', 'prod_negocio')];
    const r = elegirPlan(items, new Map());
    expect(r.plan.key).toBe('negocio');
    expect(r.item).toBe(items[1]);
  });

  it('un precio especial del producto del plan sigue siendo ese plan (Yomalia)', () => {
    const items = [item('price_ilimitado_30', 'prod_ilimitado')];
    const r = elegirPlan(items, new Map([['prod_ilimitado', plan('ilimitado')]]));
    expect(r.plan.key).toBe('ilimitado');
    expect(r.item).toBe(items[0]);
  });

  it('el precio de lista manda sobre el producto', () => {
    const items = [item('price_ilimitado_30', 'prod_ilimitado'), item('price_pro_lista', 'prod_pro')];
    const r = elegirPlan(items, new Map([['prod_ilimitado', plan('ilimitado')]]));
    expect(r.plan.key).toBe('pro');
  });

  it('solo adicionales o productos ajenos: Gratis y sin item', () => {
    const r = elegirPlan([item('price_pos_0', 'prod_pos')], new Map([['prod_pro', plan('pro')]]));
    expect(r.plan.key).toBe('free');
    expect(r.item).toBeNull();
  });

  it('acepta el producto expandido', () => {
    expect(productoDelItem({ price: { id: 'x', product: { id: 'prod_pro' } } })).toBe('prod_pro');
    expect(productoDelItem({ price: { id: 'x', product: null } })).toBeNull();
  });
});

describe('planDeLaSuscripcion', () => {
  it('con precio de lista no le pregunta nada a Stripe', async () => {
    const r = await planDeLaSuscripcion(sub(item('price_pos_0', 'prod_pos'), item('price_negocio_lista', 'prod_negocio')));
    expect(r.plan.key).toBe('negocio');
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('con precio especial reconoce el plan por su producto (My Kids Place: Pro a US$30)', async () => {
    const r = await planDeLaSuscripcion(sub(item('price_pro_30', 'prod_pro')));
    expect(r.plan.key).toBe('pro');
    expect(r.item?.price.id).toBe('price_pro_30');
  });

  it('arma el mapa de productos una sola vez', async () => {
    await planDeLaSuscripcion(sub(item('price_ilimitado_30', 'prod_ilimitado')));
    const llamadas = retrieve.mock.calls.length;
    await planDeLaSuscripcion(sub(item('price_ilimitado_20', 'prod_ilimitado')));
    expect(retrieve.mock.calls.length).toBe(llamadas);
  });

  it('si Stripe falla, la siguiente sincronización lo vuelve a intentar', async () => {
    retrieve.mockRejectedValueOnce(new Error('stripe caído'));
    await expect(planDeLaSuscripcion(sub(item('price_pro_30', 'prod_pro')))).rejects.toThrow('stripe caído');
    const r = await planDeLaSuscripcion(sub(item('price_pro_30', 'prod_pro')));
    expect(r.plan.key).toBe('pro');
  });

  it('un producto que es de dos planes no se usa para adivinar', async () => {
    retrieve.mockImplementation(async (id: string) => ({ id, product: 'prod_compartido' }));
    const r = await planDeLaSuscripcion(sub(item('price_especial', 'prod_compartido')));
    expect(r.plan.key).toBe('free');
  });
});
