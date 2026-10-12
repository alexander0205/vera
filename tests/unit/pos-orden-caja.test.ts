/**
 * El orden de la grilla del punto de venta.
 *
 * Se prueba porque el fallo es mudo: nadie ve un error, solo que la caja está
 * más lenta. Mi Casita II llegó a tener siete abrigos sin existencias por
 * delante de la mercancía que sí se vende, y quien atiende no tiene forma de
 * saber que eso se puede cambiar — lo asume y sigue rebuscando.
 */

import { describe, it, expect } from 'vitest';
import { estaAgotado, compararParaCaja } from '@/lib/pos/agotado';

const producto = (p: Partial<Parameters<typeof compararParaCaja>[0]> = {}) => ({
  nombre:               'X',
  favorito:             false,
  controlaInventario:   true,
  permiteVentaSinStock: false,
  stockAlmacen:         10,
  ...p,
});

describe('estaAgotado', () => {
  it('un producto sin control de inventario nunca se agota', () => {
    expect(estaAgotado(producto({ controlaInventario: false, stockAlmacen: null }))).toBe(false);
    expect(estaAgotado(producto({ controlaInventario: false, stockAlmacen: 0 }))).toBe(false);
  });

  it('si admite vender sin stock, en cero se sigue pudiendo cobrar', () => {
    expect(estaAgotado(producto({ permiteVentaSinStock: true, stockAlmacen: 0 }))).toBe(false);
  });

  it('lleva inventario, no admite vender en rojo y no queda: agotado', () => {
    expect(estaAgotado(producto({ stockAlmacen: 0 }))).toBe(true);
  });

  it('un stock negativo cuenta como agotado, no como existencias', () => {
    expect(estaAgotado(producto({ stockAlmacen: -3 }))).toBe(true);
  });
});

describe('compararParaCaja', () => {
  const ordenar = (ps: Parameters<typeof compararParaCaja>[0][]) =>
    [...ps].sort(compararParaCaja).map(p => p.nombre);

  it('manda lo agotado al final aunque alfabéticamente fuera primero', () => {
    expect(ordenar([
      producto({ nombre: 'ABRIGO',   stockAlmacen: 0 }),
      producto({ nombre: 'Empanada', stockAlmacen: 5 }),
    ])).toEqual(['Empanada', 'ABRIGO']);
  });

  it('un favorito agotado también baja: favorito no es "se puede cobrar"', () => {
    expect(ordenar([
      producto({ nombre: 'Hot Dog',  favorito: true,  stockAlmacen: 0 }),
      producto({ nombre: 'Zumo',     favorito: false, stockAlmacen: 5 }),
    ])).toEqual(['Zumo', 'Hot Dog']);
  });

  it('entre disponibles, los favoritos primero', () => {
    expect(ordenar([
      producto({ nombre: 'Agua',     favorito: false }),
      producto({ nombre: 'Zumo',     favorito: true  }),
    ])).toEqual(['Zumo', 'Agua']);
  });

  it('a igualdad de todo, alfabético en español', () => {
    expect(ordenar([
      producto({ nombre: 'Ñoquis' }),
      producto({ nombre: 'Nuez'   }),
      producto({ nombre: 'Ácido'  }),
    ])).toEqual(['Ácido', 'Nuez', 'Ñoquis']);
  });

  it('el caso real de Mi Casita: los 8 sin existencias, al fondo', () => {
    const catalogo = [
      producto({ nombre: 'ABRIGO',         stockAlmacen: 0 }),
      producto({ nombre: 'PANTALON CAQUÍ', stockAlmacen: 0 }),
      producto({ nombre: 'Galleta Oreo',   stockAlmacen: 25 }),
      producto({ nombre: 'Empanada',       favorito: true, controlaInventario: false, stockAlmacen: null }),
      producto({ nombre: 'WILLY JELLY',    stockAlmacen: 40 }),
    ];
    expect(ordenar(catalogo)).toEqual([
      'Empanada',        // favorito y vendible
      'Galleta Oreo',
      'WILLY JELLY',
      'ABRIGO',          // agotados, al final
      'PANTALON CAQUÍ',
    ]);
  });

  it('es un orden estable y total: ordenar dos veces no cambia nada', () => {
    const catalogo = [
      producto({ nombre: 'B', stockAlmacen: 0 }),
      producto({ nombre: 'A', favorito: true }),
      producto({ nombre: 'C' }),
      producto({ nombre: 'A', stockAlmacen: 0 }),
    ];
    const una = [...catalogo].sort(compararParaCaja);
    const dos = [...una].sort(compararParaCaja);
    expect(dos).toEqual(una);
  });
});
