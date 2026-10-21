/**
 * Unit tests — los avisos de suscripción: cuándo salen, con qué datos y SOLO UNA VEZ.
 *
 * Stripe, Resend y la base están simulados. La memoria de «ya se avisó» es un
 * arreglo en memoria que hace de `audit_logs`: lo que se prueba es la lógica de
 * `lib/suscripcion/avisos.ts`, no el SQL (el SQL tiene su propia prueba, en
 * suscripcion-avisos-almacen.test.ts).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Simulacros ───────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000;

const memoria = vi.hoisted(() => ({
  filas: [] as { teamId: number; clave: string; meta: Record<string, unknown>; en: Date }[],
  pruebas: [] as { teamId: number; suscripcionId: string; trialEnd: Date }[],
  billing: true,
}));

vi.mock('@/lib/config/billing', () => ({
  get BILLING_ENABLED() { return memoria.billing; },
}));

vi.mock('@/lib/suscripcion/avisos-almacen', () => ({
  yaAvisado: vi.fn(async (clave: string, ventana: number | null, ahora: Date = new Date()) =>
    memoria.filas.some(f =>
      f.clave === clave && (ventana == null || f.en.getTime() >= ahora.getTime() - ventana * DIA_MS))),
  registrarAviso: vi.fn(async (teamId: number, clave: string, meta: Record<string, unknown> = {}) => {
    memoria.filas.push({ teamId, clave, meta, en: new Date() });
  }),
  pruebasQueTerminanEntre: vi.fn(async () => memoria.pruebas),
}));

const destinatarioDe = vi.fn();
vi.mock('@/lib/suscripcion/destinatario', () => ({
  destinatarioDeSuscripcion: destinatarioDe,
}));

const correo = vi.hoisted(() => ({
  enviarCuentaActivada: vi.fn(),
  enviarPruebaPorVencer: vi.fn(),
  enviarPagoRecibido: vi.fn(),
}));
vi.mock('@/lib/email/suscripcion', () => correo);

const stripeMock = vi.hoisted(() => ({
  subscriptions: { retrieve: vi.fn() },
  customers: { retrieve: vi.fn() },
  paymentMethods: { retrieve: vi.fn() },
  prices: { retrieve: vi.fn() },
}));
vi.mock('@/lib/payments/stripe', () => ({ stripe: stripeMock }));

vi.stubEnv('STRIPE_PRICE_COLEGIO_BASICO', 'price_basico_lista');
vi.stubEnv('STRIPE_PRICE_NEGOCIO', 'price_negocio_lista');

const {
  avisarCuentaActivada, avisarPruebaPorVencer, avisarPruebasA7Dias, avisarPagoRecibido,
} = await import('@/lib/suscripcion/avisos');
const { yaAvisado } = await import('@/lib/suscripcion/avisos-almacen');

// ─── Datos de ejemplo ─────────────────────────────────────────────────────────

const seg = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

const DUENO = { email: 'dueno@colegio.test', empresa: 'Colegio Los Pinos', plan: 'Gratis' };

const visa = { id: 'pm_1', card: { last4: '4242', brand: 'visa' } };

/** Una suscripción como la devuelve Stripe, con el plan Básico de colegio por defecto. */
function suscripcion(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'trialing',
    customer: 'cus_1',
    trial_end: seg('2026-11-05T14:00:00Z'),
    default_payment_method: null,
    items: {
      data: [{
        quantity: 1,
        current_period_end: seg('2026-11-05T14:00:00Z'),
        price: {
          id: 'price_basico_lista', product: 'prod_basico',
          unit_amount: 13500, currency: 'usd', recurring: { interval: 'month', interval_count: 1 },
        },
      }],
    },
    ...over,
  };
}

function factura(over: Record<string, unknown> = {}) {
  return {
    id: 'in_1',
    amount_paid: 13500,
    currency: 'usd',
    hosted_invoice_url: 'https://invoice.stripe.com/i/acct_1/test_abc',
    parent: { subscription_details: { subscription: 'sub_1' } },
    lines: { data: [{ amount: 13500, period: { start: seg('2026-11-05T14:00:00Z'), end: seg('2026-12-05T14:00:00Z') } }] },
    ...over,
  };
}

beforeEach(() => {
  memoria.filas.length = 0;
  memoria.pruebas.length = 0;
  memoria.billing = true;

  vi.clearAllMocks();
  destinatarioDe.mockResolvedValue({ ...DUENO });
  correo.enviarCuentaActivada.mockResolvedValue(undefined);
  correo.enviarPruebaPorVencer.mockResolvedValue(undefined);
  correo.enviarPagoRecibido.mockResolvedValue(undefined);

  stripeMock.subscriptions.retrieve.mockResolvedValue(suscripcion());
  stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_1', invoice_settings: { default_payment_method: null } });
  stripeMock.paymentMethods.retrieve.mockResolvedValue(visa);
  stripeMock.prices.retrieve.mockResolvedValue({ id: 'x', product: 'prod_otro' });
});

// ─── 1. Cuenta activada ───────────────────────────────────────────────────────

describe('avisarCuentaActivada', () => {
  it('prueba SIN tarjeta: manda el correo con el plan de Stripe (no el de la fila), el precio y metodo null', async () => {
    const r = await avisarCuentaActivada(7, 'sub_1');

    expect(r).toBe('enviado');
    expect(correo.enviarCuentaActivada).toHaveBeenCalledTimes(1);
    const arg = correo.enviarCuentaActivada.mock.calls[0][0];
    expect(arg).toMatchObject({
      email: 'dueno@colegio.test',
      empresa: 'Colegio Los Pinos',
      plan: 'Básico',            // el nombre de pantalla del plan de la suscripción, no «Gratis»
      estado: 'trialing',
      metodo: null,
      precio: { centavos: 13500, moneda: 'usd', intervalo: 'month', cada: 1 },
    });
    expect(arg.fecha.toISOString()).toBe('2026-11-05T14:00:00.000Z');
  });

  it('pregunta a Stripe por la suscripción vigente con el método de pago expandido', async () => {
    await avisarCuentaActivada(7, 'sub_1');
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_1', { expand: ['default_payment_method'] });
  });

  it('con método en la suscripción: lleva los últimos 4 y no consulta al cliente', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(suscripcion({ default_payment_method: visa }));

    await avisarCuentaActivada(7, 'sub_1');

    expect(correo.enviarCuentaActivada.mock.calls[0][0].metodo).toEqual({ last4: '4242', marca: 'visa' });
    expect(stripeMock.customers.retrieve).not.toHaveBeenCalled();
  });

  it('sin método en la suscripción pero con uno predeterminado en el cliente: lo usa', async () => {
    stripeMock.customers.retrieve.mockResolvedValue({
      id: 'cus_1', invoice_settings: { default_payment_method: visa },
    });

    await avisarCuentaActivada(7, 'sub_1');

    expect(stripeMock.customers.retrieve).toHaveBeenCalledWith('cus_1', { expand: ['invoice_settings.default_payment_method'] });
    expect(correo.enviarCuentaActivada.mock.calls[0][0].metodo).toEqual({ last4: '4242', marca: 'visa' });
  });

  it('un método que viene solo como ID se consulta aparte', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(suscripcion({ default_payment_method: 'pm_1' }));

    await avisarCuentaActivada(7, 'sub_1');

    expect(stripeMock.paymentMethods.retrieve).toHaveBeenCalledWith('pm_1');
    expect(correo.enviarCuentaActivada.mock.calls[0][0].metodo?.last4).toBe('4242');
  });

  it('ya pagando (active): el correo habla del próximo cobro', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(suscripcion({ status: 'active', trial_end: null }));

    await avisarCuentaActivada(7, 'sub_1');

    const arg = correo.enviarCuentaActivada.mock.calls[0][0];
    expect(arg.estado).toBe('active');
    expect(arg.fecha.toISOString()).toBe('2026-11-05T14:00:00.000Z');
  });

  it('anota la llave activada:{team}:{plan} con la acción de aviso DESPUÉS de enviar', async () => {
    await avisarCuentaActivada(7, 'sub_1');

    expect(memoria.filas).toHaveLength(1);
    expect(memoria.filas[0].teamId).toBe(7);
    expect(memoria.filas[0].clave).toBe('activada:7:colegio-basico');
    expect(memoria.filas[0].meta).toMatchObject({ aviso: 'activada', suscripcionId: 'sub_1' });
  });

  it('el mismo evento otra vez (reintento de Stripe): no manda nada', async () => {
    await avisarCuentaActivada(7, 'sub_1');
    const r = await avisarCuentaActivada(7, 'sub_1');

    expect(r).toBe('ya-enviado');
    expect(correo.enviarCuentaActivada).toHaveBeenCalledTimes(1);
    expect(memoria.filas).toHaveLength(1);
  });

  it('recrear la suscripción (ampliar la prueba) con el MISMO plan dentro de 60 días: no repite', async () => {
    await avisarCuentaActivada(7, 'sub_1');
    stripeMock.subscriptions.retrieve.mockResolvedValue(suscripcion({ id: 'sub_2' }));

    const r = await avisarCuentaActivada(7, 'sub_2');

    expect(r).toBe('ya-enviado');
    expect(correo.enviarCuentaActivada).toHaveBeenCalledTimes(1);
  });

  it('pasados los 60 días, un cliente que vuelve SÍ recibe el correo otra vez', async () => {
    memoria.filas.push({
      teamId: 7, clave: 'activada:7:colegio-basico', meta: {}, en: new Date(Date.now() - 61 * DIA_MS),
    });

    expect(await avisarCuentaActivada(7, 'sub_1')).toBe('enviado');
    expect(yaAvisado).toHaveBeenCalledWith('activada:7:colegio-basico', 60);
  });

  it('dentro de los 60 días (59) todavía no repite', async () => {
    memoria.filas.push({
      teamId: 7, clave: 'activada:7:colegio-basico', meta: {}, en: new Date(Date.now() - 59 * DIA_MS),
    });

    expect(await avisarCuentaActivada(7, 'sub_1')).toBe('ya-enviado');
  });

  it('OTRO plan de la misma empresa sí recibe su correo (la llave lleva el plan)', async () => {
    await avisarCuentaActivada(7, 'sub_1');
    stripeMock.subscriptions.retrieve.mockResolvedValue(suscripcion({
      id: 'sub_2',
      items: { data: [{ quantity: 1, price: {
        id: 'price_negocio_lista', product: 'prod_negocio', unit_amount: 1900, currency: 'usd',
        recurring: { interval: 'month', interval_count: 1 },
      } }] },
    }));

    expect(await avisarCuentaActivada(7, 'sub_2')).toBe('enviado');
    expect(memoria.filas.map(f => f.clave)).toEqual(['activada:7:colegio-basico', 'activada:7:negocio']);
  });

  it('OTRA empresa con el mismo plan no se ve afectada', async () => {
    await avisarCuentaActivada(7, 'sub_1');
    expect(await avisarCuentaActivada(8, 'sub_1')).toBe('enviado');
  });

  it('si la suscripción ya no está viva cuando llega el aviso (canceled): no manda ni anota', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(suscripcion({ status: 'canceled' }));

    expect(await avisarCuentaActivada(7, 'sub_1')).toBe('omitido');
    expect(correo.enviarCuentaActivada).not.toHaveBeenCalled();
    expect(memoria.filas).toHaveLength(0);
  });

  it('incomplete (el pago del checkout aún no pasa): no manda', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(suscripcion({ status: 'incomplete' }));
    expect(await avisarCuentaActivada(7, 'sub_1')).toBe('omitido');
  });

  it('con el billing apagado no manda: el botón llevaría a un 404', async () => {
    memoria.billing = false;

    expect(await avisarCuentaActivada(7, 'sub_1')).toBe('omitido');
    expect(correo.enviarCuentaActivada).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('si Resend falla NO se anota: el siguiente intento puede mandarlo', async () => {
    correo.enviarCuentaActivada.mockRejectedValueOnce(new Error('Resend falló'));

    await expect(avisarCuentaActivada(7, 'sub_1')).rejects.toThrow('Resend falló');
    expect(memoria.filas).toHaveLength(0);

    expect(await avisarCuentaActivada(7, 'sub_1')).toBe('enviado');
  });

  it('si Stripe no contesta al buscar el método de pago, NO manda el correo equivocado ni anota', async () => {
    stripeMock.customers.retrieve.mockRejectedValue(new Error('Stripe caído'));

    await expect(avisarCuentaActivada(7, 'sub_1')).rejects.toThrow('Stripe caído');
    expect(correo.enviarCuentaActivada).not.toHaveBeenCalled();
    expect(memoria.filas).toHaveLength(0);
  });

  it('sin destinatario: avisa en el log, no manda y no anota', async () => {
    destinatarioDe.mockResolvedValue(null);

    expect(await avisarCuentaActivada(7, 'sub_1')).toBe('sin-destinatario');
    expect(correo.enviarCuentaActivada).not.toHaveBeenCalled();
    expect(memoria.filas).toHaveLength(0);
  });

  it('un precio especial del producto del plan sigue siendo ese plan', async () => {
    // Precio que no es el de lista, pero cuyo producto es el del plan Negocio.
    stripeMock.prices.retrieve.mockImplementation(async (id: string) => ({
      id, product: id === 'price_negocio_lista' ? 'prod_negocio' : 'prod_otro',
    }));
    stripeMock.subscriptions.retrieve.mockResolvedValue(suscripcion({
      items: { data: [{ quantity: 1, price: {
        id: 'price_negocio_especial', product: 'prod_negocio', unit_amount: 1200, currency: 'usd',
        recurring: { interval: 'month', interval_count: 1 },
      } }] },
    }));

    await avisarCuentaActivada(9, 'sub_1');

    expect(correo.enviarCuentaActivada.mock.calls[0][0].plan).toBe('Negocio');
    expect(memoria.filas[0].clave).toBe('activada:9:negocio');
  });
});

// ─── 2. Prueba por vencer (3 días, desde el webhook) ──────────────────────────

describe('avisarPruebaPorVencer — 3 días (trial_will_end)', () => {
  // 25 de octubre 10 a. m. RD; hoy es 22, 8 a. m. RD.
  const venceEl = '2026-10-25T14:00:00Z';
  const ahora = new Date('2026-10-22T12:00:00Z');

  beforeEach(() => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(suscripcion({ trial_end: seg(venceEl) }));
  });

  it('SIN tarjeta: manda la variante de «agrega tu método de pago» (metodo null)', async () => {
    const r = await avisarPruebaPorVencer({ teamId: 7, suscripcionId: 'sub_1', diasAntes: 3, ahora });

    expect(r).toBe('enviado');
    expect(correo.enviarPruebaPorVencer).toHaveBeenCalledTimes(1);
    expect(correo.enviarPruebaPorVencer.mock.calls[0][0]).toMatchObject({
      email: 'dueno@colegio.test',
      plan: 'Básico',
      diasRestantes: 3,
      metodo: null,
      precio: { centavos: 13500, moneda: 'usd' },
    });
  });

  it('CON tarjeta: lleva los últimos 4 y el precio para el recordatorio de cobro', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(
      suscripcion({ trial_end: seg(venceEl), default_payment_method: visa }),
    );

    await avisarPruebaPorVencer({ teamId: 7, suscripcionId: 'sub_1', diasAntes: 3, ahora });

    const arg = correo.enviarPruebaPorVencer.mock.calls[0][0];
    expect(arg.metodo).toEqual({ last4: '4242', marca: 'visa' });
    expect(arg.venceEl.toISOString()).toBe('2026-10-25T14:00:00.000Z');
  });

  it('anota prueba-3:{suscripción}; un reintento del mismo evento no repite', async () => {
    await avisarPruebaPorVencer({ teamId: 7, suscripcionId: 'sub_1', diasAntes: 3, ahora });
    expect(memoria.filas.map(f => f.clave)).toEqual(['prueba-3:sub_1']);

    const r = await avisarPruebaPorVencer({ teamId: 7, suscripcionId: 'sub_1', diasAntes: 3, ahora });
    expect(r).toBe('ya-enviado');
    expect(correo.enviarPruebaPorVencer).toHaveBeenCalledTimes(1);
  });

  it('el aviso de 3 días no lo bloquea haber mandado el de 7 (llaves distintas)', async () => {
    memoria.filas.push({ teamId: 7, clave: 'prueba-7:sub_1', meta: {}, en: new Date() });

    expect(await avisarPruebaPorVencer({ teamId: 7, suscripcionId: 'sub_1', diasAntes: 3, ahora })).toBe('enviado');
  });

  it('la prueba ya no existe (el cliente pagó antes): no manda y no anota', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(suscripcion({ status: 'active', trial_end: null }));

    expect(await avisarPruebaPorVencer({ teamId: 7, suscripcionId: 'sub_1', diasAntes: 3, ahora })).toBe('omitido');
    expect(correo.enviarPruebaPorVencer).not.toHaveBeenCalled();
    expect(memoria.filas).toHaveLength(0);
  });

  it('un fallo de Resend no anota', async () => {
    correo.enviarPruebaPorVencer.mockRejectedValueOnce(new Error('Resend falló'));

    await expect(
      avisarPruebaPorVencer({ teamId: 7, suscripcionId: 'sub_1', diasAntes: 3, ahora }),
    ).rejects.toThrow();
    expect(memoria.filas).toHaveLength(0);
  });

  it('a 3 días NO se consulta la base si ya estaba anotado (no gasta llamadas a Stripe)', async () => {
    memoria.filas.push({ teamId: 7, clave: 'prueba-3:sub_1', meta: {}, en: new Date() });

    await avisarPruebaPorVencer({ teamId: 7, suscripcionId: 'sub_1', diasAntes: 3, ahora });

    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
  });
});

// ─── 3. Prueba por vencer (7 días, desde el cron) ─────────────────────────────

describe('avisarPruebasA7Dias — el barrido diario', () => {
  // El cron corre a las 11:00 UTC (07:00 RD) del 21 de octubre.
  const ahora = new Date('2026-10-21T11:00:00Z');
  const en = (iso: string) => new Date(iso);

  /** Cada suscripción de Stripe, por id. */
  function stripeTiene(subs: Record<string, unknown>) {
    stripeMock.subscriptions.retrieve.mockImplementation(async (id: string) => {
      const s = subs[id];
      if (s instanceof Error) throw s;
      return s;
    });
  }

  it('avisa SOLO a quien le faltan exactamente 7 días (fecha dominicana)', async () => {
    memoria.pruebas.push(
      { teamId: 1, suscripcionId: 'sub_1', trialEnd: en('2026-10-28T14:00:00Z') }, // 7 → sí
      { teamId: 2, suscripcionId: 'sub_2', trialEnd: en('2026-10-27T14:00:00Z') }, // 6 → no
      { teamId: 3, suscripcionId: 'sub_3', trialEnd: en('2026-10-29T14:00:00Z') }, // 8 → no
      { teamId: 4, suscripcionId: 'sub_4', trialEnd: en('2026-10-29T02:00:00Z') }, // 28 a las 10 p. m. RD → sí
    );
    stripeTiene({
      sub_1: suscripcion({ id: 'sub_1', trial_end: seg('2026-10-28T14:00:00Z') }),
      sub_4: suscripcion({ id: 'sub_4', trial_end: seg('2026-10-29T02:00:00Z') }),
    });

    const r = await avisarPruebasA7Dias(ahora);

    expect(r.enviados).toEqual([1, 4]);
    expect(r.omitidas).toBe(2);
    expect(r.fallos).toEqual([]);
    expect(correo.enviarPruebaPorVencer).toHaveBeenCalledTimes(2);
    expect(correo.enviarPruebaPorVencer.mock.calls[0][0]).toMatchObject({ diasRestantes: 7 });
    expect(memoria.filas.map(f => f.clave)).toEqual(['prueba-7:sub_1', 'prueba-7:sub_4']);
  });

  it('con tarjeta o sin ella, según lo que diga Stripe de cada una', async () => {
    memoria.pruebas.push(
      { teamId: 1, suscripcionId: 'sub_1', trialEnd: en('2026-10-28T14:00:00Z') },
      { teamId: 2, suscripcionId: 'sub_2', trialEnd: en('2026-10-28T15:00:00Z') },
    );
    stripeTiene({
      sub_1: suscripcion({ id: 'sub_1', trial_end: seg('2026-10-28T14:00:00Z'), default_payment_method: visa }),
      sub_2: suscripcion({ id: 'sub_2', trial_end: seg('2026-10-28T15:00:00Z') }),
    });

    await avisarPruebasA7Dias(ahora);

    const [con, sin] = correo.enviarPruebaPorVencer.mock.calls.map(c => c[0]);
    expect(con.metodo).toEqual({ last4: '4242', marca: 'visa' });
    expect(sin.metodo).toBeNull();
  });

  it('correr el cron dos veces el mismo día no manda dos correos', async () => {
    memoria.pruebas.push({ teamId: 1, suscripcionId: 'sub_1', trialEnd: en('2026-10-28T14:00:00Z') });
    stripeTiene({ sub_1: suscripcion({ id: 'sub_1', trial_end: seg('2026-10-28T14:00:00Z') }) });

    const primera = await avisarPruebasA7Dias(ahora);
    const segunda = await avisarPruebasA7Dias(ahora);

    expect(primera.enviados).toEqual([1]);
    expect(segunda.enviados).toEqual([]);
    expect(segunda.omitidas).toBe(1);
    expect(correo.enviarPruebaPorVencer).toHaveBeenCalledTimes(1);
  });

  it('si la prueba se movió en Stripe desde que se guardó la fila, no manda un «7 días» falso', async () => {
    memoria.pruebas.push({ teamId: 1, suscripcionId: 'sub_1', trialEnd: en('2026-10-28T14:00:00Z') });
    // Stripe ya la amplió a diciembre.
    stripeTiene({ sub_1: suscripcion({ id: 'sub_1', trial_end: seg('2026-12-01T14:00:00Z') }) });

    const r = await avisarPruebasA7Dias(ahora);

    expect(r.enviados).toEqual([]);
    expect(r.omitidas).toBe(1);
    expect(correo.enviarPruebaPorVencer).not.toHaveBeenCalled();
    expect(memoria.filas).toHaveLength(0);
  });

  it('una empresa que falla (Stripe) no deja sin aviso a las demás', async () => {
    memoria.pruebas.push(
      { teamId: 1, suscripcionId: 'sub_1', trialEnd: en('2026-10-28T14:00:00Z') },
      { teamId: 2, suscripcionId: 'sub_2', trialEnd: en('2026-10-28T14:00:00Z') },
      { teamId: 3, suscripcionId: 'sub_3', trialEnd: en('2026-10-28T14:00:00Z') },
    );
    stripeTiene({
      sub_1: suscripcion({ id: 'sub_1', trial_end: seg('2026-10-28T14:00:00Z') }),
      sub_2: new Error('Stripe 500'),
      sub_3: suscripcion({ id: 'sub_3', trial_end: seg('2026-10-28T14:00:00Z') }),
    });

    const r = await avisarPruebasA7Dias(ahora);

    expect(r.enviados).toEqual([1, 3]);
    expect(r.fallos).toEqual([{ teamId: 2, error: 'Stripe 500' }]);
  });

  it('una empresa sin destinatario se reporta como fallo, no se pierde en silencio', async () => {
    memoria.pruebas.push({ teamId: 1, suscripcionId: 'sub_1', trialEnd: en('2026-10-28T14:00:00Z') });
    stripeTiene({ sub_1: suscripcion({ id: 'sub_1', trial_end: seg('2026-10-28T14:00:00Z') }) });
    destinatarioDe.mockResolvedValue(null);

    const r = await avisarPruebasA7Dias(ahora);

    expect(r.fallos).toEqual([{ teamId: 1, error: 'sin destinatario' }]);
    expect(r.enviados).toEqual([]);
  });

  it('sin pruebas cerca de la fecha, no hace nada', async () => {
    const r = await avisarPruebasA7Dias(ahora);
    expect(r).toEqual({ revisadas: 0, enviados: [], omitidas: 0, fallos: [] });
  });
});

// ─── 4. Pago recibido ─────────────────────────────────────────────────────────

describe('avisarPagoRecibido', () => {
  const inv = (over: Record<string, unknown> = {}) => factura(over) as never;

  it('con dinero cobrado: manda monto, plan, período y recibo', async () => {
    const r = await avisarPagoRecibido(7, inv());

    expect(r).toBe('enviado');
    const arg = correo.enviarPagoRecibido.mock.calls[0][0];
    expect(arg).toMatchObject({
      email: 'dueno@colegio.test',
      empresa: 'Colegio Los Pinos',
      centavos: 13500,
      moneda: 'usd',
      plan: 'Básico',
      urlRecibo: 'https://invoice.stripe.com/i/acct_1/test_abc',
    });
    expect(arg.periodo.desde.toISOString()).toBe('2026-11-05T14:00:00.000Z');
    expect(arg.periodo.hasta.toISOString()).toBe('2026-12-05T14:00:00.000Z');
  });

  it('la factura de $0 de una prueba NO manda nada, ni gasta llamadas', async () => {
    const r = await avisarPagoRecibido(7, inv({ amount_paid: 0 }));

    expect(r).toBe('omitido');
    expect(correo.enviarPagoRecibido).not.toHaveBeenCalled();
    expect(destinatarioDe).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(memoria.filas).toHaveLength(0);
  });

  it('anota pago:{factura}; el mismo evento reintentado no repite el recibo', async () => {
    await avisarPagoRecibido(7, inv());
    expect(memoria.filas.map(f => f.clave)).toEqual(['pago:in_1']);
    expect(memoria.filas[0].meta).toMatchObject({ aviso: 'pago', facturaId: 'in_1', centavos: 13500 });

    const r = await avisarPagoRecibido(7, inv());
    expect(r).toBe('ya-enviado');
    expect(correo.enviarPagoRecibido).toHaveBeenCalledTimes(1);
  });

  it('dos facturas distintas (dos meses) sí mandan dos recibos', async () => {
    await avisarPagoRecibido(7, inv({ id: 'in_1' }));
    await avisarPagoRecibido(7, inv({ id: 'in_2' }));

    expect(correo.enviarPagoRecibido).toHaveBeenCalledTimes(2);
    expect(memoria.filas.map(f => f.clave)).toEqual(['pago:in_1', 'pago:in_2']);
  });

  it('si no se puede resolver el plan en Stripe, el recibo sale igual (con el plan que ya tiene la empresa)', async () => {
    destinatarioDe.mockResolvedValue({ ...DUENO, plan: 'Negocio' });
    stripeMock.subscriptions.retrieve.mockRejectedValue(new Error('Stripe 500'));

    const r = await avisarPagoRecibido(7, inv());

    expect(r).toBe('enviado');
    expect(correo.enviarPagoRecibido.mock.calls[0][0].plan).toBe('Negocio');
  });

  it('un cobro sin suscripción y sin plan reconocible no dice «Plan Gratis»', async () => {
    const r = await avisarPagoRecibido(7, inv({ parent: null }));

    expect(r).toBe('enviado');
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(correo.enviarPagoRecibido.mock.calls[0][0].plan).toBeNull();
  });

  it('sin recibo alojado, urlRecibo es null', async () => {
    await avisarPagoRecibido(7, inv({ hosted_invoice_url: null }));
    expect(correo.enviarPagoRecibido.mock.calls[0][0].urlRecibo).toBeNull();
  });

  it('pesos dominicanos: viaja la moneda tal cual', async () => {
    await avisarPagoRecibido(7, inv({ currency: 'dop', amount_paid: 800000 }));
    const arg = correo.enviarPagoRecibido.mock.calls[0][0];
    expect(arg.moneda).toBe('dop');
    expect(arg.centavos).toBe(800000);
  });

  it('un fallo de Resend no anota (el siguiente intento puede mandarlo)', async () => {
    correo.enviarPagoRecibido.mockRejectedValueOnce(new Error('Resend falló'));

    await expect(avisarPagoRecibido(7, inv())).rejects.toThrow();
    expect(memoria.filas).toHaveLength(0);
  });

  it('con el billing apagado no manda', async () => {
    memoria.billing = false;
    expect(await avisarPagoRecibido(7, inv())).toBe('omitido');
    expect(correo.enviarPagoRecibido).not.toHaveBeenCalled();
  });
});
