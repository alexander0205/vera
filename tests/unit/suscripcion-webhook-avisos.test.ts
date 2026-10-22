/**
 * Unit tests — qué eventos de Stripe disparan qué aviso en el webhook.
 *
 * Ni Stripe, ni la base, ni Resend: todo simulado. El webhook se llama como lo
 * llamaría Next, con un evento ya "verificado". Lo que se cuida:
 *
 *  · que cada evento llegue al aviso correcto (y los que no, a ninguno);
 *  · que la lógica de mora que ya existía siga intacta;
 *  · que un aviso que revienta NUNCA devuelva error a Stripe — Stripe
 *    reintentaría un cambio de plan que ya se aplicó.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const m = vi.hoisted(() => ({
  team: null as null | Record<string, unknown>,
  updates: [] as unknown[],
  constructEvent: vi.fn(),
  getTeamByStripeCustomerId: vi.fn(),
  sincronizarConStripe: vi.fn(),
  sincronizarPorCustomer: vi.fn(),
  destinatario: vi.fn(),
  enviarCobroFallido: vi.fn(),
  enviarCancelacionProgramada: vi.fn(),
  avisarCuentaActivada: vi.fn(),
  avisarPagoRecibido: vi.fn(),
  avisarPruebaPorVencer: vi.fn(),
  equipoPorMetadata: vi.fn(),
}));

vi.mock('@/lib/payments/stripe', () => ({
  stripe: { webhooks: { constructEvent: m.constructEvent } },
}));
vi.mock('@/lib/db/drizzle', () => ({
  db: { update: () => ({ set: (v: unknown) => ({ where: async () => { m.updates.push(v); } }) }) },
}));
vi.mock('@/lib/db/queries', () => ({ getTeamByStripeCustomerId: m.getTeamByStripeCustomerId }));
vi.mock('@/lib/payments/sincronizar', () => ({
  sincronizarConStripe: m.sincronizarConStripe,
  sincronizarPorCustomer: m.sincronizarPorCustomer,
}));
vi.mock('@/lib/suscripcion/destinatario', () => ({ destinatarioDeSuscripcion: m.destinatario }));
vi.mock('@/lib/email/suscripcion', () => ({
  enviarCobroFallido: m.enviarCobroFallido,
  enviarCancelacionProgramada: m.enviarCancelacionProgramada,
}));
vi.mock('@/lib/suscripcion/avisos', () => ({
  avisarCuentaActivada: m.avisarCuentaActivada,
  avisarPagoRecibido: m.avisarPagoRecibido,
  avisarPruebaPorVencer: m.avisarPruebaPorVencer,
}));

vi.mock('@/lib/suscripcion/avisos-almacen', () => ({ equipoPorMetadata: m.equipoPorMetadata }));

const { POST } = await import('@/app/api/stripe/webhook/route');

/** Entrega un evento al webhook. */
async function entregar(type: string, object: Record<string, unknown>) {
  m.constructEvent.mockReturnValue({ type, data: { object } });
  const req = { text: async () => '{}', headers: { get: () => 'firma' } };
  const res = await POST(req as never);
  return { status: res.status, cuerpo: await res.json() };
}

const equipo = (over: Record<string, unknown> = {}) => ({
  id: 7, morosoDesde: null, cancelarAlFin: false, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.updates.length = 0;

  m.getTeamByStripeCustomerId.mockResolvedValue(equipo());
  m.sincronizarConStripe.mockResolvedValue({ aplicado: true, status: 'trialing', plan: 'negocio' });
  m.sincronizarPorCustomer.mockResolvedValue({ aplicado: true, status: 'active', plan: 'negocio' });
  m.destinatario.mockResolvedValue({ email: 'dueno@colegio.test', empresa: 'Colegio Los Pinos', plan: 'Negocio' });
  m.enviarCobroFallido.mockResolvedValue(undefined);
  m.enviarCancelacionProgramada.mockResolvedValue(undefined);
  m.avisarCuentaActivada.mockResolvedValue('enviado');
  m.avisarPagoRecibido.mockResolvedValue('enviado');
  m.avisarPruebaPorVencer.mockResolvedValue('enviado');
  m.equipoPorMetadata.mockResolvedValue(null);

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('customer.subscription.*', () => {
  const sub = { id: 'sub_1', customer: 'cus_1', status: 'trialing', cancel_at_period_end: false, items: { data: [] } };

  it('created: sincroniza y DESPUÉS avisa «cuenta activada»', async () => {
    const { status, cuerpo } = await entregar('customer.subscription.created', sub);

    expect(status).toBe(200);
    expect(cuerpo).toEqual({ received: true });
    expect(m.sincronizarConStripe).toHaveBeenCalledWith(7);
    expect(m.avisarCuentaActivada).toHaveBeenCalledWith(7, 'sub_1');
    expect(m.sincronizarConStripe.mock.invocationCallOrder[0])
      .toBeLessThan(m.avisarCuentaActivada.mock.invocationCallOrder[0]);
  });

  it('updated y deleted NO avisan «cuenta activada»', async () => {
    await entregar('customer.subscription.updated', sub);
    await entregar('customer.subscription.deleted', sub);

    expect(m.sincronizarConStripe).toHaveBeenCalledTimes(2);
    expect(m.avisarCuentaActivada).not.toHaveBeenCalled();
  });

  it('un customer sin empresa no avisa a nadie', async () => {
    m.getTeamByStripeCustomerId.mockResolvedValue(null);

    await entregar('customer.subscription.created', sub);

    expect(m.sincronizarConStripe).not.toHaveBeenCalled();
    expect(m.avisarCuentaActivada).not.toHaveBeenCalled();
  });

  it('si el aviso revienta, Stripe recibe 200 igual (no se reintenta un cambio ya aplicado)', async () => {
    m.avisarCuentaActivada.mockRejectedValue(new Error('Resend caído'));

    const { status, cuerpo } = await entregar('customer.subscription.created', sub);

    expect(status).toBe(200);
    expect(cuerpo).toEqual({ received: true });
    expect(m.sincronizarConStripe).toHaveBeenCalledTimes(1);
  });

  it('la cancelación programada sigue avisándose como antes', async () => {
    await entregar('customer.subscription.updated', {
      ...sub, cancel_at_period_end: true,
      items: { data: [{ current_period_end: 1_793_000_000 }] },
    });

    expect(m.enviarCancelacionProgramada).toHaveBeenCalledTimes(1);
    expect(m.avisarCuentaActivada).not.toHaveBeenCalled();
  });
});

describe('customer.subscription.trial_will_end', () => {
  it('avisa «prueba por vencer» a 3 días de esa suscripción', async () => {
    await entregar('customer.subscription.trial_will_end', {
      id: 'sub_1', customer: 'cus_1', trial_end: 1_793_000_000,
    });

    expect(m.avisarPruebaPorVencer).toHaveBeenCalledTimes(1);
    expect(m.avisarPruebaPorVencer).toHaveBeenCalledWith({
      teamId: 7, suscripcionId: 'sub_1', diasAntes: 3,
    });
  });

  it('sin fecha de fin de prueba, no avisa', async () => {
    await entregar('customer.subscription.trial_will_end', { id: 'sub_1', customer: 'cus_1', trial_end: null });
    expect(m.avisarPruebaPorVencer).not.toHaveBeenCalled();
  });

  it('un aviso que falla no tumba el webhook', async () => {
    m.avisarPruebaPorVencer.mockRejectedValue(new Error('Stripe 500'));

    const { status } = await entregar('customer.subscription.trial_will_end', {
      id: 'sub_1', customer: 'cus_1', trial_end: 1_793_000_000,
    });
    expect(status).toBe(200);
  });
});

describe('invoice.payment_succeeded', () => {
  const pagada = { id: 'in_1', customer: 'cus_1', amount_paid: 13500, currency: 'usd' };

  it('con dinero: avisa «pago recibido» con la factura', async () => {
    await entregar('invoice.payment_succeeded', pagada);

    expect(m.avisarPagoRecibido).toHaveBeenCalledTimes(1);
    expect(m.avisarPagoRecibido).toHaveBeenCalledWith(7, expect.objectContaining({ id: 'in_1', amount_paid: 13500 }));
  });

  it('la factura de $0 (inicio de prueba) no avisa', async () => {
    await entregar('invoice.payment_succeeded', { ...pagada, amount_paid: 0 });
    expect(m.avisarPagoRecibido).not.toHaveBeenCalled();
  });

  it('sin mora no sincroniza (como antes), pero el recibo sí sale', async () => {
    await entregar('invoice.payment_succeeded', pagada);

    expect(m.sincronizarPorCustomer).not.toHaveBeenCalled();
    expect(m.avisarPagoRecibido).toHaveBeenCalledTimes(1);
  });

  it('EN MORA: sigue sacando a la empresa de mora Y manda el recibo', async () => {
    m.getTeamByStripeCustomerId.mockResolvedValue(equipo({ morosoDesde: new Date('2026-10-10') }));

    await entregar('invoice.payment_succeeded', pagada);

    expect(m.sincronizarPorCustomer).toHaveBeenCalledWith('cus_1');
    expect(m.avisarPagoRecibido).toHaveBeenCalledTimes(1);
    expect(m.sincronizarPorCustomer.mock.invocationCallOrder[0])
      .toBeLessThan(m.avisarPagoRecibido.mock.invocationCallOrder[0]);
  });

  it('en mora y con factura de $0: sale de mora, no manda recibo', async () => {
    m.getTeamByStripeCustomerId.mockResolvedValue(equipo({ morosoDesde: new Date('2026-10-10') }));

    await entregar('invoice.payment_succeeded', { ...pagada, amount_paid: 0 });

    expect(m.sincronizarPorCustomer).toHaveBeenCalledTimes(1);
    expect(m.avisarPagoRecibido).not.toHaveBeenCalled();
  });

  it('un customer sin empresa no hace nada', async () => {
    m.getTeamByStripeCustomerId.mockResolvedValue(null);

    await entregar('invoice.payment_succeeded', pagada);

    expect(m.sincronizarPorCustomer).not.toHaveBeenCalled();
    expect(m.avisarPagoRecibido).not.toHaveBeenCalled();
  });

  it('si el recibo falla, la mora ya quedó cerrada y Stripe recibe 200', async () => {
    m.getTeamByStripeCustomerId.mockResolvedValue(equipo({ morosoDesde: new Date('2026-10-10') }));
    m.avisarPagoRecibido.mockRejectedValue(new Error('Resend caído'));

    const { status, cuerpo } = await entregar('invoice.payment_succeeded', pagada);

    expect(status).toBe(200);
    expect(cuerpo).toEqual({ received: true });
    expect(m.sincronizarPorCustomer).toHaveBeenCalledTimes(1);
  });
});

describe('la carrera con el alta: el evento llega antes de que el customer esté atado a la empresa', () => {
  const sub = {
    id: 'sub_1', customer: 'cus_nuevo', status: 'trialing', cancel_at_period_end: false,
    items: { data: [] }, metadata: { teamId: '7', origen: 'onboarding' },
  };

  beforeEach(() => {
    m.getTeamByStripeCustomerId.mockResolvedValue(null);
    m.equipoPorMetadata.mockResolvedValue({ id: 7 });
  });

  it('subscription.created: la bienvenida sale, reconociendo la empresa por la metadata', async () => {
    const { status } = await entregar('customer.subscription.created', sub);

    expect(status).toBe(200);
    expect(m.equipoPorMetadata).toHaveBeenCalledWith('7', 'cus_nuevo');
    expect(m.avisarCuentaActivada).toHaveBeenCalledWith(7, 'sub_1');
  });

  it('...pero NO se sincroniza: la fila aún no tiene customer y sincronizar así la dejaría sin plan', async () => {
    await entregar('customer.subscription.created', sub);
    expect(m.sincronizarConStripe).not.toHaveBeenCalled();
  });

  it('si la metadata no apunta a una empresa válida, se pierde como antes (con el error en el log)', async () => {
    m.equipoPorMetadata.mockResolvedValue(null);

    await entregar('customer.subscription.created', sub);

    expect(m.avisarCuentaActivada).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('updated y deleted NO usan este atajo: solo la bienvenida', async () => {
    await entregar('customer.subscription.updated', sub);
    await entregar('customer.subscription.deleted', sub);

    expect(m.equipoPorMetadata).not.toHaveBeenCalled();
    expect(m.avisarCuentaActivada).not.toHaveBeenCalled();
  });

  it('invoice.payment_succeeded con dinero: el recibo sale, empresa tomada de la metadata de la factura', async () => {
    const factura = {
      id: 'in_9', customer: 'cus_nuevo', amount_paid: 13500, currency: 'usd',
      parent: { subscription_details: { metadata: { teamId: '7' }, subscription: 'sub_1' } },
    };

    await entregar('invoice.payment_succeeded', factura);

    expect(m.equipoPorMetadata).toHaveBeenCalledWith('7', 'cus_nuevo');
    expect(m.avisarPagoRecibido).toHaveBeenCalledWith(7, expect.objectContaining({ id: 'in_9' }));
    expect(m.sincronizarPorCustomer).not.toHaveBeenCalled();
  });

  it('invoice.payment_succeeded de $0 ni siquiera busca la empresa', async () => {
    await entregar('invoice.payment_succeeded', {
      id: 'in_9', customer: 'cus_nuevo', amount_paid: 0,
      parent: { subscription_details: { metadata: { teamId: '7' } } },
    });

    expect(m.equipoPorMetadata).not.toHaveBeenCalled();
    expect(m.avisarPagoRecibido).not.toHaveBeenCalled();
  });

  it('una factura sin metadata no avisa a nadie', async () => {
    m.equipoPorMetadata.mockResolvedValue(null);

    await entregar('invoice.payment_succeeded', { id: 'in_9', customer: 'cus_nuevo', amount_paid: 13500 });

    expect(m.avisarPagoRecibido).not.toHaveBeenCalled();
  });
});

describe('invoice.payment_failed (sin cambios)', () => {
  it('el primer fallo marca la mora y avisa del cobro fallido', async () => {
    await entregar('invoice.payment_failed', { id: 'in_2', customer: 'cus_1' });

    expect(m.sincronizarConStripe).toHaveBeenCalledWith(7);
    expect(m.updates).toHaveLength(1);
    expect(m.enviarCobroFallido).toHaveBeenCalledTimes(1);
    expect(m.avisarPagoRecibido).not.toHaveBeenCalled();
  });

  it('los reintentos no repiten el correo', async () => {
    m.getTeamByStripeCustomerId.mockResolvedValue(equipo({ morosoDesde: new Date('2026-10-10') }));

    await entregar('invoice.payment_failed', { id: 'in_2', customer: 'cus_1' });

    expect(m.enviarCobroFallido).not.toHaveBeenCalled();
  });
});
