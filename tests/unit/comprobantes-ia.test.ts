import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * La IA que lee el comprobante que sube la familia — con el modelo MOCKEADO.
 *
 * Aquí no se prueba qué tan bien lee un modelo (eso no se puede probar sin
 * llamarlo), sino lo que el sistema promete alrededor de él:
 *
 *  · reutiliza los modelos de «captura» y sus llaves: sin AI Gateway ni llave no
 *    se llama a nadie;
 *  · si el principal falla se reintenta con el respaldo, como con las facturas;
 *  · NUNCA lanza ni deja basura: corre en `after()` y un fallo no puede romper
 *    la subida del padre;
 *  · lo que guarda pasa por `limpiarLectura` y nunca toca el estado del
 *    comprobante: la IA propone, no aprueba.
 */

const m = vi.hoisted(() => ({
  generarTexto: vi.fn(),
  registrarConsumo: vi.fn(),
  cambios: [] as Record<string, unknown>[],
  modelos: { principal: 'google/gemini-2.5-flash-lite', respaldo: 'google/gemini-2.5-flash' },
}));

vi.mock('ai', async () => {
  const real = await vi.importActual<typeof import('ai')>('ai');
  return { ...real, generateText: m.generarTexto };
});

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    update: () => ({
      set: (valores: Record<string, unknown>) => {
        m.cambios.push(valores);
        return { where: async () => [] };
      },
    }),
  },
}));

vi.mock('@/lib/ia/consumo-servidor', () => ({ registrarConsumo: m.registrarConsumo }));

// Los ids de los modelos salen del ajuste de /admin/ia (una base que aquí no hay);
// lo demás —comoModelo, hayCaminoIa, caminoDe— es el código real.
vi.mock('@/lib/ia/modelo-servidor', async () => {
  const real = await vi.importActual<typeof import('@/lib/ia/modelo-servidor')>('@/lib/ia/modelo-servidor');
  return { ...real, modelosDe: async () => m.modelos };
});

import {
  hashArchivo, leerComprobanteConIa, leerYGuardarComprobante,
} from '@/lib/administracion-escolar/comprobantes-ia';

const ENV = { ...process.env };
const SALIDA = {
  esComprobante: true,
  bancoDestino: 'BHD León',
  bancoOrigen: 'Popular',
  cuentaDestino: '****9034',
  monto: 4800,
  fecha: '2026-10-03',
  referencia: '8422 91A',
  ordenante: 'Juan Pérez',
  beneficiario: null,
  confianza: 0.9,
};
const usoDe = (inputTokens: number, outputTokens: number) => ({ inputTokens, outputTokens });

beforeEach(() => {
  for (const k of ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'GOOGLE_GENERATIVE_AI_API_KEY', 'ANTHROPIC_API_KEY']) {
    delete process.env[k];
  }
  m.generarTexto.mockReset();
  m.registrarConsumo.mockReset();
  m.cambios.length = 0;
  m.modelos = { principal: 'google/gemini-2.5-flash-lite', respaldo: 'google/gemini-2.5-flash' };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...ENV };
  vi.restoreAllMocks();
});

const archivo = { buffer: Buffer.from('%PDF-1.4 comprobante'), mime: 'application/pdf' };

describe('sin forma de llamar a un modelo', () => {
  it('no se llama a nadie y no se escribe nada', async () => {
    await leerYGuardarComprobante({ teamId: 3, id: 10, ...archivo });
    expect(m.generarTexto).not.toHaveBeenCalled();
    expect(m.cambios).toHaveLength(0);
  });

  it('leerComprobanteConIa devuelve null (no lanza)', async () => {
    expect(await leerComprobanteConIa(archivo, 3)).toBeNull();
  });
});

describe('con el AI Gateway', () => {
  beforeEach(() => { process.env.AI_GATEWAY_API_KEY = 'llave-de-prueba'; });

  it('lee con el modelo principal de «captura» y guarda la lectura ya limpia', async () => {
    m.generarTexto.mockResolvedValue({ output: SALIDA, totalUsage: usoDe(1200, 90) });

    await leerYGuardarComprobante({ teamId: 3, id: 10, ...archivo });

    expect(m.generarTexto).toHaveBeenCalledTimes(1);
    expect(m.generarTexto.mock.calls[0][0].model).toBe('google/gemini-2.5-flash-lite');

    expect(m.cambios).toHaveLength(1);
    const guardado = m.cambios[0] as { lecturaIa: Record<string, unknown>; lecturaIaEn: Date };
    expect(guardado.lecturaIa).toMatchObject({
      esComprobante: true,
      bancoDestino: 'Banco BHD',
      cuentaDestinoUltimos4: '9034',
      montoCentavos: 480000,
      fecha: '2026-10-03',
      referencia: '8422 91A',
      modelo: 'google/gemini-2.5-flash-lite',
    });
    expect(guardado.lecturaIaEn).toBeInstanceOf(Date);
  });

  /** La IA propone: lo único que se escribe es la lectura. Ni estado ni cobro. */
  it('solo escribe la lectura: no toca estado, monto ni cuenta', async () => {
    m.generarTexto.mockResolvedValue({ output: SALIDA, totalUsage: usoDe(10, 10) });
    await leerYGuardarComprobante({ teamId: 3, id: 10, ...archivo });
    expect(Object.keys(m.cambios[0]).sort()).toEqual(['lecturaIa', 'lecturaIaEn']);
  });

  it('anota el gasto en la parte «captura», con el equipo del colegio', async () => {
    m.generarTexto.mockResolvedValue({ output: SALIDA, totalUsage: usoDe(1200, 90) });
    await leerYGuardarComprobante({ teamId: 3, id: 10, ...archivo });

    expect(m.registrarConsumo).toHaveBeenCalledWith({ teamId: 3 }, [expect.objectContaining({
      uso: 'captura', proveedor: 'gateway', modelo: 'google/gemini-2.5-flash-lite',
      tokensEntrada: 1200, tokensSalida: 90,
    })]);
  });

  it('el archivo viaja con su propio tipo y las instrucciones distinguen el banco que recibe del que envía', async () => {
    m.generarTexto.mockResolvedValue({ output: SALIDA, totalUsage: usoDe(1, 1) });
    await leerComprobanteConIa(archivo, 3);

    const llamada = m.generarTexto.mock.calls[0][0];
    const partes = llamada.messages[0].content as { type: string; mediaType?: string; data?: Buffer }[];
    const adjunto = partes.find((p) => p.type === 'file')!;
    expect(adjunto.mediaType).toBe('application/pdf');
    expect(adjunto.data).toBe(archivo.buffer);
    expect(llamada.instructions).toContain('RECIBE');
    expect(llamada.instructions).toContain('bancoOrigen');
  });

  it('si el principal falla se reintenta UNA vez con el respaldo', async () => {
    m.generarTexto
      .mockRejectedValueOnce(new Error('JSON con otra forma'))
      .mockResolvedValueOnce({ output: SALIDA, totalUsage: usoDe(5, 5) });

    const lectura = await leerComprobanteConIa(archivo, 3);

    expect(m.generarTexto).toHaveBeenCalledTimes(2);
    expect(m.generarTexto.mock.calls[1][0].model).toBe('google/gemini-2.5-flash');
    expect(lectura?.modelo).toBe('google/gemini-2.5-flash');
  });

  it('si fallan los dos, leerYGuardar NO lanza y no escribe nada', async () => {
    m.generarTexto.mockRejectedValue(new Error('cuota agotada'));

    await expect(leerYGuardarComprobante({ teamId: 3, id: 10, ...archivo })).resolves.toBeUndefined();

    expect(m.generarTexto).toHaveBeenCalledTimes(2);
    expect(m.cambios).toHaveLength(0);
  });

  it('con el mismo modelo de principal y respaldo no lo intenta dos veces', async () => {
    m.modelos = { principal: 'google/gemini-2.5-flash', respaldo: 'google/gemini-2.5-flash' };
    m.generarTexto.mockRejectedValue(new Error('caído'));

    await leerYGuardarComprobante({ teamId: 3, id: 10, ...archivo });

    expect(m.generarTexto).toHaveBeenCalledTimes(1);
  });

  it('si el modelo dice que no es un comprobante, se guarda así y sin datos', async () => {
    m.generarTexto.mockResolvedValue({
      output: { ...SALIDA, esComprobante: false }, totalUsage: usoDe(5, 5),
    });
    await leerYGuardarComprobante({ teamId: 3, id: 10, ...archivo });

    expect(m.cambios[0].lecturaIa).toMatchObject({
      esComprobante: false, bancoDestino: null, montoCentavos: null,
    });
  });

  it('un fallo al anotar el gasto no tira una lectura buena ni reintenta con otro modelo', async () => {
    m.generarTexto.mockResolvedValue({ output: SALIDA, totalUsage: usoDe(1, 1) });
    m.registrarConsumo.mockRejectedValue(new Error('base caída'));

    await leerYGuardarComprobante({ teamId: 3, id: 10, ...archivo });

    expect(m.generarTexto).toHaveBeenCalledTimes(1);
    expect(m.cambios).toHaveLength(1);
  });
});

describe('con la llave de un proveedor y sin gateway', () => {
  it('con solo la llave de Google se lee con el modelo de Google', async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'llave-de-prueba';
    m.generarTexto.mockResolvedValue({ output: SALIDA, totalUsage: usoDe(1, 1) });

    const lectura = await leerComprobanteConIa(archivo, 3);

    expect(lectura?.modelo).toBe('google/gemini-2.5-flash-lite');
    // Directo con el proveedor, no el id del gateway: es un modelo, no una cadena.
    expect(typeof m.generarTexto.mock.calls[0][0].model).toBe('object');
  });

  it('con solo la llave de Anthropic y modelos de Google no hay camino: no se llama a nadie', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-de-prueba';
    expect(await leerComprobanteConIa(archivo, 3)).toBeNull();
    expect(m.generarTexto).not.toHaveBeenCalled();
  });
});

describe('hashArchivo', () => {
  it('es el sha256 en hexadecimal (vector conocido)', () => {
    expect(hashArchivo(Buffer.from('abc')))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('el mismo contenido da la misma huella y uno distinto, otra', () => {
    expect(hashArchivo(Buffer.from('foto'))).toBe(hashArchivo(Buffer.from('foto')));
    expect(hashArchivo(Buffer.from('foto'))).not.toBe(hashArchivo(Buffer.from('foto2')));
  });
});
