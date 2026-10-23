/**
 * El enlace de los avisos lleva a LA factura del mensaje, no a toda la deuda
 * de la familia, y el botón de WhatsApp recibe solo el final de la URL.
 */
import { describe, expect, it } from 'vitest';
import { enlaceDeFactura, facturaDelMensaje, sufijoDeBoton } from '@/lib/administracion-escolar/agrupar-avisos';

const m = (ecfDocumentId: number | null) => ({ fila: { ecfDocumentId } }) as never;

describe('facturaDelMensaje', () => {
  it('todos los cobros en la misma factura → esa', () => {
    expect(facturaDelMensaje([m(10), m(10), m(10)])).toBe(10);
  });
  it('varias facturas o algún cobro sin facturar → ninguna (va el de la familia)', () => {
    expect(facturaDelMensaje([m(10), m(11)])).toBeNull();
    expect(facturaDelMensaje([m(10), m(null)])).toBeNull();
    expect(facturaDelMensaje([m(null)])).toBeNull();
  });
});

describe('enlaceDeFactura y sufijoDeBoton', () => {
  const familia = 'https://app.zero.com.do/pagar/abcDEF123';
  it('acota a la factura con ?f=', () => {
    expect(enlaceDeFactura(familia, 10)).toBe(`${familia}?f=10`);
    expect(enlaceDeFactura(familia, null)).toBe(familia);
  });
  it('el botón recibe lo que va después de /pagar/', () => {
    expect(sufijoDeBoton(`${familia}?f=10`)).toBe('abcDEF123?f=10');
    expect(sufijoDeBoton(familia)).toBe('abcDEF123');
  });
});
