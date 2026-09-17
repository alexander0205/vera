import { describe, it, expect } from 'vitest';
import { parsearQrDgii, normalizarExtraccion } from '@/lib/compras/extraer-ticket';

describe('parsearQrDgii', () => {
  it('lee un QR de e-CF de la DGII y pasa el monto de pesos a centavos', () => {
    const url = 'https://ecf.dgii.gov.do/ecf/consultatimbre?RncEmisor=101023031&ENCF=E310000000123&FechaEmision=15-09-2026&MontoTotal=1180.00';
    const r = parsearQrDgii(url);
    expect(r).not.toBeNull();
    expect(r!.datos.proveedorRnc).toBe('101023031');
    expect(r!.datos.ncf).toBe('E310000000123');
    expect(r!.datos.fecha).toBe('2026-09-15');
    // RD$1,180.00 -> 118000 centavos (NO 1180)
    expect(r!.datos.totalCents).toBe(118000);
  });

  it('ignora una URL que no es de la DGII', () => {
    expect(parsearQrDgii('https://example.com/?RncEmisor=1&MontoTotal=5')).toBeNull();
  });

  it('ignora un QR de la DGII sin RNC ni NCF', () => {
    expect(parsearQrDgii('https://ecf.dgii.gov.do/ecf/consultatimbre?otro=1')).toBeNull();
  });

  it('ignora texto que no es una URL', () => {
    expect(parsearQrDgii('no soy una url')).toBeNull();
    expect(parsearQrDgii(null)).toBeNull();
  });
});

describe('normalizarExtraccion', () => {
  it('normaliza la salida de la IA (centavos ya enteros, RNC a dígitos)', () => {
    const r = normalizarExtraccion({
      proveedorNombre: '  Farmacia Carol ',
      proveedorRnc: '101-02303-1',
      ncf: 'B0100002381',
      fecha: '2026-09-15',
      subtotalCents: 85000,
      itbisCents: 15300,
      totalCents: 100300,
      lineas: [{ descripcion: 'Alcohol', cantidad: 1, costoUnitarioCents: 35000 }],
    });
    expect(r.datos.proveedorNombre).toBe('Farmacia Carol');
    expect(r.datos.proveedorRnc).toBe('101023031');
    expect(r.datos.totalCents).toBe(100300);
    expect(r.datos.lineas).toHaveLength(1);
    expect(r.avisos).toHaveLength(0);
  });

  it('tolera montos como string con separadores', () => {
    const r = normalizarExtraccion({ totalCents: '1,003', ncf: null, lineas: [] });
    expect(r.datos.totalCents).toBe(1003);
  });

  it('convierte fecha DD/MM/YYYY a ISO', () => {
    const r = normalizarExtraccion({ fecha: '15/09/2026', ncf: null, lineas: [] });
    expect(r.datos.fecha).toBe('2026-09-15');
  });

  it('avisa cuando el año de la fecha está lejos del actual (misread de foto)', () => {
    const anioViejo = new Date().getFullYear() - 6; // ej. 2026 -> 2020
    const r = normalizarExtraccion({ fecha: `${anioViejo}-09-18`, ncf: null, totalCents: 100, lineas: [] });
    expect(r.datos.fecha).toBe(`${anioViejo}-09-18`); // no se corrige, solo se avisa
    expect(r.avisos.some((a) => /fecha parece mal le/i.test(a))).toBe(true);
  });

  it('no avisa cuando el año está dentro de ±1 del actual', () => {
    const anio = new Date().getFullYear();
    const r = normalizarExtraccion({ fecha: `${anio}-09-18`, ncf: null, totalCents: 100, lineas: [] });
    expect(r.avisos.some((a) => /fecha parece mal le/i.test(a))).toBe(false);
  });

  it('avisa cuando falta el total y cuando el RNC es inválido', () => {
    const r = normalizarExtraccion({ proveedorRnc: '123', totalCents: null, ncf: null, lineas: [] });
    expect(r.datos.totalCents).toBeNull();
    expect(r.avisos.some((a) => /total/i.test(a))).toBe(true);
    expect(r.avisos.some((a) => /RNC|cédula/i.test(a))).toBe(true);
  });
});
