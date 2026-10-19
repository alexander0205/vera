import { afterEach, describe, expect, it, vi } from 'vitest';
import { traerPaginas, notaDeCorte } from '@/lib/export/paginas';

function simular(paginas: number, opts: { fallaEn?: number } = {}) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url);
    const p = Number(new URL(url, 'http://x').searchParams.get('pagina'));
    if (p === opts.fallaEn) return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 });
    return new Response(JSON.stringify({ items: [p], total: paginas * 200, paginas }), { status: 200 });
  }));
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe('traerPaginas', () => {
  it('trae todas las páginas y solo la primera cuenta el total', async () => {
    const urls = simular(6);
    const r = await traerPaginas<number>((p) => `/api/x?pagina=${p}`, 'items');
    expect(r.filas).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.truncado).toBe(false);
    expect(urls[0]).not.toContain('sinTotal');
    expect(urls.slice(1).every((u) => u.includes('sinTotal=1'))).toBe(true);
  });

  it('dice que se cortó al pasar del tope', async () => {
    simular(60);
    const r = await traerPaginas<number>((p) => `/api/x?pagina=${p}`, 'items', { maxPaginas: 50 });
    expect(r.filas).toHaveLength(50);
    expect(r.truncado).toBe(true);
    expect(r.total).toBe(12000);
  });

  it('un error del servidor corta el exporte con su mensaje', async () => {
    simular(3, { fallaEn: 2 });
    await expect(traerPaginas((p) => `/api/x?pagina=${p}`, 'items')).rejects.toThrow('Sin permiso');
  });

  it('la nota del corte dice cuántas salieron de cuántas', () => {
    expect(notaDeCorte(10000, 12000)).toContain('10,000 de 12,000');
  });
});
