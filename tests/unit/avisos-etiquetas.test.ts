import { describe, expect, it } from 'vitest';
import { contarMensajes, entregaDe } from '@/lib/administracion-escolar/avisos-etiquetas';

describe('entregaDe', () => {
  it('respeta lo que dijo Meta', () => {
    expect(entregaDe('leido')).toBe('leido');
    expect(entregaDe('entregado')).toBe('entregado');
    expect(entregaDe('enviado')).toBe('enviado');
    expect(entregaDe('fallido')).toBe('fallido');
  });

  it('sin estado (correo, SMS o sin preguntar) es «sin acuse», no un fallo', () => {
    expect(entregaDe(null)).toBe('sin-acuse');
    expect(entregaDe(undefined)).toBe('sin-acuse');
    expect(entregaDe('otra-cosa')).toBe('sin-acuse');
  });
});

describe('contarMensajes', () => {
  it('cuenta una vez los cobros que viajaron en el mismo mensaje', () => {
    expect(contarMensajes([
      { id: 1, grupo: 'g1' }, { id: 2, grupo: 'g1' }, { id: 3, grupo: 'g1' },
      { id: 4, grupo: null }, { id: 5, grupo: null },
      { id: 6, grupo: 'g2' },
    ])).toBe(4);
  });

  it('sin filas, cero', () => {
    expect(contarMensajes([])).toBe(0);
  });
});
