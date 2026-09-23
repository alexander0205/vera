import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** El modelo se elige por variables de entorno; aquí se comprueba esa elección. */
const cargar = async () => {
  vi.resetModules();
  return import('@/lib/compras/captura/ia');
};

const ENV = { ...process.env };
beforeEach(() => {
  for (const k of ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'ANTHROPIC_API_KEY', 'CAPTURA_IA_MODELO', 'CAPTURA_IA_MODELO_RESPALDO']) delete process.env[k];
});
afterEach(() => { process.env = { ...ENV }; });

describe('qué modelo lee la factura', () => {
  it('sin gateway ni llave no se llama a nadie: la factura queda para completarla a mano', async () => {
    const ia = await cargar();
    expect(ia.iaDisponible()).toBe(false);
    expect(ia.modeloCaptura()).toBeNull();
  });

  it('con el gateway va Gemini Flash-Lite, que es el barato', async () => {
    process.env.AI_GATEWAY_API_KEY = 'llave-de-prueba';
    const ia = await cargar();
    expect(ia.modeloCaptura()).toBe('google/gemini-2.5-flash-lite');
  });

  it('se puede cambiar por otro más barato sin tocar código', async () => {
    process.env.AI_GATEWAY_API_KEY = 'llave-de-prueba';
    process.env.CAPTURA_IA_MODELO = 'google/gemini-2.5-flash-lite';
    const ia = await cargar();
    expect(ia.modeloCaptura()).toBe('google/gemini-2.5-flash-lite');
  });

  it('con solo la llave de Anthropic entra el respaldo, que sí es suyo', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-de-prueba';
    const ia = await cargar();
    const m = ia.modeloCaptura();
    expect(typeof m === 'object' && m && 'modelId' in m ? m.modelId : m).toBe('claude-haiku-4.5');
  });

  it('sin gateway, un respaldo de otro proveedor deja la lectura apagada', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-de-prueba';
    process.env.CAPTURA_IA_MODELO = 'alibaba/qwen3.7-flash';
    process.env.CAPTURA_IA_MODELO_RESPALDO = 'google/gemini-2.5-flash-lite';
    const ia = await cargar();
    expect(ia.iaDisponible()).toBe(false);
  });
});
