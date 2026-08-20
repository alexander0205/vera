import { describe, it, expect } from 'vitest';
import { agruparProductos, raizConcepto } from '@/lib/administracion-escolar/agrupar-productos';

/**
 * El asistente que convierte el catálogo de facturación en conceptos. Los
 * nombres de abajo son los que factura de verdad un colegio con 66 productos:
 * si el agrupado falla, el colegio ve 60 conceptos en vez de 6 y no adopta la
 * pantalla.
 */
describe('raizConcepto', () => {
  it('iguala singular y plural', () => {
    expect(raizConcepto('Material gastable')).toBe(raizConcepto('Materiales gastables'));
  });

  it('ignora los códigos de instancia', () => {
    expect(raizConcepto('Material gastable 01')).toBe(raizConcepto('Material gastable 002'));
  });

  it('ignora el año escolar', () => {
    expect(raizConcepto('Inscripción 2025-2026')).toBe(raizConcepto('Inscripción'));
  });

  it('ignora tildes y mayúsculas', () => {
    expect(raizConcepto('INSCRIPCIÓN')).toBe(raizConcepto('inscripcion'));
  });
});

describe('agruparProductos', () => {
  it('colapsa las variantes de un mismo concepto', () => {
    const productos = [
      { nombre: 'Pago de colegiatura' },
      { nombre: 'Pago de colegiatura' },
      { nombre: 'Colegiatura Pre-primero' },
      { nombre: 'Pago de colegiatura 2P' },
      { nombre: 'Material gastable 01' },
      { nombre: 'Material gastable 02' },
      { nombre: 'Materiales gastables 2024' },
    ];
    const grupos = agruparProductos(productos);

    expect(grupos).toHaveLength(2);
    // El más numeroso primero: es el que el colegio reconoce.
    expect(grupos[0].productos).toBe(4);
  });

  it('propone el nombre sin el código de instancia', () => {
    const grupos = agruparProductos([
      { nombre: 'Material gastable 01' },
      { nombre: 'Material gastable 02' },
      { nombre: 'Material gastable 03' },
    ]);
    expect(grupos[0].nombre).toBe('Material gastable');
  });

  it('no propone lo que ya es concepto, aunque se llame distinto', () => {
    // Si el colegio ya tiene "Pago de colegiatura", proponerle "Colegiatura"
    // es proponerle un duplicado.
    const grupos = agruparProductos(
      [{ nombre: 'Colegiatura' }, { nombre: 'Colegiatura 1P' }],
      new Set([raizConcepto('Pago de colegiatura')]),
    );
    expect(grupos).toHaveLength(0);
  });

  it('no se inventa grupos con una lista vacía', () => {
    expect(agruparProductos([])).toEqual([]);
  });
});
