import { describe, expect, it } from 'vitest';
import { parametrosConEnlace } from '@/lib/whatsapp/plantillas';
import { unirNombres, parametrosPagoRecibido } from '@/lib/administracion-escolar/factura-al-padre';

/**
 * Meta rellena las variables POR POSICIÓN y rechaza el envío entero si el
 * número de parámetros no es el de la plantilla (132000). Por eso el enlace de
 * la factura solo se agrega cuando la plantilla asignada declara EXACTAMENTE una
 * variable más que los datos del aviso.
 */

const BASE = ['Colegio Andrés Bello', 'Mensualidad', 'Juan Pérez', 'RD$3,000.00', '10 de octubre', '(809) 590-6713'];
const LINK = 'https://colegio.zero.com.do/pagar/abc?f=42';

describe('parametrosConEnlace', () => {
  it('agrega el enlace al final cuando la plantilla tiene una variable más', () => {
    expect(parametrosConEnlace(BASE, LINK, BASE.length + 1)).toEqual([...BASE, LINK]);
  });

  it('no toca nada sin enlace (cargo sin factura)', () => {
    expect(parametrosConEnlace(BASE, null, BASE.length + 1)).toEqual(BASE);
  });

  it('no agrega si la plantilla no declara la variable del enlace', () => {
    // Una plantilla con el mismo número de variables que los datos: sumarle un
    // parámetro la haría fallar por «cantidad de parámetros».
    expect(parametrosConEnlace(BASE, LINK, BASE.length)).toEqual(BASE);
  });

  it('no agrega si no se sabe cuántas variables tiene la plantilla', () => {
    expect(parametrosConEnlace(BASE, LINK, null)).toEqual(BASE);
  });

  it('no agrega si la plantilla pide más de una variable extra', () => {
    expect(parametrosConEnlace(BASE, LINK, BASE.length + 2)).toEqual(BASE);
  });

  it('no muta el arreglo que recibe', () => {
    const copia = [...BASE];
    parametrosConEnlace(BASE, LINK, BASE.length + 1);
    expect(BASE).toEqual(copia);
  });
});

describe('unirNombres', () => {
  it('uno solo queda tal cual', () => {
    expect(unirNombres(['Juan Pérez'])).toBe('Juan Pérez');
  });

  it('dos van unidos con «y»', () => {
    expect(unirNombres(['Juan Pérez', 'María Pérez'])).toBe('Juan Pérez y María Pérez');
  });

  it('tres o más van con comas y la última con «y»', () => {
    expect(unirNombres(['Ana', 'Beto', 'Carla'])).toBe('Ana, Beto y Carla');
  });

  it('quita repetidos, vacíos y espacios', () => {
    expect(unirNombres([' Ana ', 'Ana', '', 'Beto'])).toBe('Ana y Beto');
  });

  it('sin nombres devuelve un respaldo legible, no una cadena vacía', () => {
    // Meta rechaza una variable vacía con 132000.
    expect(unirNombres([])).toBe('tu hijo(a)');
  });
});

describe('parametrosPagoRecibido', () => {
  const datos = {
    colegio: 'Colegio Andrés Bello', concepto: 'Colegiatura', estudiante: 'Juan Pérez',
    monto: 'RD$3,300.00', telefonoColegio: '(809) 590-6713', enlace: LINK,
  };

  it('va en el orden de la plantilla pago_recibido', () => {
    expect(parametrosPagoRecibido(datos)).toEqual([
      'Colegio Andrés Bello', 'Colegiatura', 'Juan Pérez', 'RD$3,300.00', '(809) 590-6713', LINK,
    ]);
  });

  it('ningún valor va vacío ni con saltos de línea', () => {
    const p = parametrosPagoRecibido({
      ...datos, colegio: '  ', concepto: 'Colegiatura\nmarzo', telefonoColegio: '',
    });
    for (const v of p) {
      expect(v.trim()).not.toBe('');
      expect(v).not.toMatch(/[\r\n]/);
    }
    expect(p[0]).toBe('tu colegio');
    expect(p[1]).toBe('Colegiatura marzo');
    expect(p[4]).toBe('el número del colegio');
  });
});
