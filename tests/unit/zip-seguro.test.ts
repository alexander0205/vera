import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { revisarZip } from '@/lib/zip-seguro';

const LIM = { maxBytesDescomprimidos: 1024 * 1024, maxEntradas: 10 };
const buf = async (z: JSZip) => (await z.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })) as ArrayBuffer;

describe('revisarZip', () => {
  it('deja pasar un zip normal', async () => {
    const z = new JSZip();
    z.file('a.xml', 'x'.repeat(1000));
    z.file('b.xml', 'y'.repeat(1000));
    expect(revisarZip(await buf(z), LIM)).toEqual({ ok: true });
  });

  it('rechaza una bomba zip: pesa poco y se descomprime a mucho', async () => {
    const z = new JSZip();
    z.file('sheet1.xml', ' '.repeat(5 * 1024 * 1024));
    const b = await buf(z);
    expect(b.byteLength).toBeLessThan(20_000);
    const r = revisarZip(b, LIM);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/descomprime/);
  });

  it('rechaza demasiadas partes', async () => {
    const z = new JSZip();
    for (let i = 0; i < 11; i++) z.file(`f${i}.txt`, 'x');
    const r = revisarZip(await buf(z), LIM);
    expect(r.ok).toBe(false);
  });

  it('rechaza lo que no es un zip o está truncado', async () => {
    for (const bytes of [new TextEncoder().encode('esto no es un excel, es texto'), new Uint8Array(5), new Uint8Array(0)]) {
      expect(revisarZip(bytes.buffer as ArrayBuffer, LIM).ok).toBe(false);
    }
    const z = new JSZip(); z.file('a', 'x'.repeat(5000));
    const b = await buf(z);
    expect(revisarZip(b.slice(0, b.byteLength - 10), LIM).ok).toBe(false);
  });
});
