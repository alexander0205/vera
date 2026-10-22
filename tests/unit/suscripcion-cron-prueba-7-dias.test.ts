/**
 * Unit tests — el cron diario de suscripciones y su aviso de 7 días.
 *
 * Sin base, sin Stripe, sin Resend. Se comprueba el pegamento: que el barrido
 * de «prueba a 7 días» corra después de reconciliar, que se reporte en la
 * respuesta, que con el billing apagado no se mande nada y que un fallo suyo no
 * esconda lo que el cron ya hizo.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const m = vi.hoisted(() => ({
  billing: true,
  conCliente: [] as { id: number }[],
  candidatas: [] as unknown[],
  orden: [] as string[],
  sincronizarConStripe: vi.fn(),
  avisarPruebasA7Dias: vi.fn(),
  enviarSoloLectura: vi.fn(),
  destinatario: vi.fn(),
}));

vi.mock('@/lib/config/billing', () => ({
  get BILLING_ENABLED() { return m.billing; },
}));
vi.mock('@/lib/db/drizzle', () => {
  // La primera consulta del cron son las empresas con cliente; la segunda, las candidatas a solo lectura.
  let consulta = 0;
  return {
    db: {
      select: () => ({
        from: () => ({
          where: async () => (++consulta % 2 === 1 ? m.conCliente : m.candidatas),
        }),
      }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
    },
  };
});
vi.mock('@/lib/payments/sincronizar', () => ({ sincronizarConStripe: m.sincronizarConStripe }));
vi.mock('@/lib/suscripcion/avisos', () => ({ avisarPruebasA7Dias: m.avisarPruebasA7Dias }));
vi.mock('@/lib/suscripcion/destinatario', () => ({ destinatarioDeSuscripcion: m.destinatario }));
vi.mock('@/lib/email/suscripcion', () => ({ enviarSoloLectura: m.enviarSoloLectura }));

vi.stubEnv('CRON_SECRET', 'secreto-de-prueba');

const { GET } = await import('@/app/api/cron/suscripciones/route');

function llamar(autorizado = true) {
  const req = { headers: { get: (k: string) => (k === 'authorization' && autorizado ? 'Bearer secreto-de-prueba' : null) } };
  return GET(req as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  m.billing = true;
  m.conCliente = [{ id: 1 }, { id: 2 }];
  m.candidatas = [];
  m.orden.length = 0;

  m.sincronizarConStripe.mockImplementation(async () => { m.orden.push('sync'); return { aplicado: true }; });
  m.avisarPruebasA7Dias.mockImplementation(async () => {
    m.orden.push('prueba-7');
    return { revisadas: 3, enviados: [5], omitidas: 2, fallos: [] };
  });

  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('cron de suscripciones — aviso de prueba a 7 días', () => {
  it('corre DESPUÉS de reconciliar con Stripe y lo reporta en la respuesta', async () => {
    const res = await llamar();
    const cuerpo = await res.json();

    expect(m.orden).toEqual(['sync', 'sync', 'prueba-7']);
    expect(m.avisarPruebasA7Dias).toHaveBeenCalledTimes(1);
    expect(m.avisarPruebasA7Dias.mock.calls[0][0]).toBeInstanceOf(Date);
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.pruebaA7Dias).toEqual({ revisadas: 3, avisados: 1, teams: [5], omitidas: 2, fallos: 0 });
  });

  it('conserva lo que ya devolvía (reconciliadas, avisados de solo lectura…)', async () => {
    const cuerpo = await (await llamar()).json();

    expect(cuerpo).toMatchObject({
      ok: true, reconciliadas: 2, reconciliacionFallos: 0, revisadas: 0, avisados: 0, fallos: 0,
    });
  });

  it('con el billing apagado no avisa de nada', async () => {
    m.billing = false;

    const cuerpo = await (await llamar()).json();

    expect(cuerpo).toMatchObject({ ok: true, avisados: 0 });
    expect(m.avisarPruebasA7Dias).not.toHaveBeenCalled();
    expect(m.sincronizarConStripe).not.toHaveBeenCalled();
  });

  it('sin el secreto del cron responde 401 y no toca nada', async () => {
    const res = await llamar(false);

    expect(res.status).toBe(401);
    expect(m.avisarPruebasA7Dias).not.toHaveBeenCalled();
  });

  it('si el barrido de 7 días revienta, el cron igual responde y lo marca', async () => {
    m.avisarPruebasA7Dias.mockRejectedValue(new Error('Stripe caído'));

    const res = await llamar();
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.reconciliadas).toBe(2);
    expect(cuerpo.pruebaA7Dias).toEqual({ error: true });
  });

  it('los fallos por empresa se cuentan en la respuesta', async () => {
    m.avisarPruebasA7Dias.mockResolvedValue({
      revisadas: 2, enviados: [], omitidas: 0, fallos: [{ teamId: 9, error: 'sin destinatario' }],
    });

    const cuerpo = await (await llamar()).json();

    expect(cuerpo.pruebaA7Dias.fallos).toBe(1);
  });
});
