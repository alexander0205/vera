/**
 * Pagos de la migración: el NCF se escribe con poco (se elige el prefijo y se
 * teclea el final) y el estado del mes sale de lo pagado. Pedido de Alex en el
 * standup del 29-oct-2026: «B01 y lo demás se va llenando».
 */
import { describe, expect, it } from 'vitest';
import { armarNcf, estadoDelPago, siguienteNcf } from '@/lib/administracion-escolar/pago-anterior-ncf';

describe('armarNcf', () => {
  it('rellena con ceros hasta la longitud de la serie', () => {
    expect(armarNcf('B01', '130')).toBe('B0100000130');
    expect(armarNcf('B02', '2266')).toBe('B0200002266');
    expect(armarNcf('E31', '7')).toBe('E310000000007');
  });

  it('respeta el NCF entero si se pegó completo', () => {
    expect(armarNcf('B01', 'B0200002171')).toBe('B0200002171');
    expect(armarNcf('B01', 'b01-0000-0130')).toBe('B0100000130');
  });

  it('rechaza lo que no es un número de la serie', () => {
    expect(armarNcf('B01', '')).toBeNull();
    expect(armarNcf('B01', '123456789')).toBeNull(); // 9 cifras en una serie de 8
    expect(armarNcf('B01', '12a')).toBeNull();
    expect(armarNcf('B01', 'B011')).toBeNull();
  });
});

describe('siguienteNcf', () => {
  it('propone el siguiente de la misma serie', () => {
    expect(siguienteNcf('B0100000130')).toBe('B0100000131');
    expect(siguienteNcf('E310000000099')).toBe('E310000000100');
  });
  it('no inventa uno fuera de la serie', () => {
    expect(siguienteNcf('B0199999999')).toBeNull();
    expect(siguienteNcf('ALG-B0100000130')).toBeNull();
  });
});

describe('estadoDelPago', () => {
  it('lo pagado decide si es todo o abono', () => {
    expect(estadoDelPago(300000, 300000)).toBe('pagado');
    expect(estadoDelPago(300000, 250000)).toBe('abono');
    expect(estadoDelPago(300000, 0)).toBe('debe');
  });
});
