import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  ErrorJev, MODELO_JEV, caminoDeNoul, decidirConConfianza, jevDisponible, preguntarAJev,
} from '@/lib/ia/jev';

/**
 * Jev (TypeSafe) contesta decisiones estructuradas. Estas pruebas no llaman a
 * TypeSafe: simulan su respuesta para fijar cómo se pide, qué se exige de la
 * respuesta y cómo se decide con la confianza.
 */

const respuesta = (cuerpo: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => { delete process.env.TYPESAFE_API_KEY; delete process.env.TYPESAFE_BASE_URL; });

describe('preguntarle a Jev', () => {
  it('sin llave no está disponible y no llama a nadie', async () => {
    expect(jevDisponible()).toBe(false);
    const f = respuesta({});
    await expect(preguntarAJev('hola', { x: { type: 'noul', instructions: '¿?' } }, { fetch: f }))
      .rejects.toThrow('falta TYPESAFE_API_KEY');
    expect(f).not.toHaveBeenCalled();
  });

  it('manda el contenido y las preguntas a /v1/systemone con la llave en la cabecera', async () => {
    process.env.TYPESAFE_API_KEY = 'llave-de-prueba';
    const f = respuesta({
      model: 'jev-1', answers: { tema: { type: 'choice', choice: 'pagos', probabilities: { pagos: 0.9, dgii: 0.1 }, confidence: 0.8 } },
      usage: { input_tokens: 50, output_tokens: 3 },
    });
    const r = await preguntarAJev('Ya pagué la factura de octubre', {
      tema: { type: 'choice', instructions: '¿De qué trata?', criteria: { pagos: 'Cobros y pagos', dgii: 'Comprobantes fiscales' } },
    }, { fetch: f });
    expect(r.answers.tema.choice).toBe('pagos');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer llave-de-prueba');
    expect(JSON.parse(String(init.body))).toMatchObject({ model: MODELO_JEV, state: 'Ya pagué la factura de octubre' });
  });

  it('si TypeSafe falla, dice el código y no inventa una respuesta', async () => {
    process.env.TYPESAFE_API_KEY = 'llave-de-prueba';
    const err = await preguntarAJev('x', { a: { type: 'noul', instructions: '¿?' } }, { fetch: respuesta({ detail: 'nope' }, 401) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ErrorJev);
    expect(err.status).toBe(401);
  });

  it('si falta la respuesta de una pregunta, es un error (no un undefined silencioso)', async () => {
    process.env.TYPESAFE_API_KEY = 'llave-de-prueba';
    const f = respuesta({ model: 'jev-1', answers: {}, usage: { input_tokens: 1, output_tokens: 0 } });
    await expect(preguntarAJev('x', { a: { type: 'noul', instructions: '¿?' } }, { fetch: f })).rejects.toThrow('no contestó «a»');
  });
});

describe('decidir con la confianza', () => {
  it('alta actúa, media pide revisión, baja la decide una persona', () => {
    expect(decidirConConfianza(0.92)).toBe('actuar');
    expect(decidirConConfianza(0.6)).toBe('revisar');
    expect(decidirConConfianza(0.3)).toBe('persona');
    // Aprobar un pago pide más que sugerir un tema.
    expect(decidirConConfianza(0.85, { actuar: 0.95, revisar: 0.7 })).toBe('revisar');
  });
  it('un sí/no cerca de 0.5 no es confianza en ninguna dirección', () => {
    expect(caminoDeNoul(0.97)).toBe('actuar');
    expect(caminoDeNoul(0.03)).toBe('actuar');
    expect(caminoDeNoul(0.55)).toBe('persona');
  });
});
