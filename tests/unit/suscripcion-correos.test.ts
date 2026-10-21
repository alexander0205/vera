/**
 * Unit tests — los correos de suscripción: qué asunto y qué texto salen.
 *
 * Resend está simulado: no sale nada de verdad. Se mira el HTML que se le
 * habría entregado, reducido a texto, porque lo que importa es lo que lee el
 * cliente: el monto, la fecha, la tarjeta y a dónde lleva el botón.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const enviar = vi.fn();
vi.mock('@/lib/email', () => ({
  resend: { emails: { send: enviar } },
  assertSent: (res: { error: unknown }, contexto: string) => {
    if (res.error) throw new Error(`Resend falló en ${contexto}`);
  },
}));

vi.stubEnv('PLANTILLAS_BASE_URL', 'https://app.zero.com.do');

const {
  armarCuentaActivada, armarPruebaPorVencer, armarPagoRecibido,
  enviarCuentaActivada, enviarPruebaPorVencer, enviarPagoRecibido,
} = await import('@/lib/email/suscripcion');
const { SOLO_LECTURA } = await import('@/lib/config/suscripcion');

/** El HTML como lo lee una persona: sin etiquetas, sin espacios de sobra. */
function texto(html: string): string {
  return html
    .replace(/<\/?strong>/g, '')   // énfasis en línea: no separa palabras
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** El destino del botón. */
function enlace(html: string): string {
  return html.match(/<a href="([^"]+)"/)![1];
}

const base = { email: 'dueno@colegio.test', empresa: 'Colegio Los Pinos', plan: 'Básico' };
const precioColegio = { centavos: 13500, moneda: 'usd', intervalo: 'month', cada: 1 };
const visa = { last4: '4242', marca: 'visa' };

beforeEach(() => {
  enviar.mockReset();
  enviar.mockResolvedValue({ data: { id: 'em_1' }, error: null });
});

describe('Cuenta activada', () => {
  // 5 de noviembre, 10 a. m. en Santo Domingo.
  const fin = new Date('2026-11-05T14:00:00Z');

  it('en prueba y CON tarjeta: plan, precio, fin de prueba y «no tienes que hacer nada»', () => {
    const { subject, html } = armarCuentaActivada({
      ...base, estado: 'trialing', precio: precioColegio, fecha: fin, metodo: visa,
    });
    const t = texto(html);

    expect(subject).toBe('¡Bienvenido a Zero! Tu cuenta ya está lista');
    expect(t).toContain('¡Bienvenido a Zero!');
    expect(t).toContain('gracias por elegir Zero');
    expect(t).toContain('Colegio Los Pinos');
    expect(t).toContain('Plan Básico');
    expect(t).toContain('Precio US$135 al mes');
    expect(t).toContain('Tu prueba termina 5 de noviembre');
    expect(t).toContain('ese día se cobrará US$135 a tu tarjeta terminada en 4242 y todo seguirá funcionando igual. No tienes que hacer nada.');
    expect(t).not.toContain('Agrega tu método de pago');
    expect(t).toContain('Ver mi suscripción');
    expect(enlace(html)).toBe('https://app.zero.com.do/dashboard/suscripcion');
  });

  it('en prueba y SIN tarjeta: «agrega tu método de pago antes del…» y el botón lo dice', () => {
    const { html } = armarCuentaActivada({
      ...base, estado: 'trialing', precio: precioColegio, fecha: fin, metodo: null,
    });
    const t = texto(html);

    expect(t).toContain('agrega tu método de pago antes del 5 de noviembre. Te toma un minuto.');
    expect(t).not.toContain('No tienes que hacer nada');
    expect(t).not.toContain('terminada en');
    expect(t).toContain('Agregar método de pago');
    expect(t).toContain(`solo lectura durante ${SOLO_LECTURA.diasTrasPrueba} días`);
  });

  it('ya pagando: habla de próximo cobro, no de prueba', () => {
    const { html } = armarCuentaActivada({
      ...base, estado: 'active', precio: precioColegio, fecha: fin, metodo: visa,
    });
    const t = texto(html);

    expect(t).toContain('Próximo cobro 5 de noviembre');
    expect(t).toContain('Tu próximo cobro es el 5 de noviembre: US$135 a tu tarjeta terminada en 4242');
    expect(t).not.toContain('prueba');
  });

  it('sin precio conocido no inventa una cifra', () => {
    const { html } = armarCuentaActivada({
      ...base, estado: 'trialing', precio: { ...precioColegio, centavos: null }, fecha: fin, metodo: visa,
    });
    const t = texto(html);

    expect(t).not.toContain('US$');
    expect(t).toContain('ese día se cobrará tu plan Básico a tu tarjeta terminada en 4242');
  });

  it('un método sin dígitos (wallet) no imprime «terminada en null»', () => {
    const { html } = armarCuentaActivada({
      ...base, estado: 'trialing', precio: precioColegio, fecha: fin, metodo: { last4: null, marca: null },
    });
    const t = texto(html);

    expect(t).toContain('a tu método de pago guardado');
    expect(t).not.toContain('null');
  });

  it('el precio en pesos sale en RD$', () => {
    const { html } = armarCuentaActivada({
      ...base, estado: 'trialing', fecha: fin, metodo: visa,
      precio: { centavos: 800000, moneda: 'dop', intervalo: 'month', cada: 1 },
    });
    expect(texto(html)).toContain('Precio RD$8,000 al mes');
  });

  it('enviarCuentaActivada manda a la persona correcta', async () => {
    await enviarCuentaActivada({ ...base, estado: 'trialing', precio: precioColegio, fecha: fin, metodo: visa });

    expect(enviar).toHaveBeenCalledTimes(1);
    const arg = enviar.mock.calls[0][0];
    expect(arg.to).toBe('dueno@colegio.test');
    expect(arg.from).toBe('Zero <noreply@zero.com.do>');
    expect(arg.subject).toBe('¡Bienvenido a Zero! Tu cuenta ya está lista');
    expect(arg.replyTo).toBe('alexander@zero.com.do');
  });

  it('si Resend responde con error, el envío lanza (el control de duplicados NO debe anotarlo)', async () => {
    enviar.mockResolvedValue({ data: null, error: { message: 'dominio sin verificar' } });
    await expect(
      enviarCuentaActivada({ ...base, estado: 'trialing', precio: precioColegio, fecha: fin, metodo: visa }),
    ).rejects.toThrow(/enviarCuentaActivada/);
  });
});

describe('Prueba por vencer', () => {
  const venceEl = new Date('2026-10-25T14:00:00Z');

  it('CON tarjeta: «el 25 de octubre se cobra US$135 del plan Básico a tu tarjeta •••• 4242»', () => {
    const { subject, html } = armarPruebaPorVencer({
      ...base, diasRestantes: 3, venceEl, precio: precioColegio, metodo: visa,
    });
    const t = texto(html);

    expect(subject).toBe('Tu prueba de Zero termina en 3 días');
    expect(t).toContain('termina el 25 de octubre');
    expect(t).toContain('Ese día se cobrará US$135 del plan Básico a tu tarjeta •••• 4242 y seguirás trabajando sin ninguna interrupción.');
    expect(t).toContain('Ver mi plan');
    expect(t).not.toContain('Agrega tu método de pago');
    expect(t).not.toContain('solo lectura');
    expect(enlace(html)).toBe('https://app.zero.com.do/dashboard/suscripcion');
  });

  it('SIN tarjeta: conserva el mensaje de siempre, «agrega tu método de pago»', () => {
    const { html } = armarPruebaPorVencer({
      ...base, diasRestantes: 3, venceEl, precio: precioColegio, metodo: null,
    });
    const t = texto(html);

    expect(t).toContain('Para seguir trabajando sin interrupciones con el plan Básico, solo falta agregar tu método de pago.');
    expect(t).toContain(`solo lectura durante ${SOLO_LECTURA.diasTrasPrueba} días`);
    expect(t).toContain('Agregar método de pago');
    expect(t).not.toContain('se cobra');
  });

  it('llamado como antes (sin método ni precio) sigue siendo la versión «sin tarjeta»', () => {
    const { html } = armarPruebaPorVencer({ ...base, diasRestantes: 3, venceEl });
    expect(texto(html)).toContain('agregar tu método de pago');
  });

  it('el asunto cuenta los días: hoy, mañana, en N días', () => {
    const asunto = (dias: number) => armarPruebaPorVencer({ ...base, diasRestantes: dias, venceEl }).subject;
    expect(asunto(7)).toBe('Tu prueba de Zero termina en 7 días');
    expect(asunto(1)).toBe('Tu prueba de Zero termina mañana');
    expect(asunto(0)).toBe('Tu prueba de Zero termina hoy');
  });

  it('la fecha es dominicana: una prueba que vence a las 10 p. m. del 25 no dice «26»', () => {
    const { html } = armarPruebaPorVencer({
      ...base, diasRestantes: 3, venceEl: new Date('2026-10-26T02:00:00Z'), metodo: visa, precio: precioColegio,
    });
    const t = texto(html);
    expect(t).toContain('termina el 25 de octubre');
    expect(t).not.toContain('26 de octubre');
  });

  it('sin precio conocido, no inventa la cifra', () => {
    const { html } = armarPruebaPorVencer({ ...base, diasRestantes: 3, venceEl, metodo: visa, precio: null });
    const t = texto(html);
    expect(t).toContain('se cobrará tu plan Básico a tu tarjeta •••• 4242');
    expect(t).not.toContain('US$');
  });

  it('enviarPruebaPorVencer manda el correo armado', async () => {
    await enviarPruebaPorVencer({ ...base, diasRestantes: 7, venceEl, precio: precioColegio, metodo: visa });
    const arg = enviar.mock.calls[0][0];
    expect(arg.subject).toBe('Tu prueba de Zero termina en 7 días');
    expect(texto(arg.html)).toContain('•••• 4242');
  });
});

describe('Pago recibido', () => {
  const periodo = { desde: new Date('2026-11-05T14:00:00Z'), hasta: new Date('2026-12-05T14:00:00Z') };
  const recibo = 'https://invoice.stripe.com/i/acct_1/test_abc';

  it('monto, plan, período y enlace al recibo', () => {
    const { subject, html } = armarPagoRecibido({
      email: base.email, empresa: base.empresa,
      centavos: 13500, moneda: 'usd', plan: 'Básico', periodo, urlRecibo: recibo,
    });
    const t = texto(html);

    expect(subject).toBe('¡Gracias! Recibimos tu pago de US$135');
    expect(t).toContain('¡Gracias por tu pago!');
    expect(t).toContain('Colegio Los Pinos: recibimos tu pago de US$135. Gracias por confiar en Zero.');
    expect(t).toContain('Plan Básico');
    expect(t).toContain('Monto pagado US$135');
    expect(t).toContain('Período cubierto 5 de noviembre al 5 de diciembre de 2026');
    expect(t).toContain('Tu plan Básico queda pagado hasta el 5 de diciembre de 2026.');
    expect(t).toContain('Ver mi recibo');
    expect(enlace(html)).toBe(recibo);
  });

  it('sin recibo de Stripe, el botón lleva a la suscripción', () => {
    const { html } = armarPagoRecibido({
      email: base.email, empresa: base.empresa,
      centavos: 13500, moneda: 'usd', plan: 'Básico', periodo, urlRecibo: null,
    });
    expect(texto(html)).toContain('Ver mi suscripción');
    expect(enlace(html)).toBe('https://app.zero.com.do/dashboard/suscripcion');
  });

  it('sin período claro ni plan conocido, sigue siendo un recibo coherente', () => {
    const { html } = armarPagoRecibido({
      email: base.email, empresa: base.empresa,
      centavos: 2000, moneda: 'dop', plan: null, periodo: null, urlRecibo: null,
    });
    const t = texto(html);

    expect(t).toContain('recibimos tu pago de RD$20');
    expect(t).toContain('Tu suscripción sigue activa.');
    expect(t).not.toContain('Plan ');
    expect(t).not.toContain('Período cubierto');
    expect(t).not.toContain('null');
  });

  it('enviarPagoRecibido manda a la persona correcta', async () => {
    await enviarPagoRecibido({
      email: base.email, empresa: base.empresa,
      centavos: 13500, moneda: 'usd', plan: 'Básico', periodo, urlRecibo: recibo,
    });
    const arg = enviar.mock.calls[0][0];
    expect(arg.to).toBe('dueno@colegio.test');
    expect(arg.subject).toBe('¡Gracias! Recibimos tu pago de US$135');
  });
});

describe('seguridad del HTML', () => {
  it('el nombre de la empresa se escapa en los tres correos', () => {
    const malo = '<img src=x onerror=alert(1)>';
    const fin = new Date('2026-11-05T14:00:00Z');

    const htmls = [
      armarCuentaActivada({ ...base, empresa: malo, estado: 'trialing', precio: precioColegio, fecha: fin, metodo: visa }).html,
      armarPruebaPorVencer({ ...base, empresa: malo, diasRestantes: 3, venceEl: fin, metodo: visa }).html,
      armarPagoRecibido({ email: base.email, empresa: malo, centavos: 100, moneda: 'usd', plan: 'Básico', periodo: null, urlRecibo: null }).html,
    ];
    for (const html of htmls) {
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    }
  });

  it('un enlace de recibo con comillas no puede salirse del href', () => {
    const { html } = armarPagoRecibido({
      email: base.email, empresa: base.empresa, centavos: 100, moneda: 'usd', plan: 'Básico', periodo: null,
      urlRecibo: 'https://invoice.stripe.com/x" onmouseover="alert(1)',
    });
    expect(html).not.toContain('" onmouseover');
  });
});
