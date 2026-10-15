import { afterEach, describe, expect, it, vi } from 'vitest';
import { imprimirPdf } from '@/lib/reportes/imprimir-pdf';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function prepararMarco() {
  const marco = {
    setAttribute: vi.fn(),
    style: { cssText: '' },
    contentWindow: { focus: vi.fn(), print: vi.fn() },
    remove: vi.fn(),
    onload: null as null | (() => void),
    onerror: null as null | (() => void),
    src: '',
  };
  const appendChild = vi.fn();
  vi.stubGlobal('document', { createElement: vi.fn(() => marco), body: { appendChild } });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  return { marco, appendChild, revoke };
}

describe('imprimirPdf', () => {
  it('abre impresión sobre el PDF cargado y libera el recurso después', async () => {
    vi.useFakeTimers();
    const { marco, appendChild, revoke } = prepararMarco();
    const resultado = imprimirPdf(new Blob(['pdf'], { type: 'application/pdf' }));

    expect(appendChild).toHaveBeenCalledWith(marco);
    expect(marco.src).toBe('blob:test');
    marco.onload?.();
    await vi.advanceTimersByTimeAsync(500);
    await expect(resultado).resolves.toBeUndefined();
    expect(marco.contentWindow.focus).toHaveBeenCalledOnce();
    expect(marco.contentWindow.print).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(marco.remove).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });

  it('avisa y limpia si el navegador no permite imprimir', async () => {
    vi.useFakeTimers();
    const { marco, revoke } = prepararMarco();
    Object.assign(marco, { contentWindow: null });
    const resultado = imprimirPdf(new Blob(['pdf'], { type: 'application/pdf' }));
    const error = expect(resultado).rejects.toThrow('Este navegador no permite imprimir el PDF');

    marco.onload?.();
    await vi.advanceTimersByTimeAsync(500);
    await error;
    expect(marco.remove).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });

  it('intenta imprimir aunque el visor no dispare load', async () => {
    vi.useFakeTimers();
    const { marco } = prepararMarco();
    const resultado = imprimirPdf(new Blob(['pdf'], { type: 'application/pdf' }));

    await vi.advanceTimersByTimeAsync(3_000);
    await expect(resultado).resolves.toBeUndefined();
    expect(marco.contentWindow.print).toHaveBeenCalledOnce();
  });
});
