import { describe, it, expect } from 'vitest';
import { lineas, altoFila, paginar, MEDIDAS, type ItemListado } from '@/lib/pdf/paginar-listado';

type It = ItemListado<string, number>;

describe('estimar líneas y altos', () => {
  it('parte por palabras y cuenta las palabras más largas que la línea', () => {
    expect(lineas('corto', 100, 4)).toBe(1);
    expect(lineas('', 100, 4)).toBe(1);
    // 100pt − 6 → 23 caracteres por línea con letra de 4pt
    expect(lineas('aaaa bbbb cccc dddd eeee ffff', 100, 4)).toBe(2);
    expect(lineas('x'.repeat(50), 100, 4)).toBe(3);
  });

  it('las mayúsculas pesan más que las minúsculas', () => {
    const min = lineas('supermercado nacional con un nombre largo', 200, 3.9);
    const may = lineas('SUPERMERCADO NACIONAL CON UN NOMBRE LARGO', 200, 3.9);
    expect(may).toBeGreaterThan(min);
  });

  it('el alto de la fila lo manda la celda más alta, sumando la segunda línea gris', () => {
    const cols = [{ ancho: '50%' }, { ancho: '50%' }];
    const una = altoFila(['a', 'b'], cols);
    expect(una).toBeCloseTo(MEDIDAS.linea + MEDIDAS.paddingFila);
    expect(altoFila([{ texto: 'a', sub: 'rnc' }, 'b'], cols)).toBeCloseTo(2 * MEDIDAS.linea + MEDIDAS.paddingFila);
  });
});

describe('repartir en páginas', () => {
  const alto = () => 20;

  it('todo cabe → una página; mucho → varias, sin perder ni repetir items', () => {
    const pocas: It[] = Array.from({ length: 5 }, (_, i) => ({ tipo: 'fila', fila: i }));
    expect(paginar(pocas, alto, false)).toHaveLength(1);
    const muchas: It[] = Array.from({ length: 200 }, (_, i) => ({ tipo: 'fila', fila: i }));
    const pags = paginar(muchas, alto, false);
    expect(pags.length).toBeGreaterThan(5);
    expect(pags.flat().map(x => (x as { fila: number }).fila)).toEqual(muchas.map(x => (x as { fila: number }).fila));
  });

  it('un grupo chico no se parte entre páginas y un título no queda solo al pie', () => {
    const items: It[] = [];
    for (let g = 0; g < 60; g++) {
      items.push({ tipo: 'grupo', grupo: `g${g}` });
      for (let f = 0; f < 3; f++) items.push({ tipo: 'fila', fila: g * 10 + f });
    }
    for (const pag of paginar(items, alto, true)) {
      // Cada página empieza en un título de grupo y lleva grupos completos.
      expect(pag[0].tipo).toBe('grupo');
      expect(pag[pag.length - 1].tipo).toBe('fila');
      const titulos = pag.filter(x => x.tipo === 'grupo').length;
      expect(pag.length).toBe(titulos * 4);
    }
  });

  it('la primera página tiene menos sitio si lleva tarjetas', () => {
    const items: It[] = Array.from({ length: 300 }, (_, i) => ({ tipo: 'fila', fila: i }));
    expect(paginar(items, alto, true)[0].length).toBeLessThan(paginar(items, alto, false)[0].length);
  });
});
