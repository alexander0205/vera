import { describe, it, expect } from 'vitest';
import { parseDOPaCentavos, fmtDOP } from '@/lib/utils/format';

/**
 * El caso que motiva estas pruebas: el editor de precios leía la coma como
 * separador DECIMAL, así que escribir «1,100» —tal como el propio sistema
 * escribe el dinero— guardaba RD$1.10. Mil pesos menos al mes, sin un aviso,
 * y cobrados así hasta junio.
 */
describe('parseDOPaCentavos', () => {
  it('lee la coma como separador de miles, que es como el sistema escribe el dinero', () => {
    expect(parseDOPaCentavos('1,100')).toBe(110_000);
    expect(parseDOPaCentavos('2,800')).toBe(280_000);
    expect(parseDOPaCentavos('18,000')).toBe(1_800_000);
    expect(parseDOPaCentavos('1,234,567')).toBe(123_456_700);
  });

  it('acepta el punto decimal', () => {
    expect(parseDOPaCentavos('2800.50')).toBe(280_050);
    expect(parseDOPaCentavos('2,800.50')).toBe(280_050);
    expect(parseDOPaCentavos('0.05')).toBe(5);
  });

  it('reconoce la coma decimal a la europea solo con una o dos cifras detrás', () => {
    expect(parseDOPaCentavos('1100,50')).toBe(110_050);
    expect(parseDOPaCentavos('1100,5')).toBe(110_050);
    // Tres cifras detrás son miles, no decimales.
    expect(parseDOPaCentavos('1,100')).toBe(110_000);
  });

  it('da la vuelta a fmtDOP sin perder nada', () => {
    for (const centavos of [0, 5, 100, 280_000, 1_800_000, 123_456_789]) {
      const texto = fmtDOP(centavos).replace('RD$', '');
      expect(parseDOPaCentavos(texto)).toBe(centavos);
    }
  });

  it('devuelve null en vez de cero cuando no hay nada usable', () => {
    // El campo vacío mandaba 0, y un cargo en 0 salía marcado «pagado».
    expect(parseDOPaCentavos('')).toBeNull();
    expect(parseDOPaCentavos('   ')).toBeNull();
    expect(parseDOPaCentavos('abc')).toBeNull();
    expect(parseDOPaCentavos('.')).toBeNull();
    expect(parseDOPaCentavos('-500')).toBeNull();
  });

  it('cero es un número válido: quien decide si vale es quien llama', () => {
    expect(parseDOPaCentavos('0')).toBe(0);
  });

  it('aguanta espacios sueltos', () => {
    expect(parseDOPaCentavos(' 2,800.00 ')).toBe(280_000);
    expect(parseDOPaCentavos('2 800')).toBe(280_000);
  });
});
