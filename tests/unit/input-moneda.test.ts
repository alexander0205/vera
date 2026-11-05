import { describe, expect, it } from 'vitest';
import { conMiles, limpiarMonto } from '@/components/ui/input-moneda';

/**
 * Teclear en la máscara de montos: cada tecla pasa por `limpiarMonto` con lo que
 * YA está pintado en el campo (con sus comas de miles). Un bug anterior leía la
 * coma como decimal y el monto dejaba de aceptar dígitos al pasar de mil
 * («2,500» + «1» → «2.50»). Aquí se teclea de a un carácter, como una persona.
 */

/** Simula teclear `texto` al final del campo, un carácter por vez. */
function teclear(texto: string, inicial = ''): string {
  let crudo = inicial;
  for (const c of texto) crudo = limpiarMonto(conMiles(crudo) + c);
  return crudo;
}

describe('limpiarMonto', () => {
  it('ignora la coma de miles en vez de leerla como decimal', () => {
    expect(limpiarMonto('2,5001')).toBe('25001');
    expect(limpiarMonto('1,250,000')).toBe('1250000');
  });

  it('un solo punto decimal y dos decimales como máximo', () => {
    expect(limpiarMonto('12.345')).toBe('12.34');
    expect(limpiarMonto('1.2.3')).toBe('1.23');
  });

  it('solo dígitos: letras y signos se descartan', () => {
    expect(limpiarMonto('-12e5')).toBe('125');
  });

  it('sin ceros a la izquierda, pero conserva «0.»', () => {
    expect(limpiarMonto('007')).toBe('7');
    expect(limpiarMonto('0.5')).toBe('0.5');
    expect(limpiarMonto('.5')).toBe('0.5');
  });
});

describe('teclear en el campo, carácter por carácter', () => {
  it('2500 llega a 2500 (no se queda en «2.50»)', () => {
    expect(teclear('2500')).toBe('2500');
  });

  it('un millón con centavos', () => {
    expect(teclear('1250000.55')).toBe('1250000.55');
    expect(conMiles(teclear('1250000.55'))).toBe('1,250,000.55');
  });

  it('seis cifras sin decimales', () => {
    expect(teclear('123456')).toBe('123456');
    expect(conMiles('123456')).toBe('123,456');
  });

  it('decimales: el tercero no entra', () => {
    expect(teclear('99.999')).toBe('99.99');
  });

  it('borrar un carácter con coma delante no rompe el número', () => {
    // «12,500» → se borra el último 0 → el campo queda «12,50»
    expect(limpiarMonto('12,50')).toBe('1250');
  });
});

describe('conMiles', () => {
  it('separa miles solo en el entero', () => {
    expect(conMiles('1000')).toBe('1,000');
    expect(conMiles('999')).toBe('999');
    expect(conMiles('1234567.8')).toBe('1,234,567.8');
    expect(conMiles('')).toBe('');
  });
});
