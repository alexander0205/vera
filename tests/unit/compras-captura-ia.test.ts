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

  it('con solo la llave de Anthropic hay que pedirle un modelo suyo', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-de-prueba';
    // Por defecto los dos modelos son de Google y solo salen por el gateway.
    expect((await cargar()).iaDisponible()).toBe(false);
    process.env.CAPTURA_IA_MODELO_RESPALDO = 'anthropic/claude-haiku-4.5';
    const m = (await cargar()).modeloCaptura();
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

/**
 * El PDF del proveedor tiene que llegar al modelo COMO PDF.
 *
 * El lector nació para fotos de teléfono y ahora también recibe el PDF que
 * llega por correo. Si el archivo se mandara con el tipo equivocado —o se
 * filtrara por ser imagen, como hace el lector de QR— la factura entraría
 * vacía y habría que teclearla entera, que es justo lo que se vino a evitar.
 */
describe('qué se le manda al modelo', () => {
  const generarTexto = vi.fn();
  beforeEach(() => {
    generarTexto.mockReset();
    generarTexto.mockResolvedValue({ output: { esFactura: true } });
    vi.doMock('ai', async () => {
      const real = await vi.importActual<typeof import('ai')>('ai');
      return { ...real, generateText: generarTexto };
    });
  });
  afterEach(() => { vi.doUnmock('ai'); });

  const partesDeLaLlamada = () => generarTexto.mock.calls[0][0].messages[0].content;

  it('un PDF viaja con su propio tipo, no convertido ni descartado', async () => {
    process.env.AI_GATEWAY_API_KEY = 'llave-de-prueba';
    const { leerFacturaConIa } = await cargar();
    const pdf = Buffer.from('%PDF-1.4 factura del proveedor');
    await leerFacturaConIa([{ buffer: pdf, mime: 'application/pdf' }], { empresa: 'Mi Casita' });

    const archivos = partesDeLaLlamada().filter((c: { type: string }) => c.type === 'file');
    expect(archivos).toHaveLength(1);
    expect(archivos[0].mediaType).toBe('application/pdf');
    expect(archivos[0].data).toBe(pdf);
  });

  it('un PDF y las fotos de una misma factura van juntos y en orden', async () => {
    process.env.AI_GATEWAY_API_KEY = 'llave-de-prueba';
    const { leerFacturaConIa } = await cargar();
    await leerFacturaConIa([
      { buffer: Buffer.from('%PDF-1.4 hoja 1'), mime: 'application/pdf' },
      { buffer: Buffer.from('jpeg hoja 2'), mime: 'image/jpeg' },
    ]);

    const partes = partesDeLaLlamada();
    expect(partes.filter((c: { type: string }) => c.type === 'file').map((c: { mediaType: string }) => c.mediaType))
      .toEqual(['application/pdf', 'image/jpeg']);
    expect(partes[0].text).toContain('2 archivos, en orden');
  });

  it('se le dice que el ISC y las tasas van aparte del ITBIS', async () => {
    process.env.AI_GATEWAY_API_KEY = 'llave-de-prueba';
    const { leerFacturaConIa } = await cargar();
    await leerFacturaConIa([{ buffer: Buffer.from('%PDF-1.4'), mime: 'application/pdf' }]);

    const instrucciones: string = generarTexto.mock.calls[0][0].instructions;
    expect(instrucciones).toContain('otrosImpuestos');
    // Sin esto, el modelo mete el 10 % y el 2 % de una factura de internet
    // dentro del ITBIS y el total vuelve a no cuadrar.
    expect(instrucciones).toContain('subtotal + itbis + isc + otrosImpuestos + propina');
  });
});
