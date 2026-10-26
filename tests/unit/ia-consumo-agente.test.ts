import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Lo que gasta la IA y las decisiones de Jev del asistente, sin llamar a
 * ningún modelo real: Jev es un fetch falso.
 */

vi.mock('server-only', () => ({}));

import { costoUsd, idDeCatalogo, rangoDelMes, sumarConsumos, usd, type Consumo } from '@/lib/ia/consumo';
import { CONFIANZA_NIVEL, nivelDePregunta, nivelPorPalabras, respuestaContesta, UMBRAL_CONTESTA } from '@/lib/asistente/decisiones';
import { INTENCIONES_POR_PALABRAS } from '@/lib/asistente/local';

afterEach(() => { delete process.env.TYPESAFE_API_KEY; vi.restoreAllMocks(); });

describe('costo de cada llamada', () => {
  it('Haiku 5.5 cobra 0.10 / 0.50 por millón hasta 100K de entrada', () => {
    expect(costoUsd({ modelo: 'claude-haiku-5-5', tokensEntrada: 10_000, tokensSalida: 1_000 })).toBeCloseTo(0.0015, 10);
  });

  it('más de 100K de entrada en una llamada pasa al precio largo (0.50 / 2.50)', () => {
    expect(costoUsd({ modelo: 'claude-haiku-5-5', tokensEntrada: 200_000, tokensSalida: 1_000 })).toBeCloseTo(0.1025, 10);
  });

  it('lo leído de la caché cuesta la décima parte y lo escrito 1.25×', () => {
    // 10K de entrada: 6K leídos (0.6K efectivos), 2K escritos (2.5K efectivos) y 2K normales.
    const c = costoUsd({ modelo: 'claude-haiku-5-5', tokensEntrada: 10_000, tokensSalida: 0, tokensCache: 6_000, tokensCacheEscritura: 2_000 });
    expect(c).toBeCloseTo((2_000 + 600 + 2_500) * 0.1 / 1e6, 12);
  });

  it('Jev cobra solo la entrada (US$0.042 por millón)', () => {
    expect(costoUsd({ modelo: 'jev-1.14.0', tokensEntrada: 1_000_000, tokensSalida: 500 })).toBeCloseTo(0.042, 10);
  });

  it('los ids del gateway y los directos van al mismo precio; un modelo desconocido cuesta 0', () => {
    expect(idDeCatalogo('claude-haiku-5-5')).toBe('anthropic/claude-haiku-5.5');
    expect(idDeCatalogo('gemini-2.5-flash')).toBe('google/gemini-2.5-flash');
    expect(costoUsd({ modelo: 'google/gemini-2.5-flash', tokensEntrada: 1_000_000, tokensSalida: 0 })).toBeCloseTo(0.3, 10);
    expect(costoUsd({ modelo: 'otro/modelo', tokensEntrada: 1_000, tokensSalida: 1_000 })).toBe(0);
  });

  it('suma un turno con varias llamadas y se lee aunque sea muy pequeño', () => {
    const cs: Consumo[] = [
      { uso: 'decisiones', proveedor: 'typesafe', modelo: 'jev-1', tokensEntrada: 200, tokensSalida: 1 },
      { uso: 'asistente', proveedor: 'anthropic', modelo: 'claude-haiku-5-5', tokensEntrada: 9_000, tokensSalida: 300 },
    ];
    const s = sumarConsumos(cs);
    expect(s.tokensEntrada).toBe(9_200);
    expect(s.costoUsd).toBeGreaterThan(0);
    expect(usd(0.0000084)).toBe('US$0.000008');
    expect(usd(0.0123)).toBe('US$0.0123');
    expect(usd(0)).toBe('US$0');
  });

  it('el mes es el de República Dominicana (empieza a las 04:00 UTC)', () => {
    const r = rangoDelMes('2026-10')!;
    expect(r.desde.toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(r.hasta.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(rangoDelMes('2026-13')).toBeNull();
    expect(rangoDelMes('octubre')).toBeNull();
  });
});

describe('Jev revisa la respuesta automática', () => {
  const jev = (noul: number) => vi.fn(async () => new Response(JSON.stringify({
    model: 'jev-1.14.0', answers: { contesta: { type: 'noul', noul } }, usage: { input_tokens: 180, output_tokens: 1 },
  }), { status: 200 }));

  it('sin llave no hay veredicto y no se llama a nadie', async () => {
    const f = jev(0.9);
    expect(await respuestaContesta('¿cuánto vendí?', 'Vendiste RD$ 5', [], { fetch: f })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('«no contesta» por debajo del umbral y anota lo que costó', async () => {
    process.env.TYPESAFE_API_KEY = 'llave-de-prueba';
    const consumos: Consumo[] = [];
    const f = jev(UMBRAL_CONTESTA - 0.2);
    expect(await respuestaContesta('¿Cuántos estudiantes tienen deuda vencida?', 'Hay **420** estudiantes matriculados.', consumos, { fetch: f })).toBe(false);
    expect(consumos).toEqual([expect.objectContaining({ uso: 'decisiones', proveedor: 'typesafe', modelo: 'jev-1.14.0', tokensEntrada: 180 })]);
    // A Jev solo le llegan la pregunta y la respuesta.
    const cuerpo = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(Object.keys(cuerpo.state)).toEqual(['pregunta', 'respuesta']);
  });

  it('«contesta» por encima del umbral; si Jev falla, sin veredicto', async () => {
    process.env.TYPESAFE_API_KEY = 'llave-de-prueba';
    expect(await respuestaContesta('¿cuánto vendí?', 'Vendiste RD$ 5', [], { fetch: jev(0.93) })).toBe(true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cae = vi.fn(async () => new Response('caído', { status: 503 }));
    expect(await respuestaContesta('¿cuánto vendí?', 'Vendiste RD$ 5', [], { fetch: cae })).toBeNull();
  });

  it('solo se revisan las respuestas elegidas por palabras clave', () => {
    expect(INTENCIONES_POR_PALABRAS.has('cartera')).toBe(true);
    expect(INTENCIONES_POR_PALABRAS.has('matriculas')).toBe(true);
    expect(INTENCIONES_POR_PALABRAS.has('saludo')).toBe(false);
  });
});

describe('nivel de la pregunta: normal o de análisis', () => {
  const jevNivel = (choice: string, confidence: number) => vi.fn(async () => new Response(JSON.stringify({
    model: 'jev-1.14.0',
    answers: { nivel: { type: 'choice', choice, probabilities: { normal: 0.5, analisis: 0.5 }, confidence } },
    usage: { input_tokens: 120, output_tokens: 1 },
  }), { status: 200 }));

  it('sin Jev deciden las palabras de la pregunta', async () => {
    expect(nivelPorPalabras('¿Cuánto vendí este mes?')).toBe('normal');
    expect(nivelPorPalabras('¿Por qué bajaron las ventas de octubre?')).toBe('analisis');
    expect(nivelPorPalabras('Compara septiembre con octubre')).toBe('analisis');
    expect(nivelPorPalabras('¿Qué me recomiendas para cobrar más rápido?')).toBe('analisis');
    expect(nivelPorPalabras('Crea una factura para María')).toBe('normal');
    const f = jevNivel('analisis', 0.9);
    expect(await nivelDePregunta('¿Cuánto vendí?', [], { fetch: f })).toEqual({ nivel: 'normal', por: 'palabras' });
    expect(f).not.toHaveBeenCalled();
  });

  it('con Jev seguro decide Jev, y su costo se anota', async () => {
    process.env.TYPESAFE_API_KEY = 'llave-de-prueba';
    const consumos: Consumo[] = [];
    const r = await nivelDePregunta('¿Cómo va el colegio?', consumos, { fetch: jevNivel('analisis', 0.85) });
    expect(r).toEqual({ nivel: 'analisis', por: 'jev' });
    expect(consumos).toEqual([expect.objectContaining({ uso: 'decisiones', proveedor: 'typesafe', tokensEntrada: 120 })]);
  });

  it('con Jev dudoso, o caído, deciden las palabras', async () => {
    process.env.TYPESAFE_API_KEY = 'llave-de-prueba';
    expect(await nivelDePregunta('¿Por qué subió la mora?', [], { fetch: jevNivel('normal', CONFIANZA_NIVEL - 0.1) }))
      .toEqual({ nivel: 'analisis', por: 'palabras' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cae = vi.fn(async () => new Response('caído', { status: 503 }));
    expect(await nivelDePregunta('¿Cuánto vendí?', [], { fetch: cae })).toEqual({ nivel: 'normal', por: 'palabras' });
  });
});

