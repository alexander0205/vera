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
    contentWindow: {
      focus: vi.fn(), print: vi.fn(),
      oyentes: {} as Record<string, () => void>,
      addEventListener: vi.fn(function (this: { oyentes: Record<string, () => void> }, ev: string, cb: () => void) { this.oyentes[ev] = cb; }),
    },
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

    // Sigue vivo mientras el usuario está en el diálogo…
    await vi.advanceTimersByTimeAsync(60_000);
    expect(marco.remove).not.toHaveBeenCalled();
    // …y si el visor no avisa, se suelta igual al rato.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(marco.remove).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });

  it('suelta el PDF cuando el usuario cierra el diálogo de impresión', async () => {
    vi.useFakeTimers();
    const { marco, revoke } = prepararMarco();
    const resultado = imprimirPdf(new Blob(['pdf'], { type: 'application/pdf' }));
    marco.onload?.();
    await vi.advanceTimersByTimeAsync(500);
    await resultado;

    marco.contentWindow.oyentes.afterprint?.();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(marco.remove).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:test');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(marco.remove).toHaveBeenCalledOnce();
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
