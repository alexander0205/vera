import { describe, it, expect } from 'vitest';
import { leerPaginacion, armarPagina } from '@/lib/api/paginacion';

/**
 * La paginación la alimenta la barra de direcciones, así que recibe lo que sea:
 * páginas negativas, texto, tamaños absurdos. Nada de eso puede reventar una
 * pantalla ni permitir pedir la tabla entera.
 */
describe('leerPaginacion', () => {
  it('usa la primera página y 50 por defecto', () => {
    const p = leerPaginacion('http://x/api/cargos');
    expect(p.pagina).toBe(1);
    expect(p.porPagina).toBe(50);
    expect(p.offset).toBe(0);
  });

  it('calcula el desplazamiento', () => {
    const p = leerPaginacion('http://x/api/cargos?pagina=3&porPagina=20');
    expect(p.offset).toBe(40);
    expect(p.limit).toBe(20);
  });

  it('trata la basura como la primera página', () => {
    for (const url of ['?pagina=0', '?pagina=-5', '?pagina=abc', '?pagina=']) {
      expect(leerPaginacion(`http://x/a${url}`).pagina).toBe(1);
    }
  });

  it('no deja pedir la tabla entera', () => {
    // Sin tope, cualquiera se salta la paginación poniendo un número grande.
    expect(leerPaginacion('http://x/a?porPagina=99999').porPagina).toBe(200);
    expect(leerPaginacion('http://x/a?porPagina=0').porPagina).toBe(50);
    expect(leerPaginacion('http://x/a?porPagina=-3').porPagina).toBe(50);
  });
});

describe('armarPagina', () => {
  it('cuenta las páginas hacia arriba', () => {
    const p = leerPaginacion('http://x/a?porPagina=50');
    expect(armarPagina([], 101, p).paginas).toBe(3);
    expect(armarPagina([], 100, p).paginas).toBe(2);
  });

  it('siempre hay al menos una página, aunque esté vacía', () => {
    // Con 0 páginas el paginador dividiría por cero al pintar "1 de 0".
    const p = leerPaginacion('http://x/a');
    expect(armarPagina([], 0, p).paginas).toBe(1);
  });

  it('devuelve las filas y el total sin tocarlos', () => {
    const p = leerPaginacion('http://x/a?pagina=2&porPagina=10');
    const r = armarPagina([{ id: 1 }], 25, p);
    expect(r.datos).toEqual([{ id: 1 }]);
    expect(r.total).toBe(25);
    expect(r.pagina).toBe(2);
  });
});
