import { describe, expect, it } from 'vitest';
import { conEnlaces, urlDeFacturaEnLink } from '@/lib/administracion-escolar/avisos';

/**
 * El padre recibe el aviso en el teléfono y lo que necesita es abrir SU factura:
 * la de ese alumno y ese concepto. El enlace de la familia lleva a la lista de
 * todo lo pendiente; el de la factura, a la factura concreta del aviso.
 */

const FAMILIA = 'https://colegio.zero.com.do/pagar/abc123';
const largo = 'Ya está lista la factura de Matrícula de Zahel: RD$1,750.00.';

describe('urlDeFacturaEnLink', () => {
  it('acota el enlace de la familia a una factura con ?f=', () => {
    expect(urlDeFacturaEnLink(FAMILIA, 42)).toBe(`${FAMILIA}?f=42`);
  });
});

describe('conEnlaces', () => {
  it('con factura: lleva el enlace de ESA factura y el de la familia', () => {
    const t = conEnlaces(largo, { factura: `${FAMILIA}?f=42`, familia: FAMILIA });
    expect(t.startsWith(largo)).toBe(true);
    expect(t).toContain(`Ver tu factura: ${FAMILIA}?f=42`);
    expect(t).toContain(`Todo lo pendiente de tu familia: ${FAMILIA}`);
  });

  it('sin factura emitida: queda el texto de siempre, sin prometer una factura', () => {
    // Un cargo sin factura no se puede cobrar: no hay a dónde mandar al padre.
    expect(conEnlaces(largo, { factura: null, familia: null })).toBe(largo);
  });

  it('solo el enlace de la familia conserva el texto que ya existía', () => {
    expect(conEnlaces(largo, { factura: null, familia: FAMILIA }))
      .toBe(`${largo}\n\nPaga o sube tu comprobante aquí: ${FAMILIA}`);
  });

  it('el enlace de la factura va antes que el de la familia', () => {
    const t = conEnlaces(largo, { factura: `${FAMILIA}?f=7`, familia: FAMILIA });
    expect(t.indexOf('Ver tu factura')).toBeLessThan(t.indexOf('Todo lo pendiente'));
  });
});
