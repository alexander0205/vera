import { describe, expect, it } from 'vitest';
import { limpiarMonto, mascaraMonto, posicionTrasMascara, significativosAntes } from '@/lib/utils/monto-mascara';

describe('limpiarMonto', () => {
  it('quita comas, símbolos y letras', () => {
    expect(limpiarMonto('RD$ 1,234.50')).toBe('1234.50');
    expect(limpiarMonto('abc')).toBe('');
    expect(limpiarMonto('-5')).toBe('5');
  });
  it('un solo punto y 2 decimales', () => {
    expect(limpiarMonto('1.2.3')).toBe('1.23');
    expect(limpiarMonto('10.999')).toBe('10.99');
    expect(limpiarMonto('.5')).toBe('0.5');
    expect(limpiarMonto('5.')).toBe('5.');
  });
  it('sin ceros a la izquierda y con tope de enteros', () => {
    expect(limpiarMonto('007')).toBe('7');
    expect(limpiarMonto('0')).toBe('0');
    expect(limpiarMonto('0.5')).toBe('0.5');
    expect(limpiarMonto('1'.repeat(20))).toBe('1'.repeat(12));
  });
  it('vacío y entradas raras', () => {
    expect(limpiarMonto('')).toBe('');
    expect(limpiarMonto('1e5')).toBe('15');
    expect(limpiarMonto('٣')).toBe('');
  });
});

describe('mascaraMonto', () => {
  it('agrupa miles', () => {
    expect(mascaraMonto('1234567.5')).toBe('1,234,567.5');
    expect(mascaraMonto('999')).toBe('999');
    expect(mascaraMonto('1000')).toBe('1,000');
    expect(mascaraMonto('1000.')).toBe('1,000.');
    expect(mascaraMonto('')).toBe('');
  });
  it('es idempotente sobre lo ya enmascarado', () => {
    expect(mascaraMonto('1,234,567.50')).toBe('1,234,567.50');
  });
});

describe('cursor', () => {
  it('conserva la posición entre comas', () => {
    // Se escribe un 5 entre «1,23» y «4»: el crudo es 12354 → «12,354».
    const significativos = significativosAntes('1,2354', 5);
    expect(significativos).toBe(4);
    expect(posicionTrasMascara('12,354', significativos)).toBe(5);
    expect(posicionTrasMascara('12,354', 0)).toBe(0);
    expect(posicionTrasMascara('12,354', 99)).toBe(6);
  });
});
