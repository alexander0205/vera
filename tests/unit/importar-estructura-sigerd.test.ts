import { describe, it, expect } from 'vitest';
import { partirNombreServicio } from '@/lib/administracion-escolar/importar-estructura-sigerd';

/**
 * Sigerd nombra los servicios metiendo tres cosas en una cadena: el nivel, la
 * resolución del Minerd que lo autoriza y la tanda. Los ejemplos son literales
 * de un colegio real; si el parseo falla, el nombre entero acaba en la factura
 * que ve el padre.
 */
describe('partirNombreServicio', () => {
  it('separa nivel y tanda, y descarta la resolución', () => {
    expect(partirNombreServicio("Primario - 01'2014 - MATUTINA"))
      .toEqual({ nombre: 'Primario', tanda: 'Matutina' });
  });

  it('aguanta varias resoluciones en el medio', () => {
    expect(partirNombreServicio("Secundario - 01'2014 y 03'99 - MATUTINA"))
      .toEqual({ nombre: 'Secundario', tanda: 'Matutina' });
  });

  it('conserva el nombre largo del bachillerato', () => {
    const r = partirNombreServicio("Bachillerato Académico en Humanidades y Ciencias Sociales - 22 ' 2017 - MATUTINA");
    expect(r.nombre).toBe('Bachillerato Académico en Humanidades y Ciencias Sociales');
    expect(r.tanda).toBe('Matutina');
  });

  it('deja la tanda en nulo cuando no la trae', () => {
    expect(partirNombreServicio('Primario')).toEqual({ nombre: 'Primario', tanda: null });
  });

  it('reconoce las demás tandas', () => {
    expect(partirNombreServicio('Primario - VESPERTINA').tanda).toBe('Vespertina');
    expect(partirNombreServicio('Primario - NOCTURNA').tanda).toBe('Nocturna');
  });

  it('no confunde una resolución final con una tanda', () => {
    // Si lo último no es una tanda conocida, no se inventa una.
    expect(partirNombreServicio("Inicial - 1'95 y 3'99").tanda).toBeNull();
  });

  it('no devuelve nunca un nombre vacío', () => {
    for (const crudo of ['', '   ', '-', ' - - ']) {
      expect(partirNombreServicio(crudo).nombre).toBe(crudo.trim());
    }
  });
});
