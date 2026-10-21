/**
 * Unit tests — lo que los correos de suscripción sacan de Stripe.
 *
 * Todo es puro: se le pasan objetos como los que devolvería Stripe y se mira
 * qué texto, fecha o decisión sale. Nada de red ni de base.
 *
 * Lo que se cuida aquí es lo que el cliente compara con su estado de cuenta
 * (el monto, la fecha, los últimos cuatro dígitos) y lo que decide si un
 * correo sale o no (la factura de $0, la llave que evita el duplicado).
 */

import { describe, it, expect } from 'vitest';
import {
  formatearMonto, periodicidad, precioDeSuscripcion, montoDelPrecio,
  fechaLarga, sumarDiasISO, diasHastaRD, venceExactamenteEn, proximoCobro,
  metodoDesdeStripe, referenciaDeMetodo, variantePrueba,
  debeAvisarActivacion, debeAvisarPago,
  suscripcionDeFactura, periodoDeFactura, urlDeRecibo,
  claveAviso, ventanaDeAviso, ACCION_AVISO, VENTANA_ACTIVADA_DIAS,
} from '@/lib/suscripcion/datos-aviso';

const seg = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

describe('formatearMonto', () => {
  it('dólares redondos sin decimales: «US$135»', () => {
    expect(formatearMonto(13500, 'usd')).toBe('US$135');
    expect(formatearMonto(13500, 'USD')).toBe('US$135');
  });

  it('dólares con centavos: «US$19.50», «US$0.99»', () => {
    expect(formatearMonto(1950, 'usd')).toBe('US$19.50');
    expect(formatearMonto(99, 'usd')).toBe('US$0.99');
    expect(formatearMonto(1905, 'usd')).toBe('US$19.05');
  });

  it('pesos dominicanos: «RD$…», con separador de miles', () => {
    expect(formatearMonto(800000, 'dop')).toBe('RD$8,000');
    expect(formatearMonto(1250075, 'dop')).toBe('RD$12,500.75');
    expect(formatearMonto(50000, 'DOP')).toBe('RD$500');
  });

  it('una moneda desconocida sale con su código, nunca con un símbolo falso', () => {
    expect(formatearMonto(1000, 'eur')).toBe('EUR 10');
  });

  it('cero y negativos (un crédito) se escriben bien', () => {
    expect(formatearMonto(0, 'usd')).toBe('US$0');
    expect(formatearMonto(-2500, 'usd')).toBe('-US$25');
  });
});

describe('periodicidad', () => {
  it('un ciclo: «al mes», «al año»', () => {
    expect(periodicidad('month', 1)).toBe('al mes');
    expect(periodicidad('year', 1)).toBe('al año');
    expect(periodicidad('week')).toBe('a la semana');
    expect(periodicidad('day', 1)).toBe('al día');
  });

  it('varios ciclos: «cada 3 meses»', () => {
    expect(periodicidad('month', 3)).toBe('cada 3 meses');
    expect(periodicidad('year', 2)).toBe('cada 2 años');
  });

  it('desconocido → vacío, para que la frase siga siendo gramatical', () => {
    expect(periodicidad(null)).toBe('');
    expect(periodicidad('fortnight', 1)).toBe('');
  });
});

describe('precioDeSuscripcion', () => {
  const item = (unit: number | null, over: Record<string, unknown> = {}) => ({
    quantity: 1,
    price: { unit_amount: unit, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } },
    ...over,
  });

  it('un item: monto, moneda e intervalo del precio', () => {
    const p = precioDeSuscripcion({ items: { data: [item(13500)] } });
    expect(p).toEqual({ centavos: 13500, moneda: 'usd', intervalo: 'month', cada: 1 });
    expect(montoDelPrecio(p)).toBe('US$135');
  });

  it('SUMA los items: el plan más el adicional de POS es lo que paga el cliente', () => {
    const p = precioDeSuscripcion({ items: { data: [item(1900), item(900)] } });
    expect(p!.centavos).toBe(2800);
    expect(montoDelPrecio(p)).toBe('US$28');
  });

  it('respeta la cantidad de cada item', () => {
    const p = precioDeSuscripcion({ items: { data: [item(1000, { quantity: 3 })] } });
    expect(p!.centavos).toBe(3000);
  });

  it('un item gratis (POS incluido en el tramo de colegio) no cambia el total', () => {
    const p = precioDeSuscripcion({ items: { data: [item(13500), item(0)] } });
    expect(p!.centavos).toBe(13500);
  });

  it('lee unit_amount_decimal cuando unit_amount no viene', () => {
    const p = precioDeSuscripcion({
      items: { data: [{ quantity: 1, price: { unit_amount: null, unit_amount_decimal: '1900', currency: 'usd', recurring: { interval: 'month' } } }] },
    });
    expect(p!.centavos).toBe(1900);
  });

  it('un precio sin monto fijo (escalonado) deja el total DESCONOCIDO, no inventado', () => {
    const p = precioDeSuscripcion({ items: { data: [item(1900), item(null)] } });
    expect(p!.centavos).toBeNull();
    expect(montoDelPrecio(p)).toBeNull();
  });

  it('moneda e intervalo vienen del primer item; DOP funciona igual', () => {
    const p = precioDeSuscripcion({
      items: { data: [{ quantity: 1, price: { unit_amount: 800000, currency: 'dop', recurring: { interval: 'year', interval_count: 1 } } }] },
    });
    expect(montoDelPrecio(p)).toBe('RD$8,000');
    expect(p!.intervalo).toBe('year');
  });

  it('sin items → null', () => {
    expect(precioDeSuscripcion({ items: { data: [] } })).toBeNull();
  });
});

describe('fechas en hora dominicana', () => {
  it('«5 de noviembre», y con año cuando se pide', () => {
    const d = new Date('2026-11-05T15:00:00Z');
    expect(fechaLarga(d)).toBe('5 de noviembre');
    expect(fechaLarga(d, true)).toBe('5 de noviembre de 2026');
  });

  it('una prueba que vence a las 10 p. m. del 5 en Santo Domingo SIGUE siendo el 5 (en UTC ya es 6)', () => {
    const d = new Date('2026-11-06T02:00:00Z'); // 22:00 RD del 5
    expect(d.getUTCDate()).toBe(6);
    expect(fechaLarga(d)).toBe('5 de noviembre');
  });

  it('sumarDiasISO cruza meses y años', () => {
    expect(sumarDiasISO('2026-10-21', 7)).toBe('2026-10-28');
    expect(sumarDiasISO('2026-10-28', 7)).toBe('2026-11-04');
    expect(sumarDiasISO('2026-12-28', 7)).toBe('2027-01-04');
  });

  it('diasHastaRD cuenta fechas, no horas', () => {
    const fin = new Date('2026-10-25T20:00:00Z');
    // Mismo día de calendario: 0 aunque falten horas.
    expect(diasHastaRD(fin, new Date('2026-10-25T05:00:00Z'))).toBe(0);
    // 07:00 RD del 22 → faltan 3 fechas aunque sean 3.5 días de reloj.
    expect(diasHastaRD(fin, new Date('2026-10-22T11:00:00Z'))).toBe(3);
    // El 22 a las 23:00 RD (UTC ya es 23) sigue siendo 22.
    expect(diasHastaRD(fin, new Date('2026-10-23T03:00:00Z'))).toBe(3);
    expect(diasHastaRD(fin, new Date('2026-10-26T15:00:00Z'))).toBe(-1);
  });
});

describe('venceExactamenteEn — el corte del aviso de 7 días', () => {
  // El cron corre a las 11:00 UTC = 07:00 en Santo Domingo.
  const ahora = new Date('2026-10-21T11:00:00Z');

  it('vence el día 28 (RD): faltan 7 → sí', () => {
    expect(venceExactamenteEn(new Date('2026-10-28T14:00:00Z'), ahora, 7)).toBe(true);
  });

  it('vence el 28 a las 10 p. m. RD (el 29 en UTC): sigue siendo el 28 → sí', () => {
    expect(venceExactamenteEn(new Date('2026-10-29T02:00:00Z'), ahora, 7)).toBe(true);
  });

  it('vence el 28 a la 1 a. m. RD (05:00 UTC): sí', () => {
    expect(venceExactamenteEn(new Date('2026-10-28T05:00:00Z'), ahora, 7)).toBe(true);
  });

  it('vence el 27 o el 29: no', () => {
    expect(venceExactamenteEn(new Date('2026-10-27T20:00:00Z'), ahora, 7)).toBe(false);
    expect(venceExactamenteEn(new Date('2026-10-29T14:00:00Z'), ahora, 7)).toBe(false);
  });

  it('«hoy» también es de Santo Domingo: a las 9 p. m. RD del 21 (UTC ya es 22) sigue siendo el 21', () => {
    const noche = new Date('2026-10-22T01:00:00Z');
    expect(venceExactamenteEn(new Date('2026-10-28T14:00:00Z'), noche, 7)).toBe(true);
    expect(venceExactamenteEn(new Date('2026-10-29T14:00:00Z'), noche, 7)).toBe(false);
  });
});

describe('proximoCobro', () => {
  it('en prueba, el cobro es cuando acaba la prueba', () => {
    const f = proximoCobro({ status: 'trialing', trial_end: seg('2026-11-05T15:00:00Z'), items: { data: [] } });
    expect(f!.toISOString()).toBe('2026-11-05T15:00:00.000Z');
  });

  it('pagando, es el fin del ciclo que más tarde acaba', () => {
    const f = proximoCobro({
      status: 'active',
      items: { data: [{ current_period_end: seg('2026-11-05T00:00:00Z') }, { current_period_end: seg('2026-11-07T00:00:00Z') }] },
    });
    expect(f!.toISOString()).toBe('2026-11-07T00:00:00.000Z');
  });

  it('sin datos → null', () => {
    expect(proximoCobro({ status: 'active', items: { data: [] } })).toBeNull();
  });
});

describe('método de pago', () => {
  it('lee los últimos 4 de una tarjeta, con su marca', () => {
    expect(metodoDesdeStripe({ card: { last4: '4242', brand: 'visa' } })).toEqual({ last4: '4242', marca: 'visa' });
  });

  it('una cuenta bancaria también tiene últimos 4', () => {
    expect(metodoDesdeStripe({ us_bank_account: { last4: '6789' } }).last4).toBe('6789');
  });

  it('un método sin dígitos (wallet) existe igual: last4 null, no "no hay método"', () => {
    expect(metodoDesdeStripe({})).toEqual({ last4: null, marca: null });
  });

  it('el método de la suscripción manda sobre el del cliente', () => {
    const ref = referenciaDeMetodo(
      { default_payment_method: 'pm_sub' },
      { invoice_settings: { default_payment_method: 'pm_cliente' } },
    );
    expect(ref).toBe('pm_sub');
  });

  it('sin método en la suscripción, cae al predeterminado del cliente', () => {
    const ref = referenciaDeMetodo(
      { default_payment_method: null },
      { invoice_settings: { default_payment_method: 'pm_cliente' } },
    );
    expect(ref).toBe('pm_cliente');
  });

  it('un objeto expandido se devuelve tal cual', () => {
    const pm = { card: { last4: '4242' } };
    expect(referenciaDeMetodo({ default_payment_method: pm }, null)).toBe(pm);
  });

  it('ni en la suscripción ni en el cliente → null', () => {
    expect(referenciaDeMetodo({ default_payment_method: null }, { invoice_settings: { default_payment_method: null } })).toBeNull();
    expect(referenciaDeMetodo({ default_payment_method: null }, null)).toBeNull();
  });

  it('un cliente borrado no aporta método', () => {
    expect(referenciaDeMetodo({ default_payment_method: null }, { deleted: true })).toBeNull();
  });
});

describe('variantePrueba', () => {
  it('con método → «con-tarjeta»; sin él → «sin-tarjeta»', () => {
    expect(variantePrueba({ last4: '4242', marca: 'visa' })).toBe('con-tarjeta');
    expect(variantePrueba({ last4: null, marca: null })).toBe('con-tarjeta');
    expect(variantePrueba(null)).toBe('sin-tarjeta');
    expect(variantePrueba(undefined)).toBe('sin-tarjeta');
  });
});

describe('cuándo se avisa', () => {
  it('la activación solo si está en prueba o pagando', () => {
    expect(debeAvisarActivacion('trialing')).toBe(true);
    expect(debeAvisarActivacion('active')).toBe(true);
    for (const s of ['incomplete', 'incomplete_expired', 'past_due', 'canceled', 'unpaid', 'paused', null, undefined]) {
      expect(debeAvisarActivacion(s as string | null | undefined)).toBe(false);
    }
  });

  it('el pago solo si entró dinero: la factura de $0 de la prueba no cuenta', () => {
    expect(debeAvisarPago({ amount_paid: 13500 })).toBe(true);
    expect(debeAvisarPago({ amount_paid: 1 })).toBe(true);
    expect(debeAvisarPago({ amount_paid: 0 })).toBe(false);
    expect(debeAvisarPago({ amount_paid: null })).toBe(false);
    expect(debeAvisarPago({})).toBe(false);
  });
});

describe('facturas', () => {
  it('la suscripción sale de parent.subscription_details (API basil), como id o como objeto', () => {
    expect(suscripcionDeFactura({ parent: { subscription_details: { subscription: 'sub_1' } } })).toBe('sub_1');
    expect(suscripcionDeFactura({ parent: { subscription_details: { subscription: { id: 'sub_2' } } } })).toBe('sub_2');
    expect(suscripcionDeFactura({ parent: null })).toBeNull();
    expect(suscripcionDeFactura({})).toBeNull();
  });

  it('el período cubierto es del inicio más temprano al fin más tardío de las líneas que cobran', () => {
    const p = periodoDeFactura({
      lines: { data: [
        { amount: 13500, period: { start: seg('2026-11-05T00:00:00Z'), end: seg('2026-12-05T00:00:00Z') } },
      ] },
    });
    expect(p!.desde.toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(p!.hasta.toISOString()).toBe('2026-12-05T00:00:00.000Z');
  });

  it('los créditos de un cambio de plan (líneas negativas) no ensucian el período', () => {
    const p = periodoDeFactura({
      lines: { data: [
        { amount: -4000, period: { start: seg('2026-10-01T00:00:00Z'), end: seg('2026-10-20T00:00:00Z') } },
        { amount: 9000, period: { start: seg('2026-10-20T00:00:00Z'), end: seg('2026-11-20T00:00:00Z') } },
      ] },
    });
    expect(p!.desde.toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect(p!.hasta.toISOString()).toBe('2026-11-20T00:00:00.000Z');
  });

  it('un cobro suelto (inicio = fin) o sin líneas no tiene período', () => {
    const t = seg('2026-11-05T00:00:00Z');
    expect(periodoDeFactura({ lines: { data: [{ amount: 500, period: { start: t, end: t } }] } })).toBeNull();
    expect(periodoDeFactura({ lines: { data: [] } })).toBeNull();
    expect(periodoDeFactura({})).toBeNull();
  });

  it('el recibo solo se acepta si es https', () => {
    expect(urlDeRecibo({ hosted_invoice_url: 'https://invoice.stripe.com/i/acct_1/test_abc' })).toBe('https://invoice.stripe.com/i/acct_1/test_abc');
    expect(urlDeRecibo({ hosted_invoice_url: 'http://invoice.stripe.com/x' })).toBeNull();
    expect(urlDeRecibo({ hosted_invoice_url: 'javascript:alert(1)' })).toBeNull();
    expect(urlDeRecibo({ hosted_invoice_url: null })).toBeNull();
    expect(urlDeRecibo({})).toBeNull();
  });
});

describe('llaves de idempotencia', () => {
  it('tienen la forma acordada, porque son lo que se busca en audit_logs', () => {
    expect(ACCION_AVISO).toBe('SUSCRIPCION_AVISO');
    expect(claveAviso.activada(12, 'negocio')).toBe('activada:12:negocio');
    expect(claveAviso.prueba7('sub_abc')).toBe('prueba-7:sub_abc');
    expect(claveAviso.prueba3('sub_abc')).toBe('prueba-3:sub_abc');
    expect(claveAviso.pago('in_xyz')).toBe('pago:in_xyz');
  });

  it('las de 7 y 3 días de la misma prueba son distintas (no se pisan)', () => {
    expect(claveAviso.prueba7('sub_abc')).not.toBe(claveAviso.prueba3('sub_abc'));
  });

  it('solo la activación tiene ventana: 60 días', () => {
    expect(VENTANA_ACTIVADA_DIAS).toBe(60);
    expect(ventanaDeAviso(claveAviso.activada(1, 'pro'))).toBe(60);
    expect(ventanaDeAviso(claveAviso.prueba7('sub_1'))).toBeNull();
    expect(ventanaDeAviso(claveAviso.prueba3('sub_1'))).toBeNull();
    expect(ventanaDeAviso(claveAviso.pago('in_1'))).toBeNull();
  });
});
