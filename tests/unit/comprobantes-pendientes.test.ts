// tests/unit/comprobantes-pendientes.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { subirPendientes, type Pendiente } from '@/components/pagos/ComprobantesUploader';

/**
 * Los comprobantes que se eligen al CREAR una factura.
 *
 * Al crear no hay `docId` —lo asigna el servidor— así que los archivos esperan
 * en memoria y suben en cuanto la factura nace. Lo que se prueba aquí es esa
 * subida diferida, y sobre todo que NO tumbe el flujo: cuando esto corre, la
 * factura ya está creada y a veces ya emitida a la DGII. Fallar ahí por una
 * foto sería cambiar un problema pequeño por uno grande.
 */

const originalFetch = globalThis.fetch;
let llamadas: { docId: string | null; nombre: string }[] = [];

/** Un pendiente de mentira; `File` existe en Node 20. */
function pendiente(id: number, nombre: string, tipo = 'image/jpeg'): Pendiente {
  return {
    id,
    archivo: new File(['x'], nombre, { type: tipo }),
    previewUrl: null,
  };
}

beforeEach(() => {
  llamadas = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Respuestas en orden: true = subió, false = el servidor la rechazó. */
function fetchQueDevuelve(resultados: boolean[]) {
  let i = 0;
  globalThis.fetch = vi.fn(async (_url: unknown, init?: unknown) => {
    const fd = (init as { body?: FormData } | undefined)?.body as FormData;
    llamadas.push({
      docId: fd?.get('docId') as string | null,
      nombre: (fd?.get('archivo') as File)?.name ?? '',
    });
    const ok = resultados[i++] ?? true;
    return {
      ok,
      json: async () => (ok
        ? { adjunto: { id: 900 + i, nombre: `sub-${i}`, mime: 'image/jpeg', tamanoBytes: 1 } }
        : { error: 'No se pudo subir el archivo' }),
    };
  }) as unknown as typeof fetch;
}

describe('subirPendientes', () => {
  it('sube cada archivo a la factura que acaba de nacer', async () => {
    fetchQueDevuelve([true, true]);

    const r = await subirPendientes(2877, [pendiente(-1, 'deposito.jpg'), pendiente(-2, 'voucher.jpg')]);

    expect(r.subidos).toHaveLength(2);
    expect(r.fallidos).toBe(0);
    // Todos al MISMO documento: es el id que el servidor acaba de asignar.
    expect(llamadas.map(l => l.docId)).toEqual(['2877', '2877']);
    expect(llamadas.map(l => l.nombre)).toEqual(['deposito.jpg', 'voucher.jpg']);
  });

  it('un archivo rechazado no impide que suban los demás', async () => {
    fetchQueDevuelve([true, false, true]);

    const r = await subirPendientes(10, [
      pendiente(-1, 'ok1.jpg'),
      pendiente(-2, 'roto.jpg'),
      pendiente(-3, 'ok2.jpg'),
    ]);

    expect(r.subidos).toHaveLength(2);
    expect(r.fallidos).toBe(1);
    expect(llamadas).toHaveLength(3);
  });

  it('no lanza cuando la red se cae: la factura ya existe', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch;

    const r = await subirPendientes(10, [pendiente(-1, 'a.jpg')]);

    expect(r.subidos).toEqual([]);
    expect(r.fallidos).toBe(1);
  });

  it('sin pendientes no llama al servidor', async () => {
    fetchQueDevuelve([]);
    const r = await subirPendientes(10, []);
    expect(r).toEqual({ subidos: [], fallidos: 0 });
    expect(llamadas).toHaveLength(0);
  });

  it('suelta el objectURL de cada archivo, también si falla', async () => {
    fetchQueDevuelve([true, false]);
    const revocados: string[] = [];
    // `URL.revokeObjectURL` no existe en el entorno node de vitest.
    (globalThis.URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL =
      (u: string) => { revocados.push(u); };

    await subirPendientes(10, [
      { ...pendiente(-1, 'a.jpg'), previewUrl: 'blob:a' },
      { ...pendiente(-2, 'b.jpg'), previewUrl: 'blob:b' },
    ]);

    // Las dos, porque un blob no liberado se queda en memoria hasta recargar.
    expect(revocados).toEqual(['blob:a', 'blob:b']);
  });
});
