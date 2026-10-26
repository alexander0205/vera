import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Qué modelo contesta: las preguntas normales van al modelo gratis de
 * /admin/ia (uso «asistente») y las de análisis a Claude (uso «analisis»);
 * cada uno con su respaldo si falla. Ningún modelo real: son MockLanguageModel
 * y sin Jev el nivel lo deciden las palabras de la pregunta.
 */

vi.mock('@/lib/db/drizzle', () => ({ db: {} }));
vi.mock('@/lib/auth/modules', () => ({ getTeamModules: vi.fn() }));
vi.mock('@/lib/auth/permissions', () => ({ getEffectivePermissions: vi.fn() }));
vi.mock('@/lib/reportes/queries', () => ({
  getKpis: vi.fn(), getTendencia: vi.fn(), getIngresosPorProducto: vi.fn(), getIngresosPorCliente: vi.fn(),
  getIngresosPorMetodo: vi.fn(), getAgingCxC: vi.fn(), getItbisResumen: vi.fn(), getVentasPorTipo: vi.fn(), getVentasPorUsuario: vi.fn(),
}));
vi.mock('@/lib/compras/captura/consultas', () => ({ listarCapturas: vi.fn(), contarPorRevisar: vi.fn() }));
vi.mock('@/lib/compras/consultas', () => ({ listarCompras: vi.fn(), resumenGastos: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@ai-sdk/google', () => ({ google: vi.fn() }));

const GEMINI = 'google/gemini-2.5-flash';
const HAIKU = 'anthropic/claude-haiku-5.5';

const estado = vi.hoisted(() => ({
  usos: [] as string[],
  llamados: [] as { id: string; providerOptions: unknown }[],
  fallan: new Set<string>(),
}));

vi.mock('@/lib/ia/modelo-servidor', async () => {
  const { MockLanguageModelV4 } = await import('ai/test');
  return {
    caminoDe: (id: string) => (id.startsWith('anthropic/') ? 'anthropic' : 'gateway'),
    hayCaminoIa: () => true,
    modelosDe: async (uso: string) => {
      estado.usos.push(uso);
      return uso === 'analisis' ? { principal: HAIKU, respaldo: GEMINI } : { principal: GEMINI, respaldo: HAIKU };
    },
    comoModelo: (id: string) => new MockLanguageModelV4({
      doGenerate: async (opciones) => {
        estado.llamados.push({ id, providerOptions: opciones.providerOptions });
        if (estado.fallan.has(id)) throw new Error(`${id} no contesta`);
        return {
          content: [{ type: 'text' as const, text: `Contestó ${id}.` }],
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage: { inputTokens: { total: 900, noCache: 900, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 30, text: 30, reasoning: 0 } },
          warnings: [],
        };
      },
    }),
  };
});

import { conversar } from '@/lib/asistente/agente';
import { contextoDePrueba } from '@/lib/asistente/contexto';
import type { Consumo } from '@/lib/ia/consumo';

const preguntar = (pregunta: string, consumos: Consumo[] = []) => conversar(
  contextoDePrueba(1), [{ role: 'user', content: pregunta }],
  // forzarIa: que conteste la IA aunque el automático supiera.
  { empresa: 'Demo', usuario: 'Ana', forzarIa: true, consumos },
);

beforeEach(() => {
  estado.usos.length = 0;
  estado.llamados.length = 0;
  estado.fallan.clear();
  delete process.env.TYPESAFE_API_KEY;
});

describe('qué modelo contesta', () => {
  it('una pregunta normal va al modelo gratis, y su gasto queda como normal', async () => {
    const consumos: Consumo[] = [];
    const r = await preguntar('¿Cuántas facturas emití esta semana?', consumos);
    expect(estado.usos).toEqual(['asistente']);
    expect(r.modelo).toBe(GEMINI);
    expect(r.nivel).toBe('normal');
    expect(consumos).toEqual([expect.objectContaining({ modelo: GEMINI, proveedor: 'gateway', nivel: 'normal', tokensEntrada: 900 })]);
  });

  it('una de análisis va a Claude, que razona un poco más', async () => {
    const consumos: Consumo[] = [];
    const r = await preguntar('¿Por qué bajaron los cobros de octubre comparado con septiembre?', consumos);
    expect(estado.usos).toEqual(['analisis']);
    expect(r.modelo).toBe(HAIKU);
    expect(r.nivel).toBe('analisis');
    expect(estado.llamados[0].providerOptions).toEqual(expect.objectContaining({ anthropic: { effort: 'medium' } }));
    expect(consumos[0]).toEqual(expect.objectContaining({ proveedor: 'anthropic', nivel: 'analisis' }));
  });

  it('si el modelo gratis falla, contesta Claude', async () => {
    estado.fallan.add(GEMINI);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await preguntar('¿Cuántas facturas emití esta semana?');
    expect(estado.llamados.map((l) => l.id)).toEqual([GEMINI, HAIKU]);
    expect(r.respuesta).toBe(`Contestó ${HAIKU}.`);
    // Claude en una pregunta normal razona poco.
    expect(estado.llamados[1].providerOptions).toEqual(expect.objectContaining({ anthropic: { effort: 'low' } }));
  });

  it('si Claude falla en una de análisis, contesta el gratis', async () => {
    estado.fallan.add(HAIKU);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await preguntar('Analiza cómo van los cobros y recomiéndame qué hacer');
    expect(r.modelo).toBe(GEMINI);
  });
});
